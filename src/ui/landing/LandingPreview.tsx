// The landing preview: the community fair replay in the game view and the paired result line beside it. Everything shown comes
// from the real engine through the session's SimulationClient: replication 0 of the baseline with a trace for the picture, and
// the paired comparison of the baseline against the second example for the sentence. Nothing here advances model state.
import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { REPLICATIONS } from '../../comparison/replications';
import { replayLabel } from '../../comparison/labels';
import { runPairedComparison, type ComparisonHandle } from '../../comparison/runner';
import type { Scenario } from '../../domain/scenario';
import { formatMinutesSeconds } from '../../replay/format';
import type { createGameView, GameViewHandle } from '../../replay/gameView';
import { NOT_A_FORECAST } from '../../exports/assumptions-text';
import type { SimulationClient } from '../../workers/client';
import { isReducedMotion } from '../game/motion';
import { LEGEND } from '../game/GameViewPanel';
import { registerView } from '../game/viewRegistry';
import type { EditorStore } from '../state/store';
import type { LoadExampleResult } from './loadExample';
import { previewHeadline, type PreviewHeadline } from './previewHeadline';

export type LandingPreviewDeps = { client: SimulationClient; createView: typeof createGameView };

/** Reduced motion shows one still frame at this simulated time. */
export const STILL_FRAME_MS = 300_000;
/** The moving replay loops between these simulated times at this speed: Harbor Hall's arrivals are even over 20 minutes, so the first minutes are empty. */
export const LOOP_START_MS = 240_000;
export const LOOP_END_MS = 960_000;
export const PLAY_SPEED = 4;
const GENERIC_DESCRIPTION = 'Dots are attendees. They walk in from the entrance, wait in a line at each station in turn, and walk out to the exit.';
type Paired = 'running' | 'done' | 'failed';

function describe(scenario: Scenario): string {
  const route = scenario.cohorts[0]?.route ?? [];
  const labels = route.map((id) => scenario.stations.find((s) => s.id === id)?.label).filter((l): l is string => l !== undefined);
  if (labels.length === 0) return GENERIC_DESCRIPTION;
  return `Dots are attendees. They walk in from the entrance, wait in a line at ${labels.join(' then ')}, and walk out to the exit.`;
}

export function LandingPreview({ store, client, createView, examples }: LandingPreviewDeps & { store: EditorStore; examples: () => Promise<LoadExampleResult> }): ReactElement {
  const headingId = useId();
  const descriptionId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const [reduced] = useState(() => isReducedMotion(store.getState().prefs));
  const [paired, setPaired] = useState<Paired>('running');
  const [headline, setHeadline] = useState<PreviewHeadline | null>(null);
  const [description, setDescription] = useState(GENERIC_DESCRIPTION);
  const [viewFailed, setViewFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    let cancelled = false;
    let handle: GameViewHandle | null = null;
    let replayPending = false;
    let comparison: ComparisonHandle | null = null;
    const offs: (() => void)[] = [];
    const showClock = (ms: number): void => {
      if (clockRef.current !== null) clockRef.current.textContent = formatMinutesSeconds(ms);
    };
    const isReduced = (): boolean => isReducedMotion(store.getState().prefs);

    // The view starts while the files load and the replay runs.
    const viewReady = Promise.resolve().then(() => createView({
      container,
      reducedMotion: isReduced(),
      isReducedMotion: isReduced,
      test: import.meta.env.VITE_REHEARSAL_TEST === '1',
      dpr: window.devicePixelRatio || 1,
    })).then((created) => {
      if (cancelled) {
        if (created.ok) created.handle.destroy();
        return null;
      }
      if (!created.ok) {
        setViewFailed(true);
        return null;
      }
      const live = created.handle;
      handle = live;
      let shown = -1;
      offs.push(live.onClock((ms) => {
        if (cancelled) return;
        if (ms >= LOOP_END_MS && !isReduced()) {
          shown = -1;
          live.seek(LOOP_START_MS);
          showClock(LOOP_START_MS);
          return;
        }
        const whole = Math.floor(ms / 1000);
        if (whole !== shown) {
          shown = whole;
          showClock(ms);
        }
      }));
      registerView(handle);
      return handle;
    }).catch(() => {
      if (!cancelled) setViewFailed(true);
      return null;
    });

    // Nothing that goes wrong in the preview may break the landing: a missing worker or canvas leaves the rest as it was.
    void (async () => {
      const loaded = await examples();
      if (cancelled || !loaded.ok) return;
      const baseline = loaded.scenarios[0];
      const candidate = loaded.scenarios[1];
      if (baseline === undefined || candidate === undefined) return;
      setDescription(describe(baseline));

      const replayRun = client.run(baseline, [0], { trace: true });
      replayPending = true;
      const outcome = await replayRun.done;
      replayPending = false;
      if (cancelled) return;
      const replay = outcome.status === 'complete' ? outcome.results[0] : undefined;
      const view = await viewReady;
      if (cancelled) return;
      if (view !== null && replay?.trace !== undefined) {
        view.load({ trace: replay.trace, layout: baseline.layout, stations: baseline.stations, label: baseline.title });
        if (isReduced()) {
          view.setSpeed(1);
          view.seek(STILL_FRAME_MS);
          view.pause();
          showClock(STILL_FRAME_MS);
        } else {
          view.seek(LOOP_START_MS);
          view.setSpeed(PLAY_SPEED);
          view.play();
          showClock(LOOP_START_MS);
        }
      }

      comparison = runPairedComparison(client, baseline, candidate, { replayReplication: 0 });
      const finished = await comparison.done;
      if (cancelled) return;
      if (finished.status === 'complete') {
        setHeadline(previewHeadline(finished.comparison));
        setPaired('done');
      } else if (finished.status === 'error') {
        setPaired('failed');
      }
    })().catch(() => {
      if (!cancelled) setPaired('failed');
    });

    return () => {
      cancelled = true;
      for (const off of offs) off();
      try {
        comparison?.cancel();
        if (replayPending) client.cancel();
      } catch {
        /* a client that cannot start has nothing to cancel */
      }
      registerView(null);
      handle?.destroy();
      handle = null;
    };
  }, [client, createView, examples, store]);

  return (
    <section className="panel landing-preview" aria-labelledby={headingId} data-testid="landing-preview" data-paired={paired}>
      <h2 id={headingId}>Game view</h2>
      <p className="muted">{replayLabel(0)}</p>
      <div className="landing-preview-grid">
        <div className="landing-replay" data-landing-part="replay">
          <div className="game-wrapper landing-canvas" role="img" aria-label="Replay of the Harbor Hall community fair" aria-describedby={descriptionId} data-testid="landing-canvas">
            <div ref={containerRef} className="game-canvas" />
          </div>
          <p id={descriptionId}>{description}</p>
          {viewFailed ? <p>The picture could not start in this browser. The result line below still comes from the run.</p> : null}
          <p data-testid="landing-clock" className="muted">
            {'Simulated time '}
            <span ref={clockRef}>{formatMinutesSeconds(reduced ? STILL_FRAME_MS : LOOP_START_MS)}</span>
            {reduced ? ', paused because motion is reduced' : `, playing at ${PLAY_SPEED}\u00d7`}
          </p>
          <p className="muted legend">
            <span className="wait-ramp" aria-hidden="true" />
            {LEGEND}
          </p>
        </div>
        <div className="landing-result" data-landing-part="result">
          {headline !== null ? (
            <>
              <p className="landing-headline" data-testid="landing-result">{headline.text}</p>
              {headline.note === null ? null : <p className="muted">{headline.note}</p>}
            </>
          ) : paired === 'running' ? (
            <p className="muted">{`Running ${REPLICATIONS} paired runs.`}</p>
          ) : null}
          <p className="muted">The Harbor Hall Community Fair is fictional and illustrative.</p>
          <p className="muted">{NOT_A_FORECAST}</p>
        </div>
      </div>
    </section>
  );
}
