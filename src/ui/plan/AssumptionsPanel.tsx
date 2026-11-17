// The assumptions panel beside the tables (requirement 4.6): the fixed assumption text, the limits and the four lines that
// change with every edit, plus the scenario settings that are not tables.
import type { ReactElement } from 'react';
import { LIMITS } from '../../domain/limits';
import { validateScenario } from '../../domain/validate';
import { parseDecimal } from '../../imports/numbers';
import { minutesToMs } from '../../imports/units';
import type { EditorStore } from '../state/store';
import { useEditorState } from '../state/useEditorState';
import { CommitInput, attempt } from './fields';

export const ASSUMPTIONS = [
  'One station is one service stage: a single FIFO line feeding identical parallel servers.',
  'A cohort follows its ordered station IDs, each at most once, then exits.',
  'Staffing is constant through a run.',
  'Queue capacity is unlimited and nobody leaves early.',
  'Walking is at one constant speed along the computed grid path.',
  'Service durations are constant or triangular.',
  'No personal space, congestion-dependent walking speed, doorway throughput, accessibility clearance, crowd pressure or collisions: queue sprites never block movement.',
  'The output of a run is a scenario result under these assumptions for one seed and one replication: scenario results, not a forecast.',
] as const;

export const LIMITS_TEXT =
  `Limits: at most ${LIMITS.maxAttendees.toLocaleString('en-US')} attendees, ${LIMITS.maxStations} stations, ${LIMITS.maxRouteVisits} station visits per route, ` +
  `${LIMITS.maxCols} × ${LIMITS.maxRows} cells, a ${LIMITS.maxHorizonMs / 60_000}-minute observation window, servers ${LIMITS.minServers} to ${LIMITS.maxServers}, 10 saved scenarios, a 2 MiB import file.`;

export function AssumptionsPanel({ store }: { store: EditorStore }): ReactElement {
  const state = useEditorState(store);
  const { scenario, hash } = state;
  const validated = validateScenario(scenario);
  const warnings = validated.ok ? validated.warnings : [];
  const decimal = (name: string, apply: (n: number) => string | null) => (text: string): string | null => {
    const p = parseDecimal(text);
    return p.ok ? apply(p.value) : `${name} must be a number (got "${text.trim()}")`;
  };

  return (
    <div>
      <h2>Assumptions</h2>
      <ul>
        {ASSUMPTIONS.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>{LIMITS_TEXT}</p>
      {warnings.map((w) => (
        <p key={w.code} className="field-error">{w.message}</p>
      ))}
      <p className="hash">{`Scenario hash: ${hash ?? 'computing…'}`}</p>
      <p>{`Model version: ${scenario.modelVersion}`}</p>
      <p>{`Seed: ${scenario.baseSeed}`}</p>
      <p>{`Horizon: ${scenario.horizonMs / 60_000} min`}</p>
      <h3>Scenario settings</h3>
      <p><label>Title <CommitInput label="Title" value={scenario.title} onCommit={(t) => attempt(store, { type: 'settings/set', patch: { title: t } })} /></label></p>
      <p>
        <label>Horizon (min) <CommitInput label="Horizon (min)" value={String(scenario.horizonMs / 60_000)} inputMode="decimal" width="5em" onCommit={decimal('Horizon', (n) => attempt(store, { type: 'settings/set', patch: { horizonMs: minutesToMs(n) } }))} /></label>
      </p>
      <p>
        <label>Walking speed (m/s) <CommitInput label="Walking speed (m/s)" value={String(scenario.walkSpeedMps)} inputMode="decimal" width="5em" onCommit={decimal('Walking speed', (n) => attempt(store, { type: 'settings/set', patch: { walkSpeedMps: n } }))} /></label>
      </p>
      <p><label>Seed <CommitInput label="Seed" value={scenario.baseSeed} onCommit={(t) => attempt(store, { type: 'settings/set', patch: { baseSeed: t } })} /></label></p>
      <p><label>Notes <CommitInput label="Notes" value={scenario.notes} onCommit={(t) => attempt(store, { type: 'settings/set', patch: { notes: t } })} /></label></p>
    </div>
  );
}
