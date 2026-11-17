import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scenarioHash } from '../../src/domain/hash';
import type { Scenario } from '../../src/domain/scenario';
import { previewCsv } from '../../src/imports/csv';
import { previewWorkbook } from '../../src/imports/xlsx';
import type { CellValue } from '../../src/imports/workbookReader';
import { TEMPLATE_ARRIVALS_CSV, TEMPLATE_STATIONS_CSV, baselineScenario, csvFile, deps, messages } from './helpers';
import { blank, fakeWorkbook, harborHallSheets, num, text } from './fakeWorkbook';

const xlsx = (name = 'book.xlsx'): File => new File([new Uint8Array([80, 75, 3, 4])], name);
const withFake = (sheets: Record<string, CellValue[][]>) => {
  const book = fakeWorkbook(sheets);
  return { book, deps: deps({ reader: () => book }) };
};
const realFile = (path: string): File => new File([readFileSync(path)], path.split('/').pop() as string);

describe('2.1 sheets read and ignored', () => {
  it('lists the three template sheets as read and any other sheet as ignored', async () => {
    const attendees = [[text('Attendees', 'A1', 'name'), text('Attendees', 'B1', 'email')]];
    const { deps: d } = withFake({ ...harborHallSheets(), Attendees: attendees });
    const p = await previewWorkbook(xlsx(), baselineScenario(), d);
    expect(p.sheetsRead).toEqual(['Arrivals', 'Stations', 'Settings']);
    expect(p.sheetsIgnored).toEqual(['Attendees']);
    expect(p.errors).toEqual([]);
  });
});

describe('2.2 sheet isolation (matrix row 14)', () => {
  it('never asks the reader for a sheet outside the three, and the fake throws if it does', async () => {
    const { book, deps: d } = withFake({ ...harborHallSheets(), Attendees: [[text('Attendees', 'A1', 'Example Person')]], Secret: [[text('Secret', 'A1', 'x')]] });
    const p = await previewWorkbook(xlsx(), baselineScenario(), d);
    expect(p.errors).toEqual([]);
    expect(book.opened.every((name) => ['Arrivals', 'Stations', 'Settings'].includes(name))).toBe(true);
    expect(p.sheetsIgnored).toEqual(['Attendees', 'Secret']);
  });

  it('imports harbor-hall-extra-sheet.xlsx with Attendees not read and the baseline hash', async () => {
    const baseline = baselineScenario();
    const p = await previewWorkbook(realFile('tests/imports/fixtures/harbor-hall-extra-sheet.xlsx'), baseline, deps());
    expect(p.sheetsIgnored).toEqual(['Attendees']);
    expect(JSON.stringify(p.candidate)).not.toContain('Example Person');
    expect(p.canonicalHash).toBe(await scenarioHash(baseline));
  });
});

describe('2.3 missing sheets', () => {
  it('refuses a workbook without Stations and shows no rows', async () => {
    const { Arrivals, Settings } = harborHallSheets();
    const { deps: d } = withFake({ Arrivals: Arrivals as CellValue[][], Settings: Settings as CellValue[][] });
    const p = await previewWorkbook(xlsx(), baselineScenario(), d);
    expect(messages(p)).toEqual(['The workbook has no sheet named "Stations". Sheets found: Arrivals, Settings.']);
    expect(p.arrivals).toBeNull();
    expect(p.stations).toBeNull();
    expect(p.candidate).toBeNull();
  });

  it('the real harbor-hall-missing-stations.xlsx gives the same message', async () => {
    const p = await previewWorkbook(realFile('tests/imports/fixtures/harbor-hall-missing-stations.xlsx'), baselineScenario(), deps());
    expect(messages(p)).toEqual(['The workbook has no sheet named "Stations". Sheets found: Arrivals, Settings.']);
  });

  it('keeps the current settings when Settings is absent', async () => {
    const { Arrivals, Stations } = harborHallSheets();
    const { deps: d } = withFake({ Arrivals: Arrivals as CellValue[][], Stations: Stations as CellValue[][] });
    const current: Scenario = { ...baselineScenario(), title: 'Mine', baseSeed: 'mine' };
    const p = await previewWorkbook(xlsx(), current, d);
    expect(p.errors).toEqual([]);
    expect(p.settings).toBeNull();
    expect(p.candidate?.title).toBe('Mine');
    expect(p.candidate?.baseSeed).toBe('mine');
  });
});

describe('2.4 sheet and cell messages, Settings keys', () => {
  it('names sheet and cell for a field error', async () => {
    const sheets = harborHallSheets();
    (sheets.Stations as CellValue[][])[2]![2] = text('Stations', 'C3', 'two');
    const p = await previewWorkbook(xlsx(), baselineScenario(), withFake(sheets).deps);
    expect(messages(p)).toEqual(['Stations!C3 (servers): must be a whole number from 1 to 20 (got "two").']);
    expect(p.candidate).toBeNull();
  });

  it('applies Settings keys and checks their ranges', async () => {
    const sheets = harborHallSheets();
    (sheets.Settings as CellValue[][])[2]![1] = num('Settings', 'B3', 400);
    const bad = await previewWorkbook(xlsx(), baselineScenario(), withFake(sheets).deps);
    expect(messages(bad)).toEqual(['Settings!B3 (horizon_min): must be greater than 0 and at most 360 (got 400).']);
    const ok = harborHallSheets();
    (ok.Settings as CellValue[][])[2]![1] = num('Settings', 'B3', 30);
    const p = await previewWorkbook(xlsx(), baselineScenario(), withFake(ok).deps);
    expect(p.candidate?.horizonMs).toBe(1_800_000);
  });

  it('lists unknown Settings keys and does not apply them', async () => {
    const sheets = harborHallSheets();
    (sheets.Settings as CellValue[][]).push([text('Settings', 'A6', 'currency'), text('Settings', 'B6', 'EUR')]);
    const baseline = baselineScenario();
    const p = await previewWorkbook(xlsx(), baseline, withFake(sheets).deps);
    expect(p.settingsKeysNotRead).toEqual(['currency']);
    expect(p.canonicalHash).toBe(await scenarioHash(baseline));
  });
});

describe('2.5 formulas', () => {
  const stationsWith = (cell: CellValue): Record<string, CellValue[][]> => {
    const sheets = harborHallSheets();
    (sheets.Stations as CellValue[][])[2]![2] = cell;
    return sheets;
  };

  it('uses the saved value, marks the cell and lists it', async () => {
    const baseline = baselineScenario();
    const cell: CellValue = { kind: 'number', ref: { sheet: 'Stations', cell: 'C3' }, value: 2, formula: '1+1' };
    const p = await previewWorkbook(xlsx(), baseline, withFake(stationsWith(cell)).deps);
    expect(p.errors).toEqual([]);
    expect(p.formulaCells).toEqual([{ sheet: 'Stations', cell: 'C3' }]);
    expect(p.stations?.[1]?.formulaFields).toEqual(['servers']);
    expect(p.canonicalHash).toBe(await scenarioHash(baseline));
  });

  it('refuses a formula with no saved value', async () => {
    const cell: CellValue = { kind: 'formula-no-value', ref: { sheet: 'Stations', cell: 'C3' }, formula: '1+1' };
    const p = await previewWorkbook(xlsx(), baselineScenario(), withFake(stationsWith(cell)).deps);
    expect(messages(p)).toEqual(['Stations!C3 (servers) is a formula with no saved value. Open the workbook, let it calculate, save, and import again.']);
    expect(p.candidate).toBeNull();
  });

  it('the real formula workbooks behave the same', async () => {
    const baseline = baselineScenario();
    const saved = await previewWorkbook(realFile('tests/imports/fixtures/harbor-hall-formula-saved.xlsx'), baseline, deps());
    expect(saved.formulaCells).toEqual([{ sheet: 'Stations', cell: 'C3' }]);
    expect(saved.canonicalHash).toBe(await scenarioHash(baseline));
    const unsaved = await previewWorkbook(realFile('tests/imports/fixtures/harbor-hall-formula-unsaved.xlsx'), baseline, deps());
    expect(messages(unsaved)).toEqual(['Stations!C3 (servers) is a formula with no saved value. Open the workbook, let it calculate, save, and import again.']);
  });
});

describe('2.6 cell kinds', () => {
  const arrivalsWith = (cell: CellValue): Record<string, CellValue[][]> => {
    const sheets = harborHallSheets();
    (sheets.Arrivals as CellValue[][])[1]![1] = cell;
    return sheets;
  };

  it.each([
    ['date', 'a date cell'],
    ['boolean', 'a boolean cell'],
    ['error', 'an error cell'],
  ] as const)('reports a %s cell in a numeric field', async (kind, found) => {
    const p = await previewWorkbook(xlsx(), baselineScenario(), withFake(arrivalsWith({ kind, ref: { sheet: 'Arrivals', cell: 'B2' } })).deps);
    expect(messages(p)).toEqual([`Arrivals!B2 (start_min): expected a number, found ${found}.`]);
  });

  it('reads a blank numeric cell as an error, never as 0', async () => {
    const p = await previewWorkbook(xlsx(), baselineScenario(), withFake(arrivalsWith(blank('Arrivals', 'B2'))).deps);
    expect(p.candidate).toBeNull();
    expect(p.errors[0]?.location?.cell).toEqual({ sheet: 'Arrivals', cell: 'B2' });
  });

  it('reads a text cell that holds a number and a number in a text field', async () => {
    const sheets = harborHallSheets();
    (sheets.Arrivals as CellValue[][])[1]![3] = text('Arrivals', 'D2', '120');
    (sheets.Stations as CellValue[][])[1]![1] = num('Stations', 'B2', 7);
    const p = await previewWorkbook(xlsx(), baselineScenario(), withFake(sheets).deps);
    expect(p.errors).toEqual([]);
    expect(p.candidate?.cohorts[0]?.count).toBe(120);
    expect(p.candidate?.stations[0]?.label).toBe('7');
  });

  it('the real date-cell and text-number workbooks', async () => {
    const baseline = baselineScenario();
    const date = await previewWorkbook(realFile('tests/imports/fixtures/harbor-hall-date-cell.xlsx'), baseline, deps());
    expect(messages(date)).toEqual(['Arrivals!B2 (start_min): expected a number, found a date cell.']);
    const texts = await previewWorkbook(realFile('tests/imports/fixtures/harbor-hall-text-numbers.xlsx'), baseline, deps());
    expect(texts.canonicalHash).toBe(await scenarioHash(baseline));
  });
});

describe('2.7 three ways to the same hash (matrix row 14)', () => {
  it('harbor-hall.xlsx, the CSV pair and baseline.json agree', async () => {
    const baseline = baselineScenario();
    const expected = await scenarioHash(baseline);
    const workbook = await previewWorkbook(realFile('public/examples/harbor-hall/harbor-hall.xlsx'), baseline, deps());
    const csv = await previewCsv(
      [{ table: 'arrivals', file: csvFile('arrivals.csv', TEMPLATE_ARRIVALS_CSV) }, { table: 'stations', file: csvFile('stations.csv', TEMPLATE_STATIONS_CSV) }],
      baseline,
      deps(),
    );
    expect(workbook.errors).toEqual([]);
    expect(workbook.canonicalHash).toBe(expected);
    expect(csv.canonicalHash).toBe(expected);
    expect(workbook.sheetsRead).toEqual(['Arrivals', 'Stations', 'Settings']);
    expect(workbook.sheetsIgnored).toEqual([]);
  });

  it('rehearsal-template.xlsx has the same bytes as harbor-hall.xlsx', () => {
    expect(readFileSync('public/examples/rehearsal-template.xlsx')).toEqual(readFileSync('public/examples/harbor-hall/harbor-hall.xlsx'));
  });
});

describe('2.10 unreadable workbook', () => {
  it('shows the error name when the reader throws and changes nothing', async () => {
    const d = deps({ reader: () => { throw new RangeError('bad zip'); } });
    const p = await previewWorkbook(xlsx('broken.xlsx'), baselineScenario(), d);
    expect(messages(p)).toEqual(['Could not read broken.xlsx as a workbook: RangeError.']);
    expect(p.candidate).toBeNull();
  });

  it('refuses a workbook above 2,097,152 bytes before reading it', async () => {
    let called = false;
    const d = deps({ reader: () => { called = true; throw new Error('must not be called'); } });
    const big = new File([new Uint8Array(2_097_153)], 'big.xlsx');
    const p = await previewWorkbook(big, baselineScenario(), d);
    expect(messages(p)).toEqual(['big.xlsx is 2.00 MiB; the limit is 2 MiB.']);
    expect(called).toBe(false);
  });
});
