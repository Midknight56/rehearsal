// Workbook adapter (requirement 2). Only the sheets named Arrivals, Stations and Settings are opened; every other sheet
// is listed under Not read and never touched. A formula is read by its saved value and never evaluated.
import type { Scenario } from '../domain/scenario';
import {
  ARRIVALS_COLUMNS, STATIONS_COLUMNS, buildPreview, emptyPreview, matchHeader, tooLargeMessage,
  type CellRef, type Deps, type ImportError, type ImportPreview, type ImportTable, type SourceCell, type SourceRow, type SourceTable,
} from './preview';
import { TEMPLATE_SHEETS, openWorkbook, type CellValue, type WorkbookReader } from './workbookReader';

const SETTINGS_COLUMNS = ['key', 'value'] as const;

function toSourceCell(cell: CellValue): SourceCell {
  switch (cell.kind) {
    case 'blank': return { kind: 'blank', ref: cell.ref };
    case 'number': return { kind: 'number', value: cell.value, ref: cell.ref, ...(cell.formula === undefined ? {} : { formula: true }) };
    case 'text': return { kind: 'text', text: cell.value, ref: cell.ref, ...(cell.formula === undefined ? {} : { formula: true }) };
    case 'formula-no-value': return { kind: 'formula-no-value', ref: cell.ref };
    case 'date': return { kind: 'unsupported', what: 'a date cell', ref: cell.ref };
    case 'boolean': return { kind: 'unsupported', what: 'a boolean cell', ref: cell.ref };
    case 'error': return { kind: 'unsupported', what: 'an error cell', ref: cell.ref };
  }
}

const headerText = (cell: CellValue | undefined): string =>
  cell === undefined ? '' : cell.kind === 'text' ? cell.value : cell.kind === 'number' ? String(cell.value) : '';

const isBlank = (cell: CellValue): boolean => cell.kind === 'blank' || (cell.kind === 'text' && cell.value.trim() === '');

function toTable(rows: CellValue[][], template: readonly string[], table: ImportTable): { source: SourceTable; notRead: string[] } {
  const header = matchHeader((rows[0] ?? []).map(headerText), template, table);
  const out: SourceRow[] = [];
  rows.slice(1).forEach((cells, i) => {
    if (cells.every(isBlank)) return;
    const record: SourceRow['cells'] = {};
    for (const [name, index] of Object.entries(header.index)) {
      const cell = cells[index];
      if (cell !== undefined) record[name] = toSourceCell(cell);
    }
    out.push({ row: i + 2, cells: record });
  });
  return { source: { rows: out, headerErrors: header.errors }, notRead: header.notRead };
}

export async function previewWorkbook(file: File, current: Scenario, deps: Deps): Promise<ImportPreview> {
  const source: ImportPreview['source'] = { kind: 'xlsx', name: file.name, bytes: file.size };
  if (file.size > deps.maxBytes) {
    return emptyPreview(source, [{ code: 'file-too-large', message: tooLargeMessage(file.name, file.size) }]);
  }
  const unreadable = (error: unknown): ImportPreview =>
    emptyPreview(source, [{ code: 'file-unreadable', message: `Could not read ${file.name} as a workbook: ${error instanceof Error ? error.name : 'Error'}.` }]);

  let reader: WorkbookReader;
  let names: string[];
  try {
    reader = (deps.reader ?? openWorkbook)(await file.arrayBuffer());
    names = reader.sheetNames();
  } catch (error) {
    return unreadable(error);
  }

  const present = TEMPLATE_SHEETS.filter((name) => names.includes(name));
  const ignored = names.filter((name) => !(TEMPLATE_SHEETS as readonly string[]).includes(name));
  const missing: ImportError[] = (['Arrivals', 'Stations'] as const)
    .filter((name) => !names.includes(name))
    .map((name) => ({ code: 'missing-sheet', message: `The workbook has no sheet named "${name}". Sheets found: ${names.join(', ')}.` }));
  if (missing.length > 0) return emptyPreview(source, missing, { sheetsRead: [...present], sheetsIgnored: ignored });

  const rowsOf = (name: (typeof TEMPLATE_SHEETS)[number]): CellValue[][] => (reader.sheet(name)?.rows() ?? []);
  let arrivals: ReturnType<typeof toTable>;
  let stations: ReturnType<typeof toTable>;
  let settings: ReturnType<typeof toTable> | null = null;
  try {
    arrivals = toTable(rowsOf('Arrivals'), ARRIVALS_COLUMNS, 'arrivals');
    stations = toTable(rowsOf('Stations'), STATIONS_COLUMNS, 'stations');
    if (names.includes('Settings')) settings = toTable(rowsOf('Settings'), SETTINGS_COLUMNS, 'settings');
  } catch (error) {
    return unreadable(error);
  }

  const preview = await buildPreview({
    current, deps, source, sheetsRead: [...present], sheetsIgnored: ignored,
    columnsNotRead: { arrivals: arrivals.notRead, stations: stations.notRead },
    arrivals: arrivals.source, stations: stations.source, settings: settings?.source ?? null,
  });
  const cells: CellRef[] = preview.formulaCells;
  preview.formulaCells = cells.filter((c, i) => cells.findIndex((d) => d.sheet === c.sheet && d.cell === c.cell) === i);
  return preview;
}
