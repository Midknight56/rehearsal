// Writes the three template sheets with SheetJS Community Edition (xlsx 0.20.3, Apache-2.0). Strings go in as text cells and
// numbers as numeric cells; no cell object is ever given a formula, so no formula is written.
import * as XLSX from 'xlsx';
import type { Scenario } from '../domain/scenario';

export type SheetRows = (string | number)[][];
export type WorkbookSheets = { Arrivals: SheetRows; Stations: SheetRows; Settings: SheetRows };

const SHEET_ORDER = ['Arrivals', 'Stations', 'Settings'] as const;

/** The three sheets as plain arrays, in the template's columns and display units (minutes, seconds). */
export function workbookRows(scenario: Scenario): WorkbookSheets {
  return {
    Arrivals: [
      ['cohort_id', 'start_min', 'end_min', 'count', 'arrival_pattern', 'route'],
      ...scenario.cohorts.map((c): (string | number)[] => [c.id, c.startMs / 60_000, c.endMs / 60_000, c.count, c.arrivals, c.route.join('|')]),
    ],
    Stations: [
      ['station_id', 'label', 'servers', 'service_min_s', 'service_mode_s', 'service_max_s', 'cell_x', 'cell_y'],
      ...scenario.stations.map((s): (string | number)[] => {
        const [min, mode, max] = s.service.kind === 'constant'
          ? [s.service.seconds, s.service.seconds, s.service.seconds]
          : [s.service.minS, s.service.modeS, s.service.maxS];
        return [s.id, s.label, s.servers, min, mode, max, s.cell[0], s.cell[1]];
      }),
    ],
    Settings: [
      ['key', 'value'],
      ['title', scenario.title],
      ['horizon_min', scenario.horizonMs / 60_000],
      ['walk_speed_mps', scenario.walkSpeedMps],
      ['base_seed', scenario.baseSeed],
    ],
  };
}

/** The bytes of an xlsx workbook with exactly the sheets Arrivals, Stations and Settings. */
export function exportWorkbook(scenario: Scenario): Uint8Array {
  const rows = workbookRows(scenario);
  const book = XLSX.utils.book_new();
  for (const name of SHEET_ORDER) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows[name]), name);
  const written: unknown = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(written as ArrayBuffer);
}
