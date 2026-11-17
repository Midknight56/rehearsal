// Import preview: types, header matching and candidate assembly shared by the CSV and the workbook adapters.
// Display units are converted once here (units.ts). Domain rules come from validateScenario; the adapter adds only
// what the validator cannot know (row, column, sheet and cell names, the occupied-cell editor rule, limits phrased per row).
import { LIMITS } from '../domain/limits';
import type { Cohort, Scenario, Station } from '../domain/scenario';
import type { ValidationIssue, validateScenario } from '../domain/validate';
import type { scenarioHash } from '../domain/hash';
import { describeNode, type createPathCache } from '../spatial/path-cache';
import { parseDecimal } from './numbers';
import { minutesToMs, serviceFromSeconds } from './units';
import type { WorkbookReader } from './workbookReader';

export type ImportTable = 'arrivals' | 'stations' | 'settings';
export type CellRef = { sheet: string; cell: string };
export type ImportLocation = { table: ImportTable; row: number; field: string; cell?: CellRef };
export type ImportErrorCode =
  | 'file-too-large' | 'file-unreadable' | 'missing-header' | 'duplicate-header'
  | 'missing-sheet' | 'duplicate-id' | 'not-a-number' | 'not-whole' | 'out-of-range'
  | 'formula-without-value' | 'unsupported-cell' | 'unknown-station' | 'repeated-station'
  | 'route-too-long' | 'bad-pattern' | 'bad-window' | 'bad-service' | 'cell-out-of-bounds'
  | 'cell-occupied' | 'unreachable' | 'too-many-stations' | 'too-many-attendees' | 'bad-id' | 'bad-settings';
export type ImportError = { code: ImportErrorCode; location?: ImportLocation; message: string };

export type ArrivalsRow = { cohort_id: string; start_min: number; end_min: number; count: number; arrival_pattern: 'even' | 'uniform'; route: string[] };
export type StationsRow = { station_id: string; label: string; servers: number; service_min_s: number; service_mode_s: number; service_max_s: number; cell_x: number; cell_y: number };
export type SettingsRow = { key: 'title' | 'horizon_min' | 'walk_speed_mps' | 'base_seed'; value: string | number };
export type PreviewRow<T> = { row: number; cell?: CellRef; values: Partial<T>; raw: Record<string, string>; errors: ImportError[]; formulaFields: string[] };

export type ImportPreview = {
  previewVersion: 1;
  source:
    | { kind: 'csv'; files: { table: 'arrivals' | 'stations'; name: string; bytes: number }[] }
    | { kind: 'xlsx'; name: string; bytes: number };
  sheetsRead: string[];
  sheetsIgnored: string[];
  columnsNotRead: Record<'arrivals' | 'stations', string[]>;
  settingsKeysNotRead: string[];
  arrivals: PreviewRow<ArrivalsRow>[] | null;
  stations: PreviewRow<StationsRow>[] | null;
  settings: PreviewRow<SettingsRow>[] | null;
  formulaCells: CellRef[];
  errors: ImportError[];
  candidate: Scenario | null;
  canonicalHash: string | null;
};

export type Deps = {
  validate: typeof validateScenario;
  hash: typeof scenarioHash;
  pathCache: typeof createPathCache;
  reader?: (bytes: ArrayBuffer) => WorkbookReader;
  maxBytes: number;
};

export const MAX_IMPORT_BYTES = 2_097_152;
export const ARRIVALS_COLUMNS = ['cohort_id', 'start_min', 'end_min', 'count', 'arrival_pattern', 'route'] as const;
export const STATIONS_COLUMNS = ['station_id', 'label', 'servers', 'service_min_s', 'service_mode_s', 'service_max_s', 'cell_x', 'cell_y'] as const;
export const SETTINGS_KEYS = ['title', 'horizon_min', 'walk_speed_mps', 'base_seed'] as const;

/** One source cell, as the CSV adapter (text only) or the workbook adapter reads it. */
export type SourceCell = (
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: number }
  | { kind: 'blank' }
  | { kind: 'formula-no-value' }
  | { kind: 'unsupported'; what: 'a date cell' | 'a boolean cell' | 'an error cell' }
) & { ref?: CellRef; formula?: boolean };
export type SourceRow = { row: number; cells: Record<string, SourceCell> };
export type SourceTable = { rows: SourceRow[]; headerErrors: ImportError[] };

const decimals = (n: number): string => n.toLocaleString('en-US');

/** Message of a file above the limit, shared by both adapters (requirements 1.3 and 2.10). */
export function tooLargeMessage(name: string, bytes: number): string {
  return `${name} is ${(bytes / 1_048_576).toFixed(2)} MiB; the limit is 2 MiB.`;
}

/** Match a header row by exact name after trimming; a template column twice or absent is an error, others are not read. */
export function matchHeader(
  names: string[],
  template: readonly string[],
  table: ImportTable,
): { index: Record<string, number>; errors: ImportError[]; notRead: string[] } {
  const clean = names.map((n, i) => (i === 0 ? n.replace(/^\uFEFF/, '') : n).trim());
  const index: Record<string, number> = {};
  const errors: ImportError[] = [];
  const twice = new Set<string>();
  clean.forEach((name, i) => {
    if (!template.includes(name)) return;
    if (name in index) {
      if (!twice.has(name)) {
        twice.add(name);
        errors.push({ code: 'duplicate-header', location: { table, row: 1, field: name }, message: `Column "${name}" appears twice in row 1.` });
      }
    } else index[name] = i;
  });
  for (const name of template) {
    if (!(name in index) && !twice.has(name)) {
      errors.push({ code: 'missing-header', location: { table, row: 1, field: name }, message: `Column "${name}" is missing from row 1.` });
    }
  }
  const notRead = [...new Set(clean.filter((n) => n !== '' && !template.includes(n)))];
  return { index, errors, notRead };
}

// ---------------------------------------------------------------------------------------------------------------------
// Row parsing

type RowCtx = { table: ImportTable; row: SourceRow; errors: ImportError[]; raw: Record<string, string>; formulaFields: string[]; formulaCells: CellRef[] };

const where = (ctx: RowCtx, field: string, ref?: CellRef): string =>
  ref === undefined ? `Row ${ctx.row.row}, ${field}` : `${ref.sheet}!${ref.cell} (${field})`;

function fail(ctx: RowCtx, code: ImportErrorCode, field: string, text: string, ref?: CellRef): void {
  ctx.errors.push({ code, location: { table: ctx.table, row: ctx.row.row, field, ...(ref === undefined ? {} : { cell: ref }) }, message: `${where(ctx, field, ref)}: ${text}` });
}

function cellOf(ctx: RowCtx, field: string): SourceCell {
  const cell = ctx.row.cells[field] ?? { kind: 'blank' as const };
  ctx.raw[field] = cell.kind === 'text' ? cell.text : cell.kind === 'number' ? String(cell.value) : '';
  if (cell.formula === true && cell.ref !== undefined) {
    ctx.formulaFields.push(field);
    ctx.formulaCells.push(cell.ref);
  }
  return cell;
}

const got = (cell: SourceCell): string =>
  cell.kind === 'text' ? `"${cell.text.trim()}"` : cell.kind === 'number' ? String(cell.value) : '""';

/** The unsupported and formula cases shared by every field; true when the cell was reported. */
function reportKind(ctx: RowCtx, field: string, cell: SourceCell, expected: string): boolean {
  if (cell.kind === 'formula-no-value') {
    ctx.errors.push({
      code: 'formula-without-value',
      location: { table: ctx.table, row: ctx.row.row, field, ...(cell.ref === undefined ? {} : { cell: cell.ref }) },
      message: `${where(ctx, field, cell.ref)} is a formula with no saved value. Open the workbook, let it calculate, save, and import again.`,
    });
    return true;
  }
  if (cell.kind === 'unsupported') {
    fail(ctx, 'unsupported-cell', field, `expected ${expected}, found ${cell.what}.`, cell.ref);
    return true;
  }
  return false;
}

function readText(ctx: RowCtx, field: string): string | null {
  const cell = cellOf(ctx, field);
  if (reportKind(ctx, field, cell, 'text')) return null;
  return cell.kind === 'text' ? cell.text.trim() : cell.kind === 'number' ? String(cell.value) : '';
}

function readNumber(ctx: RowCtx, field: string, rule: { whole: boolean; ok: (v: number) => boolean; text: string }): number | null {
  const cell = cellOf(ctx, field);
  if (reportKind(ctx, field, cell, 'a number')) return null;
  let value: number | null = null;
  if (cell.kind === 'number') value = Number.isFinite(cell.value) ? cell.value : null;
  else if (cell.kind === 'text') {
    const parsed = parseDecimal(cell.text);
    value = parsed.ok ? parsed.value : null;
  }
  const valid = value !== null && (!rule.whole || Number.isInteger(value)) && rule.ok(value);
  if (!valid) {
    fail(ctx, rule.whole && (value === null || !Number.isInteger(value)) ? 'not-whole' : value === null ? 'not-a-number' : 'out-of-range', field, `must be ${rule.text} (got ${got(cell)}).`, cell.ref);
    return null;
  }
  return value;
}

const cellStart = (row: SourceRow): CellRef | undefined => Object.values(row.cells).find((c) => c.ref !== undefined)?.ref;

type Parsed<T> = { rows: PreviewRow<T>[]; values: (Partial<T> | null)[]; complete: boolean };

function parseArrivals(table: SourceTable, ctx: { horizonMin: number; formulaCells: CellRef[] }): Parsed<ArrivalsRow> {
  const rows: PreviewRow<ArrivalsRow>[] = [];
  const values: (Partial<ArrivalsRow> | null)[] = [];
  let complete = true;
  for (const row of table.rows) {
    const rc: RowCtx = { table: 'arrivals', row, errors: [], raw: {}, formulaFields: [], formulaCells: ctx.formulaCells };
    const v: Partial<ArrivalsRow> = {};
    const id = readText(rc, 'cohort_id');
    if (id !== null) v.cohort_id = id;
    const start = readNumber(rc, 'start_min', { whole: false, ok: (x) => x >= 0, text: 'a number of 0 or more' });
    if (start !== null) v.start_min = start;
    const end = readNumber(rc, 'end_min', { whole: false, ok: () => true, text: 'a number' });
    if (end !== null) {
      v.end_min = end;
      if (start !== null && !(end > start && end <= ctx.horizonMin)) {
        fail(rc, 'bad-window', 'end_min', `must be greater than start_min (${start}) and at most the horizon (${ctx.horizonMin}).`, row.cells.end_min?.ref);
      }
    }
    const count = readNumber(rc, 'count', { whole: true, ok: (x) => x >= 0, text: 'a whole number of 0 or more' });
    if (count !== null) v.count = count;
    const patternCell = row.cells.arrival_pattern;
    const pattern = readText(rc, 'arrival_pattern');
    if (pattern !== null) {
      if (pattern === 'even' || pattern === 'uniform') v.arrival_pattern = pattern;
      else fail(rc, 'bad-pattern', 'arrival_pattern', `must be "even" or "uniform" (got "${pattern}").`, patternCell?.ref);
    }
    const route = readText(rc, 'route');
    if (route !== null) v.route = route.split('|').map((t) => t.trim()).filter((t) => t !== '');
    const ok = rc.errors.length === 0;
    complete = complete && ok;
    values.push(ok ? v : null);
    const start0 = cellStart(row);
    rows.push({ row: row.row, ...(start0 === undefined ? {} : { cell: start0 }), values: v, raw: rc.raw, errors: rc.errors, formulaFields: rc.formulaFields });
  }
  return { rows, values, complete };
}

function parseStations(table: SourceTable, ctx: { formulaCells: CellRef[] }): Parsed<StationsRow> {
  const rows: PreviewRow<StationsRow>[] = [];
  const values: (Partial<StationsRow> | null)[] = [];
  let complete = true;
  const seconds = { whole: false, ok: (x: number) => x > 0 && x <= LIMITS.maxServiceSeconds, text: `a number greater than 0 and at most ${decimals(LIMITS.maxServiceSeconds)}` };
  for (const row of table.rows) {
    const rc: RowCtx = { table: 'stations', row, errors: [], raw: {}, formulaFields: [], formulaCells: ctx.formulaCells };
    const v: Partial<StationsRow> = {};
    const id = readText(rc, 'station_id');
    if (id !== null) v.station_id = id;
    const label = readText(rc, 'label');
    if (label !== null) v.label = label;
    const servers = readNumber(rc, 'servers', { whole: true, ok: (x) => x >= LIMITS.minServers && x <= LIMITS.maxServers, text: `a whole number from ${LIMITS.minServers} to ${LIMITS.maxServers}` });
    if (servers !== null) v.servers = servers;
    const min = readNumber(rc, 'service_min_s', seconds);
    const mode = readNumber(rc, 'service_mode_s', seconds);
    const max = readNumber(rc, 'service_max_s', seconds);
    if (min !== null) v.service_min_s = min;
    if (mode !== null) v.service_mode_s = mode;
    if (max !== null) v.service_max_s = max;
    if (min !== null && max !== null && min > max) {
      fail(rc, 'bad-service', 'service_min_s', `must not be greater than service_max_s (${max}) (got ${min}).`, row.cells.service_min_s?.ref);
    } else if (min !== null && mode !== null && max !== null && (mode < min || mode > max)) {
      fail(rc, 'bad-service', 'service_mode_s', `must be between service_min_s (${min}) and service_max_s (${max}) (got ${mode}).`, row.cells.service_mode_s?.ref);
    }
    const cell = { whole: true, ok: (x: number) => x >= 0, text: 'a whole number of 0 or more' };
    const x = readNumber(rc, 'cell_x', cell);
    const y = readNumber(rc, 'cell_y', cell);
    if (x !== null) v.cell_x = x;
    if (y !== null) v.cell_y = y;
    const ok = rc.errors.length === 0;
    complete = complete && ok;
    values.push(ok ? v : null);
    const start0 = cellStart(row);
    rows.push({ row: row.row, ...(start0 === undefined ? {} : { cell: start0 }), values: v, raw: rc.raw, errors: rc.errors, formulaFields: rc.formulaFields });
  }
  return { rows, values, complete };
}

type SettingsValues = { title?: string; horizonMs?: number; walkSpeedMps?: number; baseSeed?: string };

function parseSettings(table: SourceTable, ctx: { formulaCells: CellRef[] }): { rows: PreviewRow<SettingsRow>[]; values: SettingsValues; notRead: string[]; complete: boolean } {
  const rows: PreviewRow<SettingsRow>[] = [];
  const values: SettingsValues = {};
  const notRead: string[] = [];
  const seen = new Map<string, number>();
  let complete = true;
  for (const row of table.rows) {
    const rc: RowCtx = { table: 'settings', row, errors: [], raw: {}, formulaFields: [], formulaCells: ctx.formulaCells };
    const keyCell = row.cells.key;
    const key = readText(rc, 'key');
    const valueRef = row.cells.value?.ref;
    const pv: Partial<SettingsRow> = {};
    if (key !== null && key !== '') {
      if (!(SETTINGS_KEYS as readonly string[]).includes(key)) notRead.push(key);
      else if (seen.has(key)) fail(rc, 'duplicate-id', 'key', `"${key}" is already set in row ${seen.get(key)}.`, keyCell?.ref);
      else {
        seen.set(key, row.row);
        const text = (min: number, max: number, name: string): string | null => {
          const t = readText(rc, 'value');
          if (t !== null && (t.length < min || t.length > max)) {
            fail(rc, 'bad-settings', key, `${name} must be ${min} to ${max} characters (got ${row.cells.value?.kind === 'text' ? `"${t}"` : t}).`, valueRef);
            return null;
          }
          return t;
        };
        if (key === 'title') {
          const t = text(1, 120, 'title');
          if (t !== null) { values.title = t; pv.key = key as SettingsRow['key']; pv.value = t; }
        } else if (key === 'base_seed') {
          const t = text(1, LIMITS.maxSeedLength, 'base_seed');
          if (t !== null) { values.baseSeed = t; pv.key = key as SettingsRow['key']; pv.value = t; }
        } else if (key === 'horizon_min') {
          const n = readNumber(rc, 'value', { whole: false, ok: (x) => x > 0 && x <= LIMITS.maxHorizonMs / 60_000, text: `greater than 0 and at most ${LIMITS.maxHorizonMs / 60_000}` });
          if (n !== null) { values.horizonMs = minutesToMs(n); pv.key = key as SettingsRow['key']; pv.value = n; }
        } else {
          const n = readNumber(rc, 'value', { whole: false, ok: (x) => x > 0, text: 'greater than 0' });
          if (n !== null) { values.walkSpeedMps = n; pv.key = key as SettingsRow['key']; pv.value = n; }
        }
      }
    }
    // Settings errors name the key column of the field; messages already use the key as the field name.
    for (const e of rc.errors) if (e.location !== undefined && e.location.field === 'value' && key !== null) rewriteField(e, key);
    complete = complete && rc.errors.length === 0;
    const start0 = cellStart(row);
    rows.push({ row: row.row, ...(start0 === undefined ? {} : { cell: start0 }), values: pv, raw: rc.raw, errors: rc.errors, formulaFields: rc.formulaFields });
  }
  return { rows, values, notRead, complete };
}

function rewriteField(error: ImportError, key: string): void {
  if (error.location === undefined) return;
  error.message = error.message.replace('(value)', `(${key})`).replace(', value:', `, ${key}:`);
  error.location = { ...error.location, field: key };
}

// ---------------------------------------------------------------------------------------------------------------------
// Candidate assembly and validator mapping

export type BuildInput = {
  current: Scenario;
  deps: Deps;
  source: ImportPreview['source'];
  sheetsRead: string[];
  sheetsIgnored: string[];
  columnsNotRead: Record<'arrivals' | 'stations', string[]>;
  arrivals: SourceTable | null;
  stations: SourceTable | null;
  settings: SourceTable | null;
};

export function emptyPreview(source: ImportPreview['source'], errors: ImportError[], extra: Partial<ImportPreview> = {}): ImportPreview {
  return {
    previewVersion: 1, source, sheetsRead: [], sheetsIgnored: [], columnsNotRead: { arrivals: [], stations: [] }, settingsKeysNotRead: [],
    arrivals: null, stations: null, settings: null, formulaCells: [], errors, candidate: null, canonicalHash: null, ...extra,
  };
}

const keyOf = (l: ImportLocation): string => `${l.table}:${l.row}:${l.field}`;

export async function buildPreview(input: BuildInput): Promise<ImportPreview> {
  const { current, deps } = input;
  const formulaCells: CellRef[] = [];
  const errors: ImportError[] = [];

  const settings = input.settings === null ? null : parseSettings(input.settings, { formulaCells });
  const horizonMs = settings?.values.horizonMs ?? current.horizonMs;
  const arrivals = input.arrivals === null ? null : parseArrivals(input.arrivals, { horizonMin: horizonMs / 60_000, formulaCells });
  const stations = input.stations === null ? null : parseStations(input.stations, { formulaCells });

  // Table-level rules: duplicates, routes, the occupied-cell rule and the limits of 1.5.
  const tableErrors: ImportError[][] = [[], [], []];
  const addRowError = (list: ImportError[], rows: PreviewRow<never>[] | PreviewRow<unknown>[], rowNumber: number, error: ImportError): void => {
    list.push(error);
    (rows as PreviewRow<unknown>[]).find((r) => r.row === rowNumber)?.errors.push(error);
  };
  const stationRows = input.stations?.rows ?? [];
  const cohortRows = input.arrivals?.rows ?? [];
  const refOf = (rows: SourceRow[], row: number, field: string): CellRef | undefined => rows.find((r) => r.row === row)?.cells[field]?.ref;
  const msgAt = (table: ImportTable, row: number, field: string, text: string, ref?: CellRef): string =>
    ref === undefined ? `Row ${row}, ${field}: ${text}` : `${ref.sheet}!${ref.cell} (${field}): ${text}`;

  if (arrivals !== null) {
    const known = new Set(stations !== null ? stations.rows.map((r) => r.values.station_id).filter((x): x is string => typeof x === 'string') : current.stations.map((s) => s.id));
    const firstRow = new Map<string, number>();
    arrivals.rows.forEach((r) => {
      const id = r.values.cohort_id;
      if (typeof id === 'string') {
        const earlier = firstRow.get(id);
        if (earlier !== undefined) {
          const ref = refOf(cohortRows, r.row, 'cohort_id');
          addRowError(tableErrors[0] as ImportError[], arrivals.rows, r.row, { code: 'duplicate-id', location: { table: 'arrivals', row: r.row, field: 'cohort_id', ...(ref ? { cell: ref } : {}) }, message: msgAt('arrivals', r.row, 'cohort_id', `"${id}" is already used in row ${earlier}.`, ref) });
        } else firstRow.set(id, r.row);
      }
      const route = r.values.route;
      if (route !== undefined) {
        const ref = refOf(cohortRows, r.row, 'route');
        const loc = { table: 'arrivals' as const, row: r.row, field: 'route', ...(ref ? { cell: ref } : {}) };
        if (route.length > LIMITS.maxRouteVisits) {
          addRowError(tableErrors[0] as ImportError[], arrivals.rows, r.row, { code: 'route-too-long', location: loc, message: msgAt('arrivals', r.row, 'route', `at most ${LIMITS.maxRouteVisits} stations per route (got ${route.length}).`, ref) });
        }
        const seen = new Set<string>();
        for (const token of route) {
          if (!known.has(token)) addRowError(tableErrors[0] as ImportError[], arrivals.rows, r.row, { code: 'unknown-station', location: loc, message: msgAt('arrivals', r.row, 'route', `station "${token}" is not defined.`, ref) });
          else if (seen.has(token)) addRowError(tableErrors[0] as ImportError[], arrivals.rows, r.row, { code: 'repeated-station', location: loc, message: msgAt('arrivals', r.row, 'route', `station "${token}" appears twice.`, ref) });
          seen.add(token);
        }
      }
    });
  }

  if (stations !== null) {
    const { layout } = current;
    const firstRow = new Map<string, number>();
    const cells = new Map<string, { label: string }>();
    stations.rows.forEach((r) => {
      const id = r.values.station_id;
      if (typeof id === 'string') {
        const earlier = firstRow.get(id);
        if (earlier !== undefined) {
          const ref = refOf(stationRows, r.row, 'station_id');
          addRowError(tableErrors[1] as ImportError[], stations.rows, r.row, { code: 'duplicate-id', location: { table: 'stations', row: r.row, field: 'station_id', ...(ref ? { cell: ref } : {}) }, message: msgAt('stations', r.row, 'station_id', `"${id}" is already used in row ${earlier}.`, ref) });
        } else firstRow.set(id, r.row);
      }
      const { cell_x: x, cell_y: y } = r.values;
      if (x === undefined || y === undefined) return;
      const ref = refOf(stationRows, r.row, 'cell_x');
      const loc = { table: 'stations' as const, row: r.row, field: 'cell_x/cell_y', ...(ref ? { cell: ref } : {}) };
      const problem = (code: ImportErrorCode, text: string): void =>
        addRowError(tableErrors[1] as ImportError[], stations.rows, r.row, { code, location: loc, message: msgAt('stations', r.row, 'cell_x/cell_y', text, ref) });
      const name = `(${x}, ${y})`;
      if (x >= layout.cols || y >= layout.rows) problem('cell-out-of-bounds', `${name} is outside the ${layout.cols} × ${layout.rows} grid.`);
      else if (layout.blockedCells.some((b) => b[0] === x && b[1] === y)) problem('cell-occupied', `${name} is blocked.`);
      else if (layout.entrance[0] === x && layout.entrance[1] === y) problem('cell-occupied', `${name} is the entrance.`);
      else if (layout.exit[0] === x && layout.exit[1] === y) problem('cell-occupied', `${name} is the exit.`);
      else {
        const other = cells.get(`${x},${y}`);
        if (other !== undefined) problem('cell-occupied', `${name} is used by ${other.label}.`);
        else cells.set(`${x},${y}`, { label: r.values.label ?? r.values.station_id ?? 'another station' });
      }
    });
    if (stations.rows.length > LIMITS.maxStations) {
      (tableErrors[1] as ImportError[]).push({ code: 'too-many-stations', message: `At most ${LIMITS.maxStations} stations (got ${stations.rows.length}).` });
    }
  }
  const totalAttendees = arrivals !== null
    ? arrivals.rows.reduce((n, r) => n + (r.values.count ?? 0), 0)
    : current.cohorts.reduce((n, c) => n + c.count, 0);
  const attendeeError: ImportError[] = arrivals !== null && totalAttendees > LIMITS.maxAttendees
    ? [{ code: 'too-many-attendees', message: `At most ${decimals(LIMITS.maxAttendees)} attendees in total (got ${decimals(totalAttendees)}).` }]
    : [];

  // Document order: headers, arrivals rows, stations rows, settings rows, then the limits.
  const rowErrors = (rows: PreviewRow<unknown>[] | undefined, extra: ImportError[]): ImportError[] => {
    const own = (rows ?? []).flatMap((r) => r.errors);
    return [...own, ...extra.filter((e) => !own.includes(e))];
  };
  errors.push(...(input.arrivals?.headerErrors ?? []), ...(input.stations?.headerErrors ?? []), ...(input.settings?.headerErrors ?? []));
  errors.push(...rowErrors(arrivals?.rows as PreviewRow<unknown>[] | undefined, tableErrors[0] as ImportError[]));
  errors.push(...rowErrors(stations?.rows as PreviewRow<unknown>[] | undefined, tableErrors[1] as ImportError[]));
  errors.push(...(settings?.rows ?? []).flatMap((r) => r.errors));
  errors.push(...attendeeError);

  const headersOk = (input.arrivals?.headerErrors.length ?? 0) + (input.stations?.headerErrors.length ?? 0) + (input.settings?.headerErrors.length ?? 0) === 0;
  const fieldsOk = headersOk && (arrivals?.complete ?? true) && (stations?.complete ?? true) && (settings?.complete ?? true);

  let candidate: Scenario | null = null;
  if (fieldsOk) {
    const importedStations: Station[] | null = stations === null ? null : stations.values.map((v) => {
      const s = v as StationsRow;
      return { id: s.station_id, label: s.label, cell: [s.cell_x, s.cell_y], servers: s.servers, service: serviceFromSeconds(s.service_min_s, s.service_mode_s, s.service_max_s) };
    });
    const importedCohorts: Cohort[] | null = arrivals === null ? null : arrivals.values.map((v) => {
      const a = v as ArrivalsRow;
      return { id: a.cohort_id, startMs: minutesToMs(a.start_min), endMs: minutesToMs(a.end_min), count: a.count, arrivals: a.arrival_pattern, route: a.route };
    });
    const built: Scenario = {
      ...current,
      stations: importedStations ?? current.stations,
      cohorts: importedCohorts ?? current.cohorts,
      ...(settings?.values.title === undefined ? {} : { title: settings.values.title }),
      ...(settings?.values.horizonMs === undefined ? {} : { horizonMs: settings.values.horizonMs }),
      ...(settings?.values.walkSpeedMps === undefined ? {} : { walkSpeedMps: settings.values.walkSpeedMps }),
      ...(settings?.values.baseSeed === undefined ? {} : { baseSeed: settings.values.baseSeed }),
      revision: current.revision + 1,
    };
    candidate = built;
    const taken = new Set(errors.filter((e) => e.location !== undefined).map((e) => keyOf(e.location as ImportLocation)));
    const result = deps.validate(built);
    if (!result.ok) {
      const cache = deps.pathCache(built);
      for (const issue of result.issues) {
        if (issue.code === 'STATION_LIMIT' && errors.some((e) => e.code === 'too-many-stations')) continue;
        if (issue.code === 'ATTENDEE_LIMIT' && errors.some((e) => e.code === 'too-many-attendees')) continue;
        const mapped = mapIssue(issue, built, input, cache.unreachable);
        if (mapped.location !== undefined && taken.has(keyOf(mapped.location))) continue;
        if (mapped.location !== undefined) taken.add(keyOf(mapped.location));
        errors.push(mapped);
        if (mapped.location !== undefined) {
          const rows = mapped.location.table === 'stations' ? stations?.rows : mapped.location.table === 'arrivals' ? arrivals?.rows : undefined;
          (rows as PreviewRow<unknown>[] | undefined)?.find((r) => r.row === mapped.location?.row)?.errors.push(mapped);
        }
      }
    }
  }
  if (errors.length > 0) candidate = null;
  const canonicalHash = candidate === null ? null : await deps.hash(candidate);

  return {
    previewVersion: 1,
    source: input.source,
    sheetsRead: input.sheetsRead,
    sheetsIgnored: input.sheetsIgnored,
    columnsNotRead: input.columnsNotRead,
    settingsKeysNotRead: settings?.notRead ?? [],
    arrivals: arrivals?.rows ?? null,
    stations: stations?.rows ?? null,
    settings: settings?.rows ?? null,
    formulaCells,
    errors,
    candidate,
    canonicalHash,
  };
}

const STATION_FIELDS: Record<string, string> = {
  id: 'station_id', servers: 'servers', 'service.seconds': 'service_min_s', 'service.minS': 'service_min_s',
  'service.modeS': 'service_mode_s', 'service.maxS': 'service_max_s', cell: 'cell_x/cell_y',
};
const COHORT_FIELDS: Record<string, string> = { id: 'cohort_id', startMs: 'start_min', endMs: 'end_min', count: 'count', arrivals: 'arrival_pattern', route: 'route' };

const ISSUE_CODES: Partial<Record<ValidationIssue['code'], ImportErrorCode>> = {
  ID_FORMAT: 'bad-id', DUPLICATE_ID: 'duplicate-id', SERVERS_RANGE: 'out-of-range', SERVICE_RANGE: 'bad-service', COHORT_WINDOW: 'bad-window',
  COUNT_RANGE: 'out-of-range', ARRIVAL_PATTERN: 'bad-pattern', ROUTE_LENGTH: 'route-too-long', ROUTE_UNKNOWN_STATION: 'unknown-station',
  ROUTE_REPEAT: 'repeated-station', ATTENDEE_LIMIT: 'too-many-attendees', STATION_LIMIT: 'too-many-stations', CELL_OUT_OF_BOUNDS: 'cell-out-of-bounds',
  CELL_BLOCKED: 'cell-occupied', UNREACHABLE: 'unreachable',
};

/** Map one validator issue to (table, row, field) through its path; an issue on a table this import did not supply is a Current scenario entry. */
function mapIssue(
  issue: ValidationIssue,
  candidate: Scenario,
  input: BuildInput,
  unreachable: { from: { kind: string }; to: { kind: string; id?: string } }[],
): ImportError {
  const code = ISSUE_CODES[issue.code] ?? 'bad-settings';
  const entry = /^(stations|cohorts)\[(\d+)\](?:\.(.+))?$/.exec(issue.path);
  const prefix = (table: 'stations' | 'cohorts', index: number, field: string): ImportError => {
    const supplied = table === 'stations' ? input.stations : input.arrivals;
    const row = supplied?.rows[index];
    if (supplied === null || row === undefined) {
      const id = table === 'stations' ? candidate.stations[index]?.id : candidate.cohorts[index]?.id;
      const noun = table === 'stations' ? 'station' : 'cohort';
      return { code, message: `Current scenario, ${noun} "${id ?? issue.entity?.id ?? '?'}", ${field}: ${issue.message}` };
    }
    const tableName: ImportTable = table === 'stations' ? 'stations' : 'arrivals';
    const ref = row.cells[field.split('/')[0] as string]?.ref;
    return {
      code,
      location: { table: tableName, row: row.row, field, ...(ref === undefined ? {} : { cell: ref }) },
      message: ref === undefined ? `Row ${row.row}, ${field}: ${issue.message}` : `${ref.sheet}!${ref.cell} (${field}): ${issue.message}`,
    };
  };
  if (entry !== null) {
    const table = entry[1] as 'stations' | 'cohorts';
    const index = Number(entry[2]);
    const sub = (entry[3] ?? '').replace(/\[\d+\]$/, '');
    const field = (table === 'stations' ? STATION_FIELDS : COHORT_FIELDS)[sub];
    return prefix(table, index, field ?? sub);
  }
  if (issue.code === 'UNREACHABLE' && issue.path === 'layout') {
    for (const pair of unreachable) {
      if (pair.from.kind !== 'entrance' || pair.to.kind !== 'station' || pair.to.id === undefined) continue;
      if (!issue.message.includes(describeNode(candidate, { kind: 'station', id: pair.to.id }))) continue;
      const index = candidate.stations.findIndex((s) => s.id === pair.to.id);
      return prefix('stations', index, 'cell_x/cell_y');
    }
  }
  return { code, message: `${issue.path.startsWith('layout') ? 'Layout' : 'Scenario'}: ${issue.message}` };
}
