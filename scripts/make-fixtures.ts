// Writes the workbook files of the Harbor Hall fixture and the import test fixtures with SheetJS Community Edition.
// Run: node --experimental-strip-types scripts/make-fixtures.ts
// Two runs give identical bytes: the document properties carry fixed dates and no other timestamp is written.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import * as XLSX from 'xlsx';

type Cell = XLSX.CellObject;
type Row = (Cell | string | number)[];

const FIXED = new Date(Date.UTC(2026, 10, 16, 0, 0, 0));

const ARRIVALS_HEADER = ['cohort_id', 'start_min', 'end_min', 'count', 'arrival_pattern', 'route'];
const STATIONS_HEADER = ['station_id', 'label', 'servers', 'service_min_s', 'service_mode_s', 'service_max_s', 'cell_x', 'cell_y'];

const arrivals = (): Row[] => [ARRIVALS_HEADER, ['doors', 0, 20, 120, 'uniform', 'checkin|packs']];
const stations = (): Row[] => [
  STATIONS_HEADER,
  ['checkin', 'Check-in desk', 1, 8, 15, 22, 10, 12],
  ['packs', 'Welcome packs', 2, 6, 10, 14, 34, 12],
];
const settings = (): Row[] => [
  ['key', 'value'],
  ['title', 'Harbor Hall Community Fair: baseline'],
  ['horizon_min', 40],
  ['walk_speed_mps', 1.2],
  ['base_seed', 'harbor-hall-2026'],
];
const attendees = (): Row[] => [
  ['name', 'email'],
  ['Example Person', 'person@example.org'],
  ['Second Example', 'second@example.org'],
];

function sheetOf(rows: Row[], asText = false): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {};
  let maxCol = 0;
  rows.forEach((row, r) => {
    row.forEach((value, c) => {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (typeof value === 'object') sheet[ref] = value;
      else if (typeof value === 'number') sheet[ref] = asText && r > 0 ? { t: 's', v: String(value) } : { t: 'n', v: value };
      else sheet[ref] = { t: 's', v: value };
      maxCol = Math.max(maxCol, c);
    });
  });
  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: maxCol } });
  return sheet;
}

function book(sheets: [string, XLSX.WorkSheet][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, sheet] of sheets) XLSX.utils.book_append_sheet(wb, sheet, name);
  wb.Props = { Title: 'Rehearsal fixture', Author: 'Rehearsal', CreatedDate: FIXED, ModifiedDate: FIXED };
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', cellDates: true, compression: true }) as Uint8Array;
}

function write(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  console.log(`${path} ${bytes.length} bytes`);
}

const standard = (): [string, XLSX.WorkSheet][] => [['Arrivals', sheetOf(arrivals())], ['Stations', sheetOf(stations())], ['Settings', sheetOf(settings())]];
const withStationsCell = (cell: Cell): [string, XLSX.WorkSheet][] => {
  const rows = stations();
  (rows[2] as Row)[2] = cell;
  return [['Arrivals', sheetOf(arrivals())], ['Stations', sheetOf(rows)], ['Settings', sheetOf(settings())]];
};

const harborHall = book(standard());
write('public/examples/harbor-hall/harbor-hall.xlsx', harborHall);
write('public/examples/rehearsal-template.xlsx', harborHall);

const fixtures = 'tests/imports/fixtures';
write(`${fixtures}/harbor-hall-extra-sheet.xlsx`, book([...standard(), ['Attendees', sheetOf(attendees())]]));
write(`${fixtures}/harbor-hall-missing-stations.xlsx`, book([['Arrivals', sheetOf(arrivals())], ['Settings', sheetOf(settings())]]));

const dateRows = arrivals();
(dateRows[1] as Row)[1] = { t: 'd', v: new Date(Date.UTC(2026, 10, 16)), z: 'yyyy-mm-dd' };
write(`${fixtures}/harbor-hall-date-cell.xlsx`, book([['Arrivals', sheetOf(dateRows)], ['Stations', sheetOf(stations())], ['Settings', sheetOf(settings())]]));
write(`${fixtures}/harbor-hall-text-numbers.xlsx`, book([['Arrivals', sheetOf(arrivals(), true)], ['Stations', sheetOf(stations(), true)], ['Settings', sheetOf(settings(), true)]]));

// Stations!C3 is packs.servers: the formula 1+1 gives 2, the baseline value.
write(`${fixtures}/harbor-hall-formula-saved.xlsx`, book(withStationsCell({ t: 'n', v: 2, f: '1+1' })));
write(`${fixtures}/harbor-hall-formula-unsaved.xlsx`, book(withStationsCell({ t: 'n', f: '1+1' })));
