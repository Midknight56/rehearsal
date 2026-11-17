import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { exportWorkbook, workbookRows } from '../../src/exports/xlsx';
import { hostile } from './fixtures/hostile';
import { baseline } from './fixtures/pairs';
import { plusOneCheckin } from '../model/fixtures/harbor-hall';

const ARRIVALS = [
  ['cohort_id', 'start_min', 'end_min', 'count', 'arrival_pattern', 'route'],
  ['doors', 0, 20, 120, 'uniform', 'checkin|packs'],
];
const STATIONS = [
  ['station_id', 'label', 'servers', 'service_min_s', 'service_mode_s', 'service_max_s', 'cell_x', 'cell_y'],
  ['checkin', 'Check-in desk', 1, 8, 15, 22, 10, 12],
  ['packs', 'Welcome packs', 2, 6, 10, 14, 34, 12],
];

function readBack(bytes: Uint8Array) {
  const book = XLSX.read(bytes, { type: 'array', cellFormula: true });
  const rows = (name: string): unknown[][] =>
    XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name]!, { header: 1, raw: true });
  return { book, rows };
}

describe('workbookRows (requirement 7.6)', () => {
  it('gives the three arrays of the Harbor Hall baseline', () => {
    expect(workbookRows(baseline)).toEqual({
      Arrivals: ARRIVALS,
      Stations: STATIONS,
      Settings: [
        ['key', 'value'],
        ['title', baseline.title],
        ['horizon_min', 40],
        ['walk_speed_mps', 1.2],
        ['base_seed', 'harbor-hall-2026'],
      ],
    });
  });

  it('writes a constant service as three equal numbers', () => {
    expect(workbookRows(hostile).Stations[1]!.slice(2)).toEqual([1, 5, 5, 5, 2, 2]);
  });
});

describe('exportWorkbook (requirement 7.5)', () => {
  const bytes = exportWorkbook(baseline);
  const { book, rows } = readBack(bytes);

  it('returns xlsx bytes', () => {
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]);
  });

  it('has exactly the sheets Arrivals, Stations and Settings, in that order', () => {
    expect(book.SheetNames).toEqual(['Arrivals', 'Stations', 'Settings']);
  });

  it('reads back the same arrays, with numbers as numbers', () => {
    expect(rows('Arrivals')).toEqual(ARRIVALS);
    expect(rows('Stations')).toEqual(STATIONS);
    expect(rows('Settings')).toEqual(workbookRows(baseline).Settings);
    const numeric = [rows('Arrivals')[1]![1], rows('Arrivals')[1]![2], rows('Arrivals')[1]![3], rows('Stations')[1]![2], rows('Stations')[1]![4],
      rows('Settings')[2]![1], rows('Settings')[3]![1]];
    expect(numeric).toEqual([0, 20, 120, 1, 15, 40, 1.2]);
    expect(numeric.every((value) => typeof value === 'number')).toBe(true);
    expect(book.Sheets.Arrivals!.D2!.t).toBe('n');
    expect(book.Sheets.Settings!.B3!.t).toBe('n');
    expect(book.Sheets.Settings!.B2!.t).toBe('s');
  });

  it('reads the cell types of the 20, 120, 1, 8, 10, 40 and 1.2 values as numeric', () => {
    expect(book.Sheets.Arrivals!.C2!.v).toBe(20);
    expect(book.Sheets.Arrivals!.D2!.v).toBe(120);
    expect(book.Sheets.Stations!.C2!.v).toBe(1);
    expect(book.Sheets.Stations!.D2!.v).toBe(8);
    expect(book.Sheets.Stations!.E3!.v).toBe(10);
    expect(book.Sheets.Settings!.B3!.v).toBe(40);
    expect(book.Sheets.Settings!.B4!.v).toBe(1.2);
  });

  it('writes no formula cell in any sheet, including for a hostile scenario', () => {
    for (const scenario of [baseline, plusOneCheckin, hostile]) {
      const read = readBack(exportWorkbook(scenario)).book;
      for (const name of read.SheetNames) {
        const sheet = read.Sheets[name]!;
        for (const address of Object.keys(sheet).filter((key) => !key.startsWith('!'))) {
          expect((sheet[address] as XLSX.CellObject).f).toBeUndefined();
        }
      }
    }
  });

  it('reads =SUM(A1:A3) back as text, not as a formula', () => {
    const { book: read, rows: hostileRows } = readBack(exportWorkbook(hostile));
    expect(hostileRows('Stations')[1]![1]).toBe('=SUM(A1:A3)');
    expect(read.Sheets.Stations!.B2!.t).toBe('s');
    expect(read.Sheets.Stations!.B2!.f).toBeUndefined();
    expect(hostileRows('Arrivals')[1]![0]).toBe('+late');
    expect(hostileRows('Settings')[1]![1]).toBe('-Harbor');
  });
});
