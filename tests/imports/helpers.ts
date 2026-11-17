import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { scenarioHash } from '../../src/domain/hash';
import type { Layout, Scenario } from '../../src/domain/scenario';
import { validateScenario } from '../../src/domain/validate';
import { createPathCache } from '../../src/spatial/path-cache';
import type { Deps } from '../../src/imports/preview';

export const ARRIVALS_HEADER = 'cohort_id,start_min,end_min,count,arrival_pattern,route';
export const STATIONS_HEADER = 'station_id,label,servers,service_min_s,service_mode_s,service_max_s,cell_x,cell_y';
export const ARRIVALS_ROW = 'doors,0,20,120,uniform,checkin|packs';
export const CHECKIN_ROW = 'checkin,Check-in desk,1,8,15,22,10,12';
export const PACKS_ROW = 'packs,Welcome packs,2,6,10,14,34,12';
export const TEMPLATE_ARRIVALS_CSV = `${ARRIVALS_HEADER}\n${ARRIVALS_ROW}\n`;
export const TEMPLATE_STATIONS_CSV = `${STATIONS_HEADER}\n${CHECKIN_ROW}\n${PACKS_ROW}\n`;

export function deps(overrides: Partial<Deps> = {}): Deps {
  return { validate: validateScenario, hash: scenarioHash, pathCache: createPathCache, maxBytes: 2_097_152, ...overrides };
}

export function csvFile(name: string, text: string): File {
  return new File([text], name, { type: 'text/csv' });
}

export function fixtureFile(name: string): File {
  return new File([readFileSync(`tests/imports/fixtures/${name}`)], name);
}

export function baselineScenario(): Scenario {
  return JSON.parse(readFileSync('public/examples/harbor-hall/baseline.json', 'utf8')) as Scenario;
}

export function ringLayout(): Layout {
  return JSON.parse(readFileSync('tests/imports/fixtures/layout-ring-30-4.json', 'utf8')) as Layout;
}

export function messages(preview: { errors: { message: string }[] }): string[] {
  return preview.errors.map((e) => e.message);
}

const csvHeaders = {
  arrivals: ['cohort_id', 'start_min', 'end_min', 'count', 'arrival_pattern', 'route'],
  stations: ['station_id', 'label', 'servers', 'service_min_s', 'service_mode_s', 'service_max_s', 'cell_x', 'cell_y'],
} as const;

/** The two template CSVs of a scenario (display units), quoted by Papa Parse. */
export function scenarioToCsv(scenario: Scenario): { arrivals: string; stations: string } {
  const arrivals = scenario.cohorts.map((c) => [c.id, c.startMs / 60_000, c.endMs / 60_000, c.count, c.arrivals, c.route.join('|')]);
  const stations = scenario.stations.map((s) => [
    s.id, s.label, s.servers,
    s.service.kind === 'constant' ? s.service.seconds : s.service.minS,
    s.service.kind === 'constant' ? s.service.seconds : s.service.modeS,
    s.service.kind === 'constant' ? s.service.seconds : s.service.maxS,
    s.cell[0], s.cell[1],
  ]);
  return {
    arrivals: `${Papa.unparse({ fields: [...csvHeaders.arrivals], data: arrivals }, { newline: '\n' })}\n`,
    stations: `${Papa.unparse({ fields: [...csvHeaders.stations], data: stations }, { newline: '\n' })}\n`,
  };
}