import type { CellValue, WorkbookReader } from '../../src/imports/workbookReader';

export const READ_SHEETS = ['Arrivals', 'Stations', 'Settings'] as const;

export type FakeWorkbook = WorkbookReader & { opened: string[] };

/**
 * A workbook reader built from cell rows, without a binary file. `sheet(name)` records every name it is asked
 * for and throws for any name outside Arrivals, Stations and Settings (requirement 2.2, invariant I10).
 * Sheet names are listed in the order given (the order of the entries, or of the keys of an object).
 */
export function fakeWorkbook(input: Record<string, CellValue[][]> | [string, CellValue[][]][]): FakeWorkbook {
  // An entries array keeps the given order for any name; an object reorders integer-like names such as '0' first.
  const entries = Array.isArray(input) ? input : Object.entries(input);
  const sheets = Object.fromEntries(entries);
  const opened: string[] = [];
  return {
    opened,
    sheetNames: () => entries.map(([name]) => name),
    sheet(name: string) {
      opened.push(name);
      if (!(READ_SHEETS as readonly string[]).includes(name)) {
        throw new Error(`fake workbook: sheet "${name}" must never be opened`);
      }
      const rows = sheets[name];
      return rows === undefined ? null : { rows: () => rows };
    },
  };
}

/** Cell helpers: a text cell, a number cell and a blank cell at sheet!cell. */
export const text = (sheet: string, cell: string, value: string): CellValue => ({ kind: 'text', ref: { sheet, cell }, value });
export const num = (sheet: string, cell: string, value: number): CellValue => ({ kind: 'number', ref: { sheet, cell }, value });
export const blank = (sheet: string, cell: string): CellValue => ({ kind: 'blank', ref: { sheet, cell } });

const COLUMNS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Rows of strings and numbers to CellValue rows with A1 addresses (numbers become number cells). */
export function sheetRows(sheet: string, rows: (string | number | null)[][]): CellValue[][] {
  return rows.map((row, r) =>
    row.map((value, c) => {
      const cell = `${COLUMNS[c]}${r + 1}`;
      if (value === null) return blank(sheet, cell);
      return typeof value === 'number' ? num(sheet, cell, value) : text(sheet, cell, value);
    }),
  );
}

export const ARRIVALS_HEADER = ['cohort_id', 'start_min', 'end_min', 'count', 'arrival_pattern', 'route'];
export const STATIONS_HEADER = ['station_id', 'label', 'servers', 'service_min_s', 'service_mode_s', 'service_max_s', 'cell_x', 'cell_y'];

/** The Harbor Hall baseline as the three sheets of the template. */
export function harborHallSheets(): Record<string, CellValue[][]> {
  return {
    Arrivals: sheetRows('Arrivals', [ARRIVALS_HEADER, ['doors', 0, 20, 120, 'uniform', 'checkin|packs']]),
    Stations: sheetRows('Stations', [
      STATIONS_HEADER,
      ['checkin', 'Check-in desk', 1, 8, 15, 22, 10, 12],
      ['packs', 'Welcome packs', 2, 6, 10, 14, 34, 12],
    ]),
    Settings: sheetRows('Settings', [
      ['key', 'value'],
      ['title', 'Harbor Hall Community Fair: baseline'],
      ['horizon_min', 40],
      ['walk_speed_mps', 1.2],
      ['base_seed', 'harbor-hall-2026'],
    ]),
  };
}
