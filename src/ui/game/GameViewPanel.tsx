// Game view panel (requirements 6.1, 6.2, 6.4, 6.5, 6.8, 6.9, 7.1 to 7.7, 9.4). It owns the DOM around the canvas: the header,
// the control row, the wrapper with the key help, the legend and banners, Find attendee, the person timeline and the queue
// inspector. The controls call the handle; the timeline, the inspector and Find attendee read the sampler, so they keep working
// when the canvas cannot start. The panel never changes a number and never writes the status region while the clock plays.
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactElement } from 'react';
import { createGameView, type GameViewHandle, type SamplerOnly } from '../../replay/gameView';
import { PER_PERSON_OFF, REPLAY_NOTE } from '../../comparison/labels';
import { attendeePairs, type PopulationChange } from '../../comparison/population';
import { GHOST_LEGEND, type ReplaySelection } from '../../comparison/replay-contract';
import type { Scenario } from '../../domain/scenario';
import { formatMinutesSeconds, formatTimestamp } from '../../replay/format';
import { timelineOf, type Sample } from '../../replay/sampler';
import { buildIndex } from '../../replay/traceIndex';
import { STALE_LABEL, resultsStatus } from '../state/selectors';
import type { EditorStore } from '../state/store';
import { useEditorState } from '../state/useEditorState';
import { FindAttendee } from './FindAttendee';
import { isReducedMotion } from './motion';
import { PersonTimeline } from './PersonTimeline';
import { QueueInspector } from './QueueInspector';
import { WaitingChart } from './WaitingChart';
import { waitingPerMinute } from '../../replay/waitingSeries';
import { onRestartRequest, registerView, unavailableView } from './viewRegistry';

export const GAME_KEY_HELP = 'Space plays or pauses, ArrowLeft and ArrowRight step one second, F follows the selected attendee, Escape releases, Tab leaves the game view.';
export const LEGEND = 'Line colour shows simulated waiting, not measured crowd density.';
export const FALLBACK_BANNER = 'The game view could not start in this browser. The timeline and result tables have every number.';
const SPRITE_CAP = 1000;
const SPEEDS = [1, 4, 16] as const;
const TIMES = '\u00d7';

type ViewState = { mode: 'none' } | { mode: 'canvas'; handle: GameViewHandle } | { mode: 'fallback'; sampler: SamplerOnly };
/** The Compare screen's replay: the candidate layer is the panel's own, the baseline is the ghost (requirement 12.4). */
export type GhostProps = {
  selection: ReplaySelection;
  candidate: Scenario;
  candidateHash: string;
  baseline: Scenario;
  languageMode: 'person-for-person' | 'population';
  population: PopulationChange;
};
type Props = { store: EditorStore; createView?: typeof createGameView; ghost?: GhostProps };

const EMPTY: Sample = { tMs: 0, attendees: [], perStation: {}, arrived: 0, exited: 0 };

export function GameViewPanel({ store, createView = createGameView, ghost }: Props): ReactElement {
  const state = useEditorState(store);
  const stored = state.results[state.currentIndex];
  const result = useMemo(
    () =>
      ghost !== undefined
        ? ({ status: 'fresh', result: ghost.selection.candidate, snapshot: ghost.candidate, hash: ghost.candidateHash, completedAt: '' } as const)
        : stored === undefined || stored.status === 'none' ? null : stored,
    [ghost, stored],
  );
  const stale = ghost === undefined && resultsStatus(state, state.currentIndex) === 'stale';
  const reduced = isReducedMotion(state.prefs);
  const helpId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<ViewState>({ mode: 'none' });
  const [generation, setGeneration] = useState(0);
  const [clock, setClock] = useState({ ms: 0, playing: false });
  const [speed, setSpeed] = useState<1 | 4 | 16>(1);
  const [attendee, setAttendee] = useState<string | null>(null);
  const [following, setFollowing] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<unknown>(null);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const index = useMemo(() => (result === null || result.result.trace === undefined ? null : buildIndex(result.result.trace, result.snapshot.stations)), [result?.result]);
  const chartEndMs = ghost?.selection.clock.endMs ?? index?.endMs ?? 0;
  const waitingSeries = useMemo(() => (index === null ? null : waitingPerMinute(index, chartEndMs)), [index, chartEndMs]);
  const attendeeIds = useMemo(() => (index === null ? [] : index.attendees.map((a) => a.id)), [index]);
  const labels = useMemo(() => Object.fromEntries((result?.snapshot.stations ?? []).map((s) => [s.id, s.label])), [result?.snapshot]);
  // The heading appears once the trace is loaded into the view, so everything below it is in place when it shows.
  const ready = result === null || result.result.trace === undefined || loadedFor === result.result;

  // Create the view when the panel mounts, so it is ready before a run finishes; destroy it on unmount. A new generation restarts it.
  useEffect(() => {
    if (containerRef.current === null) return undefined;
    let cancelled = false;
    let handle: GameViewHandle | null = null;
    const offs: (() => void)[] = [];
    void createView({
      container: containerRef.current,
      reducedMotion: reducedRef.current,
      test: import.meta.env.VITE_REHEARSAL_TEST === '1',
      dpr: window.devicePixelRatio || 1,
    }).then((created) => {
      if (cancelled) {
        if (created.ok) created.handle.destroy();
        return;
      }
      if (created.ok) {
        handle = created.handle;
        offs.push(handle.onClock((ms, playing) => setClock({ ms, playing })));
        offs.push(
          handle.onHit((hit) => {
            if (hit.kind === 'station') store.dispatch({ type: 'select', selection: { kind: 'station', id: hit.id } });
            else {
              setAttendee(hit.id);
              handle?.select(hit);
            }
          }),
        );
        offs.push(
          handle.onFollowEnd((id, exitedAtMs) => {
            setFollowing(null);
            store.setStatus(`${id} exited at ${formatMinutesSeconds(exitedAtMs)}; follow released.`);
          }),
        );
        registerView(handle);
        setView({ mode: 'canvas', handle });
      } else {
        offs.push(created.sampler.onClock((ms, playing) => setClock({ ms, playing })));
        registerView(unavailableView());
        setView({ mode: 'fallback', sampler: created.sampler });
      }
    });
    return () => {
      cancelled = true;
      for (const off of offs) off();
      registerView(null);
      handle?.destroy();
      setView({ mode: 'none' });
    };
  }, [generation, createView, store]);

  // Every new result is loaded at clock 0: playing at 1x, or paused under reduced motion. Follow starts off.
  useEffect(() => {
    if (view.mode === 'none' || result === null || result.result.trace === undefined) return;
    const input = {
      trace: result.result.trace,
      layout: result.snapshot.layout,
      stations: result.snapshot.stations,
      label: ghost === undefined ? result.snapshot.title : ghost.selection.label,
      ...(ghost === undefined ? {} : { endMs: ghost.selection.clock.endMs }),
    };
    setFollowing(null);
    setAttendee(null);
    if (view.mode === 'canvas') {
      view.handle.load(input);
      if (ghost !== undefined) view.handle.setGhost(ghost.selection.baseline.trace ?? null, ghost.baseline.stations);
      if (reducedRef.current) view.handle.pause();
      else view.handle.play();
      setClock({ ms: 0, playing: !reducedRef.current });
    } else {
      view.sampler.load(input);
      setClock({ ms: 0, playing: false });
    }
    setLoadedFor(result.result);
  }, [view, result?.result, ghost?.selection]);

  // The scrubber also listens to native input and change events: a value set by script and announced with an event (as an
  // assistive tool or a test may do) must move the clock even when React's own change tracking does not see a change.
  const seekRef = useRef<(ms: number) => void>(() => undefined);
  seekRef.current = (ms: number) => {
    if (!Number.isFinite(ms)) return;
    sampler?.seek(ms);
    setClock((c) => ({ ...c, ms }));
  };
  useEffect(() => {
    const el = scrubberRef.current;
    if (el === null) return undefined;
    const onNative = (): void => seekRef.current(Number(el.value));
    el.addEventListener('input', onNative);
    el.addEventListener('change', onNative);
    return () => {
      el.removeEventListener('input', onNative);
      el.removeEventListener('change', onNative);
    };
  }, [result !== null]);

  // The test hook's forceRendererFailure(true) restarts the view so the failure takes effect on the view that is showing.
  useEffect(() => onRestartRequest(() => setGeneration((g) => g + 1)), []);

  const selectedStation = state.selection.kind === 'station' ? state.selection.id : null;
  useEffect(() => {
    if (view.mode === 'canvas') view.handle.select(selectedStation === null ? null : { kind: 'station', id: selectedStation });
  }, [view, selectedStation]);

  const canvas = view.mode === 'canvas' ? view.handle : null;
  const sampler = view.mode === 'canvas' ? view.handle : view.mode === 'fallback' ? view.sampler : null;
  const sample = sampler === null ? EMPTY : sampler.sampleNow();
  const endMs = ghost?.selection.clock.endMs ?? index?.endMs ?? 0;
  const present = sample.arrived - sample.exited;

  const togglePlay = (): void => {
    if (canvas === null) return;
    const playing = !clock.playing;
    if (playing) canvas.play();
    else canvas.pause();
    setClock((c) => ({ ...c, playing }));
  };
  const stepBy = (delta: 1000 | -1000): void => {
    sampler?.step(delta);
    setClock((c) => ({ ...c, ms: Math.min(endMs, Math.max(0, c.ms + delta)) }));
  };
  const followAttendee = (id: string): void => {
    if (canvas === null) return;
    canvas.follow(id);
    setFollowing(id);
    store.setStatus(`Following ${id}. Press Escape to release.`);
  };
  const release = (): void => {
    if (following === null) return;
    canvas?.follow(null);
    setFollowing(null);
    store.setStatus('Follow released.');
  };
  const toggleFollow = (): void => {
    if (following !== null) release();
    else if (attendee !== null) followAttendee(attendee);
  };
  const pick = (id: string): void => {
    setAttendee(id);
    canvas?.select({ kind: 'attendee', id });
  };

  const onWrapperKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ') togglePlay();
    else if (e.key === 'ArrowRight') stepBy(1000);
    else if (e.key === 'ArrowLeft') stepBy(-1000);
    else if (e.key === 'f' || e.key === 'F') toggleFollow();
    else return;
    e.preventDefault();
  };
  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape' && following !== null) {
      e.preventDefault();
      release();
    }
  };

  const playUnavailable = canvas === null;
  const playButton = (
    <button key="play" type="button" aria-disabled={playUnavailable ? 'true' : undefined} onClick={togglePlay}>
      {clock.playing ? 'Pause' : 'Play'}
    </button>
  );
  const speedGroup = (
    <div key="speed" role="radiogroup" aria-label="Speed" className="speed">
      <span aria-hidden="true">Speed</span>
      {SPEEDS.map((s) => (
        <label key={s}>
          <input
            type="radio"
            name="replay-speed"
            aria-label={`${s}${TIMES}`}
            checked={speed === s}
            onChange={() => {
              setSpeed(s);
              canvas?.setSpeed(s);
            }}
          />{' '}
          {`${s}${TIMES}`}
        </label>
      ))}
    </div>
  );
  const stepControls = [
    <button key="back" type="button" onClick={() => stepBy(-1000)}>Step back</button>,
    <button key="forward" type="button" onClick={() => stepBy(1000)}>Step forward</button>,
    <input
      key="scrub"
      type="range"
      aria-label="Simulated time"
      min={0}
      max={endMs}
      step={1000}
      value={Math.min(clock.ms, endMs)}
      ref={scrubberRef}
      style={{ '--fill': `${endMs === 0 ? 0 : (Math.min(clock.ms, endMs) / endMs) * 100}%` } as CSSProperties}
      onChange={(e) => seekRef.current(Number(e.target.value))}
    />,
    <span key="readout">{`${formatMinutesSeconds(clock.ms)} / ${formatMinutesSeconds(endMs)}`}</span>,
  ];
  const followButton = (
    <button key="follow" type="button" aria-pressed={following !== null} aria-disabled={canvas === null || (following === null && attendee === null) ? 'true' : undefined} onClick={toggleFollow}>
      Follow
    </button>
  );

  const inspected = selectedStation === null ? null : result?.snapshot.stations.find((s) => s.id === selectedStation) ?? null;
  const rows = index === null || attendee === null ? [] : timelineOf(index, attendee, labels);
  // The baseline's own numbers for the selected attendee, only when both runs admit the same people (12.4).
  const baselineRow = useMemo(() => {
    if (ghost === undefined || ghost.languageMode !== 'person-for-person' || attendee === null) return null;
    const pairs = attendeePairs(ghost.selection, ghost.population);
    const pair = pairs.ok ? pairs.pairs.find((p) => p.id === attendee) : undefined;
    if (pair === undefined) return null;
    const time = (ms: number | null): string => (ms === null ? 'n/a' : formatTimestamp(ms));
    return `Baseline: waited ${time(pair.baselineWaitMs)} \u00b7 journey ${time(pair.baselineJourneyMs)}`;
  }, [ghost, attendee]);

  const wrapper = (
    <div
      className="game-wrapper"
      tabIndex={0}
      role="application"
      aria-label="Game view"
      aria-describedby={`${helpId}-help`}
      onKeyDown={onWrapperKey}
    >
      <div ref={containerRef} className="game-canvas" />
    </div>
  );

  return (
    <section className="panel game-view" aria-labelledby={`${helpId}-heading`} onKeyDown={onPanelKey} data-testid="game-view-panel">
      {ready ? <h2 id={`${helpId}-heading`} aria-label="Game view">Game view{result === null ? null : <span className="muted">{` \u00b7 scenario hash ${result.hash.slice(0, 8)}`}</span>}</h2> : null}
      <div className="game-layout">
      <div className="game-main">
      {result === null ? (
        <p className="muted">No replay yet. Activate Simulate to run replication 0 and watch it here.</p>
      ) : (
        <>
          {ghost === undefined ? (
            <p>
              {stale ? <strong>{STALE_LABEL}</strong> : null}
              {stale ? ' ' : null}
              <span>{`Replay of replication ${result.result.replication}, one example run`}</span>
            </p>
          ) : (
            <>
              <p data-testid="replay-label">{ghost.selection.label}</p>
              <p data-testid="ghost-legend">{GHOST_LEGEND}</p>
              <p data-testid="replay-note" className="muted">{REPLAY_NOTE}</p>
              <ul aria-label="Replay layers" className="layer-legend">
                <li data-testid="replay-layer-baseline" className="baseline-layer" data-role="baseline" data-replication={ghost.selection.replication}>
                  {`Baseline, replication ${ghost.selection.replication}`}
                </li>
                <li data-testid="replay-layer-candidate" className="candidate-layer" data-role="candidate" data-replication={ghost.selection.replication}>
                  {`Candidate, replication ${ghost.selection.replication}`}
                </li>
              </ul>
            </>
          )}
          {result.result.trace === undefined ? <p>This result carries no trace, so there is nothing to replay.</p> : null}
          {view.mode === 'fallback' ? (
            <div role="group" aria-label="Game view could not start">
              <p>{FALLBACK_BANNER}</p>
              <button type="button" onClick={() => setGeneration((g) => g + 1)}>Retry game view</button>
            </div>
          ) : null}
          <div className="toolbar" role="group" aria-label="Replay controls">
            {reduced ? [...stepControls, playButton, speedGroup] : [playButton, speedGroup, ...stepControls]}
            {followButton}
            {playUnavailable && view.mode === 'fallback' ? <span className="muted">Playback needs the game view; the step controls and the scrubber work.</span> : null}
            <button type="button" onClick={() => setGeneration((g) => g + 1)}>Restart</button>
          </div>
        </>
      )}
      <p id={`${helpId}-help`} className="visually-hidden">{GAME_KEY_HELP}</p>
      {wrapper}
      {result === null ? null : (
        <>
          <p className="muted legend">
            <span className="wait-ramp" aria-hidden="true" />
            {LEGEND}
          </p>
          {present > SPRITE_CAP ? (
            <p>{`Showing ${SPRITE_CAP.toLocaleString('en-US')} of ${present.toLocaleString('en-US')} attendees as sprites; the others are counted in the badges and every table is complete.`}</p>
          ) : null}
        </>
      )}
      </div>
      <div className="game-side">
      <FindAttendee attendeeIds={attendeeIds} onPick={pick} onFollow={(id) => followAttendee(id)} />
      {result === null ? null : (
        <>
          <PersonTimeline attendeeId={attendee} rows={rows} baselineRow={baselineRow} onKeyDown={(e) => {
            if (e.key === 'f' || e.key === 'F') {
              e.preventDefault();
              if (attendee !== null) followAttendee(attendee);
            }
          }} />
          {ghost !== undefined && ghost.languageMode === 'population' && attendee !== null ? <p className="muted">{PER_PERSON_OFF}</p> : null}
          <QueueInspector stationLabel={inspected?.label ?? null} clockMs={clock.ms} sample={inspected === null ? null : (sample.perStation[inspected.id] ?? null)} />
          {waitingSeries === null ? null : <WaitingChart series={waitingSeries} clockMs={clock.ms} />}
        </>
      )}
      </div>
      </div>
    </section>
  );
}