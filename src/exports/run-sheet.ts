import { formatCell, formatMeters, formatMinutes, formatRoute, formatService, formatWindow } from '../comparison/format';
import type { Cell, Scenario, Service } from '../domain/scenario';
import { formatMetricValue } from '../simulation/metrics';
import type { NodeRef } from '../simulation/heap';
import { MODEL_VERSION } from '../simulation/version';
import { createPathCache } from '../spatial/path-cache';
import { ASSUMPTIONS, LIMITS_TEXT, NOT_A_FORECAST } from './assumptions-text';
import { el, htmlDocument } from './document';
import { escapeHtml } from './html-escape';

export type RunSheetSegment = {
  from: string; to: string; fromLabel: string; toLabel: string; cells: number; distanceM: number; durationMs: number;
};
export type RunSheetModel = {
  title: string; generatedAt: string; scenarioHash: string; modelVersion: string; horizonMs: number;
  cohorts: { id: string; startMs: number; endMs: number; count: number; arrivals: 'even' | 'uniform'; route: string[] }[];
  stations: { id: string; label: string; servers: number; service: Service; cell: Cell; metersFromEntrance: number }[];
  segments: RunSheetSegment[];
  walkingPerRoute: { cohortId: string; distanceM: number; durationMs: number }[];
  staffHours: number;
  assumptions: readonly string[]; limits: string;
};

// Rendering rule shared with the React run sheet: metres with one decimal, seconds with three decimals (the exact
// millisecond value), staff-hours through the engine's formatMetricValue.
export const formatDistance = formatMeters;
export const formatDurationS = (ms: number): string => `${(ms / 1000).toFixed(3)} s`;
export const formatDurationMs = (ms: number): string => `${ms.toLocaleString('en-US')} ms`;
export const formatStaffHours = (hours: number): string =>
  formatMetricValue({ value: hours, unit: 'hours', population: 'closingWindow', n: 0, conditioned: false, note: null });
export const formatPerAttendee = (m: number): string => `${formatDistance(m)} per attendee`;

const nodeId = (node: NodeRef): string => (node.kind === 'station' ? node.id : node.kind);
const same = (a: NodeRef, b: NodeRef): boolean => nodeId(a) === nodeId(b) && a.kind === b.kind;

/** The numbers of the run sheet. The scenario must be valid (every route leg reachable); the path cache supplies every distance. */
export function buildRunSheetModel(scenario: Scenario, scenarioHash: string): RunSheetModel {
  const cache = createPathCache(scenario);
  const labels = new Map(scenario.stations.map((s) => [s.id, s.label]));
  const labelOf = (node: NodeRef): string =>
    node.kind === 'entrance' ? 'Entrance' : node.kind === 'exit' ? 'Exit' : (labels.get(node.id) ?? node.id);

  const used: NodeRef[][] = [];
  const segments: RunSheetSegment[] = [];
  const walkingPerRoute: RunSheetModel['walkingPerRoute'] = [];
  for (const cohort of scenario.cohorts) {
    const nodes: NodeRef[] = [{ kind: 'entrance' }, ...cohort.route.map((id): NodeRef => ({ kind: 'station', id })), { kind: 'exit' }];
    let distanceM = 0;
    let durationMs = 0;
    for (let i = 0; i + 1 < nodes.length; i += 1) {
      const from = nodes[i] as NodeRef;
      const to = nodes[i + 1] as NodeRef;
      const path = cache.lookup(from, to);
      distanceM += path.distanceM;
      durationMs += path.durationMs;
      if (!used.some(([a, b]) => same(a as NodeRef, from) && same(b as NodeRef, to))) {
        used.push([from, to]);
        segments.push({
          from: nodeId(from), to: nodeId(to), fromLabel: labelOf(from), toLabel: labelOf(to),
          cells: path.cells.length - 1, distanceM: path.distanceM, durationMs: path.durationMs,
        });
      }
    }
    walkingPerRoute.push({ cohortId: cohort.id, distanceM, durationMs });
  }

  return {
    title: scenario.title,
    generatedAt: '',
    scenarioHash,
    modelVersion: MODEL_VERSION,
    horizonMs: scenario.horizonMs,
    cohorts: scenario.cohorts.map((c) => ({ id: c.id, startMs: c.startMs, endMs: c.endMs, count: c.count, arrivals: c.arrivals, route: [...c.route] })),
    stations: scenario.stations.map((s) => ({
      id: s.id, label: s.label, servers: s.servers, service: s.service, cell: s.cell,
      metersFromEntrance: cache.lookup({ kind: 'entrance' }, { kind: 'station', id: s.id }).distanceM,
    })),
    segments,
    walkingPerRoute,
    staffHours: (scenario.stations.reduce((total, s) => total + s.servers, 0) * scenario.horizonMs) / 3_600_000,
    assumptions: ASSUMPTIONS,
    limits: LIMITS_TEXT,
  };
}

// Table titles, column headers and row cells in one place: the generator below and the React run sheet of src/ui/print render
// these same strings, so the saved HTML and the screen print identical text.
export const RUN_SHEET_TABLES = {
  cohorts: { title: 'Cohorts', columns: ['Cohort', 'Window', 'Attendees', 'Arrivals', 'Route'] },
  stations: { title: 'Stations', columns: ['Station', 'Servers', 'Service', 'Cell', 'Meters from the entrance'] },
  segments: { title: 'Walking', columns: ['Segment', 'Cells', 'Distance', 'Duration', 'Duration in milliseconds'] },
  walking: { title: 'Walking per attendee', columns: ['Cohort', 'Distance', 'Duration'] },
} as const;
export const ASSUMPTIONS_TITLE = 'Assumptions and limits';

export type RunSheetRow = { head: string; cells: string[] };

export const runSheetHeading = (model: Pick<RunSheetModel, 'title'>): string => `${model.title} (run sheet)`;
/** `Generated 2026-11-20 12:34 UTC` from an ISO timestamp (the clock is read by the caller, never here). */
export const generatedLine = (generatedAt: string): string => `Generated ${generatedAt.slice(0, 10)} ${generatedAt.slice(11, 16)} UTC`;
export const scenarioHashLine = (model: Pick<RunSheetModel, 'scenarioHash'>): string => `Scenario hash: ${model.scenarioHash}`;
export const modelVersionText = (model: Pick<RunSheetModel, 'modelVersion'>): string => `Model version: ${model.modelVersion}`;
export const staffHoursLine = (model: Pick<RunSheetModel, 'stations' | 'staffHours' | 'horizonMs'>): string => {
  const servers = model.stations.reduce((total, s) => total + s.servers, 0);
  return `Staff-hours: ${formatStaffHours(model.staffHours)} (${servers} servers over ${formatMinutes(model.horizonMs)})`;
};

export const cohortRows = (model: RunSheetModel): RunSheetRow[] =>
  model.cohorts.map((c) => ({ head: c.id, cells: [formatWindow(c.startMs, c.endMs), `${c.count} people`, c.arrivals, formatRoute(c.route)] }));
export const stationRows = (model: RunSheetModel): RunSheetRow[] =>
  model.stations.map((s) => ({
    head: `${s.label} (${s.id})`,
    cells: [String(s.servers), formatService(s.service), formatCell(s.cell), formatDistance(s.metersFromEntrance)],
  }));
export const segmentRows = (model: RunSheetModel): RunSheetRow[] =>
  model.segments.map((s) => ({
    head: `${s.fromLabel} \u2192 ${s.toLabel}`,
    cells: [String(s.cells), formatDistance(s.distanceM), formatDurationS(s.durationMs), formatDurationMs(s.durationMs)],
  }));
export const walkingRows = (model: RunSheetModel): RunSheetRow[] =>
  model.walkingPerRoute.map((w) => ({ head: w.cohortId, cells: [formatPerAttendee(w.distanceM), formatDurationS(w.durationMs)] }));

const th = (text: string): string => `<th scope="col">${escapeHtml(text)}</th>`;
const td = (text: string): string => `<td>${escapeHtml(text)}</td>`;
const table = (spec: { title: string; columns: readonly string[] }, rows: RunSheetRow[]): string =>
  [
    '<table>',
    `<caption>${escapeHtml(spec.title)}</caption>`,
    `<thead><tr>${spec.columns.map(th).join('')}</tr></thead>`,
    `<tbody>${rows.map((row) => `<tr><th scope="row">${escapeHtml(row.head)}</th>${row.cells.map(td).join('')}</tr>`).join('\n')}</tbody>`,
    '</table>',
  ].join('\n');
const section = (id: string, heading: string | null, ...parts: string[]): string =>
  [`<section id="${id}">`, heading === null ? '' : el('h2', heading), ...parts, '</section>'].filter((line) => line !== '').join('\n');

/** The one-page run sheet as a complete HTML document, plus the model it was rendered from. Reads no clock. */
export function renderRunSheet(
  scenario: Scenario,
  options: { generatedAt: string; scenarioHash: string },
): { html: string; model: RunSheetModel } {
  const model: RunSheetModel = { ...buildRunSheetModel(scenario, options.scenarioHash), generatedAt: options.generatedAt };
  const heading = runSheetHeading(model);
  const body = [
    el('h1', heading),
    el('p', generatedLine(model.generatedAt)),
    section('cohorts', RUN_SHEET_TABLES.cohorts.title, table(RUN_SHEET_TABLES.cohorts, cohortRows(model))),
    section('stations', RUN_SHEET_TABLES.stations.title, table(RUN_SHEET_TABLES.stations, stationRows(model))),
    section('segments', RUN_SHEET_TABLES.segments.title, table(RUN_SHEET_TABLES.segments, segmentRows(model))),
    section('walking', RUN_SHEET_TABLES.walking.title, table(RUN_SHEET_TABLES.walking, walkingRows(model))),
    section('staff-hours', null, el('p', staffHoursLine(model))),
    section(
      'assumptions',
      ASSUMPTIONS_TITLE,
      el('p', scenarioHashLine(model)),
      el('p', modelVersionText(model)),
      '<ul>',
      ...model.assumptions.map((line) => el('li', line)),
      '</ul>',
      el('p', model.limits),
      el('p', NOT_A_FORECAST),
    ),
  ].join('\n');
  return { html: htmlDocument(heading, body), model };
}