// The Compare screen (requirement 12). It picks two open tabs, runs the paired comparison through the controller, shows the
// change list, the metric cards, the station table and the replay with the baseline ghost, and saves a summary. It computes
// nothing: every number comes from the Comparison and every sentence from src/comparison/labels.ts.
import { useMemo, useState, type ReactElement } from 'react';
import { saveErrorText, timingText } from '../../comparison/labels';
import { toComparisonSummary } from '../../comparison/summary';
import { browserStorage } from '../../storage/browser';
import { createComparisonStore } from '../../storage/comparisons';
import type { createGameView } from '../../replay/gameView';
import { requestHeadingFocus, useHeadingFocus } from '../focus';
import { GameViewPanel, type GhostProps } from '../game/GameViewPanel';
import { createSavedScenarios, type SavedScenarios } from '../saved';
import { SaveError } from '../SaveError';
import type { EditorStore } from '../state/store';
import { useEditorState } from '../state/useEditorState';
import { ChangeList } from './ChangeList';
import { ExportControls } from './ExportControls';
import { MetricCard } from './MetricCard';
import { PickScenarios } from './PickScenarios';
import { ReplicateSelect } from './ReplicateSelect';
import { StationTable } from './StationTable';
import type { CompareController } from './controller';
import { compareStatusText } from './status';

type Props = { store: EditorStore; controller: CompareController; storage?: Storage | null; saved?: SavedScenarios; createView?: typeof createGameView };

export function CompareScreen({ store, controller, storage, saved: savedProp, createView }: Props): ReactElement {
  const state = useEditorState(store);
  useHeadingFocus();
  const { compare } = state;
  const comparison = compare.comparison;
  const view = comparison ?? compare.restored;
  const places = useMemo(() => storage === undefined ? browserStorage() : storage, [storage]);
  const comparisons = useMemo(() => createComparisonStore(places), [places]);
  const saved = useMemo(() => savedProp ?? createSavedScenarios(store, places), [savedProp, store, places]);
  const [savedTick, setSavedTick] = useState(0);
  const savedComparisons = useMemo(() => comparisons.list(), [comparisons, savedTick]);

  const equalPicks = compare.baselineKey === compare.candidateKey;
  const runBlocked = compare.running || compare.loadingReplication !== null || equalPicks;
  const ghost = useMemo<GhostProps | undefined>(
    () =>
      comparison === null
        ? undefined
        : {
          selection: comparison.replay,
          candidate: comparison.candidateScenario,
          candidateHash: comparison.candidate.scenarioHash,
          baseline: comparison.baselineScenario,
          languageMode: comparison.languageMode,
          population: comparison.population,
        },
    [comparison],
  );

  const onRun = (): void => {
    if (runBlocked) {
      store.setStatus(equalPicks ? 'Pick two different scenarios to compare.' : 'A comparison is already running.');
      return;
    }
    controller.run();
  };

  // Save keeps the current tab's scenario (10.3) and the comparison summary (12.6); either failure shows the save-failure block.
  const onSave = async (): Promise<void> => {
    const summary = comparison !== null ? toComparisonSummary(comparison) : compare.restored;
    if (summary === null) return;
    if (!(await saved.save())) return;
    const result = comparisons.save(summary);
    if (result.ok) {
      store.dispatch({ type: 'storage/save-ok' });
      store.setStatus('Saved this comparison in this browser.');
      setSavedTick((n) => n + 1);
    } else {
      store.dispatch({ type: 'storage/save-failed', reason: result.reason });
      store.setStatus(saveErrorText(result.reason));
    }
  };

  return (
    <main className="compare">
      <h1>Compare scenarios</h1>
      <div className="toolbar">
        <button type="button" onClick={() => { requestHeadingFocus(); store.dispatch({ type: 'screen/set', screen: 'plan' }); }}>Back to plan</button>
      </div>
      <section className="panel" aria-label="Pick scenarios">
        <PickScenarios store={store} />
        <div className="toolbar">
          <button type="button" className="primary" data-testid="run-comparison" aria-disabled={runBlocked ? 'true' : undefined} onClick={onRun}>
            Run comparison
          </button>
          {compare.running ? <button type="button" onClick={() => controller.cancel()}>Cancel comparison</button> : null}
          {equalPicks ? <span className="muted">Pick two different scenarios.</span> : null}
        </div>
        <p data-testid="compare-status">{compareStatusText(state)}</p>
        {savedComparisons.ok && savedComparisons.items.length > 0 ? (
          <ul aria-label="Saved comparisons">
            {savedComparisons.items.map((item) => (
              <li key={item.key}>
                <button type="button" onClick={() => store.dispatch({ type: 'compare/restore', summary: item })}>
                  {`Restore ${item.baseline.title} vs ${item.candidate.title} (${item.createdAt.slice(0, 10)})`}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {savedComparisons.ok ? null : <p className="muted">Saved comparisons could not be read in this browser.</p>}
      </section>

      {ghost === undefined ? null : <GameViewPanel store={store} ghost={ghost} {...(createView === undefined ? {} : { createView })} />}
      {comparison === null ? null : (
        <div className="toolbar">
          <ReplicateSelect
            replication={comparison.replay.replication}
            busy={compare.loadingReplication !== null || compare.running}
            onSelect={(r) => controller.selectReplicate(r)}
          />
        </div>
      )}

      {view === null ? null : (
        <>
          <ChangeList view={view} />
          <section className="panel" aria-label="Scenario hashes">
            <p data-testid="scenario-hash-baseline">{`Baseline scenario hash: ${view.baseline.scenarioHash}`}</p>
            <p data-testid="scenario-hash-candidate">{`Candidate scenario hash: ${view.candidate.scenarioHash}`}</p>
          </section>
          <section className="panel" aria-label="Metric cards">
            <div className="cards">
              {view.metrics.map((metric) => (
                <MetricCard key={metric.key} metric={metric} view={view} />
              ))}
            </div>
          </section>
          <section className="panel" aria-label="Stations">
            <StationTable view={view} />
          </section>
          <p className="muted">{timingText(view.timing.pairedMs)}</p>
          <div className="toolbar">
            <button type="button" data-testid="save-scenario" onClick={() => void onSave()}>Save</button>
          </div>
          <SaveError store={store} onRetry={() => void onSave()} />
        </>
      )}
      <ExportControls store={store} />
    </main>
  );
}