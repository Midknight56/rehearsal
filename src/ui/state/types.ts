// Editor state and actions (task 5). Task 1 writes the types so that the tests compile; task 5 adds the behaviour.
// The compare slice and the compare/* actions are added by task 18. workspace/load, screen/set, the idle message,
// import/apply.imported and run/result.completedAt were added by task 5 (landing, run panel and import announcements need them).
import type { Comparison } from '../../comparison/comparison';
import type { ComparisonSummary } from '../../comparison/summary';
import type { Scenario } from '../../domain/scenario';
import type { RunResult } from '../../simulation/simulate';
import type { ImportPreview } from '../../imports/preview';
import type { Prefs } from '../../storage/prefs';
import type { SavedScenarioSummary } from '../../storage/scenarios';

export type Selection =
  | { kind: 'none' }
  | { kind: 'station'; id: string }
  | { kind: 'cohort'; id: string }
  | { kind: 'cell'; cell: [number, number] };

export type ResultsState =
  | { status: 'none' }
  | { status: 'fresh' | 'stale'; result: RunResult; snapshot: Scenario; hash: string; completedAt: string };

export type RunState =
  | { status: 'idle'; message?: string }
  | { status: 'running'; runId: number; tabIndex: number; done: number; total: number; startedAt: number }
  | { status: 'cancelling'; runId: number; tabIndex: number; since: number }
  | { status: 'blocked'; message: string };

export type TabKey = string;

/** The Compare screen (requirement 12). `comparison` is the live record; `restored` a saved summary read back (12.6). */
export type CompareState = {
  baselineKey: TabKey | null;
  candidateKey: TabKey | null;
  running: boolean;
  progress: { done: number; total: number } | null;
  loadingReplication: number | null;
  comparison: Comparison | null;
  restored: ComparisonSummary | null;
  /** The verbatim message of the last cancelled or failed outcome; cleared by the next start or completion. */
  message: string | null;
};

export type EditorState = {
  stateVersion: 1;
  screen: 'landing' | 'plan' | 'compare' | 'print';
  scenarios: Scenario[];
  tabKeys: TabKey[];
  currentIndex: number;
  scenario: Scenario;
  hashes: (string | null)[];
  hash: string | null;
  selection: Selection;
  past: Scenario[][];
  future: Scenario[][];
  drag: { stationId: string; from: [number, number]; current: [number, number] } | null;
  results: ResultsState[];
  run: RunState;
  replay: { follow: string | null; selectedAttendee: string | null; inspectedStation: string | null; speed: 1 | 4 | 16; playing: boolean; clockMs: number };
  compare: CompareState;
  importDialog: { open: boolean; preview: ImportPreview | null; busy: boolean; message: string | null };
  storage: { saved: SavedScenarioSummary[]; message: string | null; unreadable: boolean; saveError: { reason: 'quota' | 'unavailable' | 'limit' } | null };
  prefs: Prefs;
  status: string;
};

export type EditorAction =
  | { type: 'station/move'; id: string; cell: [number, number]; via: 'drag' | 'form' | 'nudge' }
  | { type: 'station/set'; id: string; patch: Partial<Omit<Scenario['stations'][number], 'id' | 'cell'>> }
  | { type: 'station/rename'; id: string; newId: string }
  | { type: 'station/add' }
  | { type: 'station/delete'; id: string }
  | { type: 'cohort/set'; id: string; patch: Partial<Omit<Scenario['cohorts'][number], 'id'>> }
  | { type: 'cohort/rename'; id: string; newId: string }
  | { type: 'cohort/add' }
  | { type: 'cohort/delete'; id: string }
  | { type: 'layout/toggle-blocked'; cell: [number, number] }
  | { type: 'layout/set-entrance'; cell: [number, number] }
  | { type: 'layout/set-exit'; cell: [number, number] }
  | { type: 'layout/unblock-and-place-entrance'; cell: [number, number] }
  | { type: 'layout/unblock-and-place-exit'; cell: [number, number] }
  | { type: 'layout/resize'; cols: number; rows: number }
  | { type: 'settings/set'; patch: Partial<Pick<Scenario, 'title' | 'horizonMs' | 'walkSpeedMps' | 'baseSeed' | 'notes'>> }
  | { type: 'import/apply'; candidate: Scenario; sources: string[]; imported?: { cohorts: number; stations: number } }
  | { type: 'scenario/open'; scenario: Scenario }
  | { type: 'workspace/load'; scenarios: Scenario[]; tabKeys: TabKey[] }
  | { type: 'import/open' }
  | { type: 'import/close' }
  | { type: 'import/busy'; busy: boolean }
  | { type: 'import/preview'; preview: ImportPreview | null }
  | { type: 'screen/set'; screen: EditorState['screen'] }
  | { type: 'scenario/select-tab'; index: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'drag/start' | 'drag/move' | 'drag/end' | 'drag/cancel'; id: string; cell: [number, number] }
  | { type: 'select'; selection: Selection }
  | { type: 'run/started'; runId: number; tabIndex: number }
  | { type: 'run/progress'; runId: number; done: number; total: number }
  | { type: 'run/result'; runId: number; tabIndex: number; result: RunResult; snapshot: Scenario; hash: string; completedAt?: string }
  | { type: 'run/cancelling'; runId: number }
  | { type: 'run/finished'; runId: number; outcome: 'complete' | { cancelled: string } | { error: string } }
  | { type: 'run/blocked'; message: string }
  | { type: 'hash/computed'; tabIndex: number; revision: number; hash: string }
  | { type: 'storage/save-failed'; reason: 'quota' | 'unavailable' | 'limit' }
  | { type: 'storage/save-ok' }
  | { type: 'storage/listed'; saved: SavedScenarioSummary[]; unreadable: boolean }
  | { type: 'compare/pick'; side: 'baseline' | 'candidate'; key: TabKey }
  | { type: 'compare/started' }
  | { type: 'compare/progress'; done: number; total: number }
  | { type: 'compare/complete'; comparison: Comparison }
  | { type: 'compare/ended'; message: string }
  | { type: 'compare/loading'; replication: number }
  | { type: 'compare/replicate'; comparison: Comparison }
  | { type: 'compare/replicate-failed'; message: string }
  | { type: 'compare/restore'; summary: ComparisonSummary }
  | { type: 'status/set'; text: string }
  | { type: 'prefs/set'; prefs: Prefs };
