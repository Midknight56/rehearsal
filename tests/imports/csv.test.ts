import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scenarioHash } from '../../src/domain/hash';
import type { Scenario } from '../../src/domain/scenario';
import { previewCsv } from '../../src/imports/csv';
import {
  ARRIVALS_HEADER, ARRIVALS_ROW, CHECKIN_ROW, PACKS_ROW, STATIONS_HEADER, TEMPLATE_ARRIVALS_CSV, TEMPLATE_STATIONS_CSV,
  baselineScenario, csvFile, deps, fixtureFile, messages, ringLayout,
} from './helpers';

const arrivals = (name: string, text: string) => ({ table: 'arrivals' as const, file: csvFile(name, text) });
const stations = (name: string, text: string) => ({ table: 'stations' as const, file: csvFile(name, text) });
const stationsCsv = (...rows: string[]) => `${STATIONS_HEADER}\n${rows.join('\n')}\n`;
const arrivalsCsv = (...rows: string[]) => `${ARRIVALS_HEADER}\n${rows.join('\n')}\n`;

afterEach(() => vi.restoreAllMocks());

describe('1.1 template files', () => {
  it('public/examples holds the exact template bytes and the Harbor Hall copies are identical', () => {
    expect(readFileSync('public/examples/arrivals.csv', 'utf8')).toBe(TEMPLATE_ARRIVALS_CSV);
    expect(readFileSync('public/examples/stations.csv', 'utf8')).toBe(TEMPLATE_STATIONS_CSV);
    expect(readFileSync('public/examples/harbor-hall/arrivals.csv')).toEqual(readFileSync('public/examples/arrivals.csv'));
    expect(readFileSync('public/examples/harbor-hall/stations.csv')).toEqual(readFileSync('public/examples/stations.csv'));
  });
});

describe('1.2 header matching and blank rows', () => {
  it('imports the template pair into the baseline with the baseline hash', async () => {
    const baseline = baselineScenario();
    const preview = await previewCsv([arrivals('arrivals.csv', TEMPLATE_ARRIVALS_CSV), stations('stations.csv', TEMPLATE_STATIONS_CSV)], baseline, deps());
    expect(preview.errors).toEqual([]);
    expect(preview.canonicalHash).toBe(await scenarioHash(baseline));
  });

  it('accepts the headers in any order', async () => {
    const baseline = baselineScenario();
    const reordered = 'route,arrival_pattern,count,end_min,start_min,cohort_id\ncheckin|packs,uniform,120,20,0,doors\n';
    const preview = await previewCsv([arrivals('a.csv', reordered)], baseline, deps());
    expect(preview.errors).toEqual([]);
    expect(preview.canonicalHash).toBe(await scenarioHash(baseline));
  });

  it('lists a column outside the template and does not read it', async () => {
    const baseline = baselineScenario();
    const preview = await previewCsv([{ table: 'arrivals', file: fixtureFile('arrivals-extra-column.csv') }], baseline, deps());
    expect(preview.columnsNotRead.arrivals).toEqual(['notes']);
    expect(preview.errors).toEqual([]);
    expect(preview.canonicalHash).toBe(await scenarioHash(baseline));
  });

  it('skips rows whose cells are all blank and counts source rows', async () => {
    const baseline = baselineScenario();
    const text = `${ARRIVALS_HEADER}\n,,,,,\n\n${ARRIVALS_ROW}\n`;
    const preview = await previewCsv([arrivals('a.csv', text)], baseline, deps());
    expect(preview.errors).toEqual([]);
    expect(preview.arrivals?.map((r) => r.row)).toEqual([4]);
  });

  it('allows either file alone', async () => {
    const baseline = baselineScenario();
    const only = await previewCsv([stations('s.csv', TEMPLATE_STATIONS_CSV)], baseline, deps());
    expect(only.arrivals).toBeNull();
    expect(only.stations?.length).toBe(2);
  });
});

describe('1.3 size refusal', () => {
  it('refuses a file above 2,097,152 bytes before parsing', async () => {
    const parse = vi.spyOn(Papa, 'parse');
    const header = `${ARRIVALS_HEADER}\n`;
    const body = `${ARRIVALS_ROW}\n`.repeat(Math.ceil((2_097_153 - header.length) / (ARRIVALS_ROW.length + 1)));
    const text = (header + body).slice(0, 2_097_153);
    const file = csvFile('big.csv', text);
    expect(file.size).toBe(2_097_153);
    const preview = await previewCsv([{ table: 'arrivals', file }], baselineScenario(), deps());
    expect(messages(preview)).toEqual(['big.csv is 2.00 MiB; the limit is 2 MiB.']);
    expect(preview.candidate).toBeNull();
    expect(parse).not.toHaveBeenCalled();
  });
});

describe('1.4 and 1.5 messages', () => {
  const baseline = baselineScenario;

  it('duplicate header', async () => {
    const p = await previewCsv([{ table: 'arrivals', file: fixtureFile('arrivals-duplicate-header.csv') }], baseline(), deps());
    expect(messages(p)).toContain('Column "start_min" appears twice in row 1.');
    expect(p.candidate).toBeNull();
  });

  it('missing header', async () => {
    const p = await previewCsv([arrivals('a.csv', 'cohort_id,start_min,end_min,count,arrival_pattern\ndoors,0,20,120,uniform\n')], baseline(), deps());
    expect(messages(p)).toContain('Column "route" is missing from row 1.');
  });

  it('invalid route', async () => {
    const p = await previewCsv([{ table: 'arrivals', file: fixtureFile('arrivals-invalid-route.csv') }], baseline(), deps());
    expect(messages(p)).toContain('Row 2, route: station "lounge" is not defined.');
  });

  it('negative count', async () => {
    const p = await previewCsv([{ table: 'arrivals', file: fixtureFile('arrivals-negative-count.csv') }], baseline(), deps());
    expect(messages(p)).toContain('Row 2, count: must be a whole number of 0 or more (got "-5").');
  });

  it('not a number', async () => {
    const p = await previewCsv([{ table: 'stations', file: fixtureFile('stations-not-a-number.csv') }], baseline(), deps());
    expect(messages(p)).toContain('Row 2, servers: must be a whole number from 1 to 20 (got "two").');
  });

  it('service mode outside min and max', async () => {
    const p = await previewCsv([stations('s.csv', stationsCsv('checkin,Check-in desk,1,8,30,22,10,12', PACKS_ROW))], baseline(), deps());
    expect(messages(p)).toContain('Row 2, service_mode_s: must be between service_min_s (8) and service_max_s (22) (got 30).');
  });

  it('window beyond the horizon', async () => {
    const p = await previewCsv([arrivals('a.csv', arrivalsCsv('doors,0,50,120,uniform,checkin|packs'))], baseline(), deps());
    expect(messages(p)).toContain('Row 2, end_min: must be greater than start_min (0) and at most the horizon (40).');
  });

  it('arrival pattern', async () => {
    const p = await previewCsv([arrivals('a.csv', arrivalsCsv('doors,0,20,120,random,checkin|packs'))], baseline(), deps());
    expect(messages(p)).toContain('Row 2, arrival_pattern: must be "even" or "uniform" (got "random").');
  });

  it('duplicate station id', async () => {
    const p = await previewCsv([stations('s.csv', stationsCsv(CHECKIN_ROW, 'checkin,Again,1,8,15,22,12,12'))], baseline(), deps());
    expect(messages(p)).toContain('Row 3, station_id: "checkin" is already used in row 2.');
  });

  it('repeated station and a route of seven', async () => {
    const repeated = await previewCsv([arrivals('a.csv', arrivalsCsv('doors,0,20,120,uniform,checkin|checkin'))], baseline(), deps());
    expect(messages(repeated)).toContain('Row 2, route: station "checkin" appears twice.');
    const seven = Array.from({ length: 7 }, (_, i) => `s${i + 1}`);
    const rows = seven.map((id, i) => `${id},Station ${i + 1},1,8,15,22,${i + 2},2`);
    const long = await previewCsv(
      [arrivals('a.csv', arrivalsCsv(`doors,0,20,120,uniform,${seven.join('|')}`)), stations('s.csv', stationsCsv(...rows))],
      baseline(),
      deps(),
    );
    expect(messages(long)).toContain('Row 2, route: at most 6 stations per route (got 7).');
  });

  it('station cells outside the grid, blocked, on the entrance', async () => {
    const outside = await previewCsv([stations('s.csv', stationsCsv(CHECKIN_ROW, 'packs,Welcome packs,2,6,10,14,45,12'))], baseline(), deps());
    expect(messages(outside)).toContain('Row 3, cell_x/cell_y: (45, 12) is outside the 40 × 24 grid.');
    const blocked = await previewCsv([stations('s.csv', stationsCsv(CHECKIN_ROW, 'packs,Welcome packs,2,6,10,14,16,21'))], baseline(), deps());
    expect(messages(blocked)).toContain('Row 3, cell_x/cell_y: (16, 21) is blocked.');
    const entrance = await previewCsv([stations('s.csv', stationsCsv(CHECKIN_ROW, 'packs,Welcome packs,2,6,10,14,0,12'))], baseline(), deps());
    expect(messages(entrance)).toContain('Row 3, cell_x/cell_y: (0, 12) is the entrance.');
  });

  it('unreachable station: the engine message for the row and for the current cohort', async () => {
    const current: Scenario = { ...baselineScenario(), layout: ringLayout() };
    const p = await previewCsv([{ table: 'stations', file: fixtureFile('stations-unreachable.csv') }], current, deps());
    expect(messages(p)).toEqual([
      'Row 3, cell_x/cell_y: No walkable path between entrance (0,12) and station "packs" (30,4).',
      'Current scenario, cohort "doors", route: No walkable path between station "checkin" (10,12) and station "packs" (30,4).',
    ]);
    expect(p.candidate).toBeNull();
  });

  it('id outside ID_FORMAT carries the engine message', async () => {
    const p = await previewCsv([{ table: 'stations', file: fixtureFile('stations-bad-id.csv') }], baselineScenario(), deps());
    expect(messages(p)).toContain('Row 2, station_id: Station id "a#1" must be 1–64 characters and must not contain "|" or "#".');
  });

  it('more than 10 stations and more than 5,000 attendees', async () => {
    const rows = Array.from({ length: 11 }, (_, i) => `s${i},Station ${i},1,8,15,22,${i + 1},2`);
    const many = await previewCsv([stations('s.csv', stationsCsv(...rows))], baselineScenario(), deps());
    expect(messages(many)).toContain('At most 10 stations (got 11).');
    const big = await previewCsv([arrivals('a.csv', arrivalsCsv('doors,0,20,5200,uniform,checkin|packs'))], baselineScenario(), deps());
    expect(messages(big)).toContain('At most 5,000 attendees in total (got 5,200).');
  });
});

describe('1.6 and 1.7 atomic apply', () => {
  const fixtures = [
    ['arrivals', 'arrivals-duplicate-header.csv'],
    ['arrivals', 'arrivals-invalid-route.csv'],
    ['arrivals', 'arrivals-negative-count.csv'],
    ['stations', 'stations-not-a-number.csv'],
    ['stations', 'stations-bad-id.csv'],
  ] as const;

  it.each(fixtures)('%s %s has errors and so no candidate and no hash', async (table, name) => {
    const p = await previewCsv([{ table, file: fixtureFile(name) }], baselineScenario(), deps());
    expect(p.errors.length).toBeGreaterThan(0);
    expect(p.candidate).toBeNull();
    expect(p.canonicalHash).toBeNull();
  });

  it('keeps layout, id, baseSeed, horizonMs, walkSpeedMps and notes and adds one to revision', async () => {
    const current: Scenario = { ...baselineScenario(), revision: 7, notes: 'keep me', title: 'Mine' };
    const p = await previewCsv([arrivals('a.csv', TEMPLATE_ARRIVALS_CSV), stations('s.csv', TEMPLATE_STATIONS_CSV)], current, deps());
    expect(p.errors).toEqual([]);
    const c = p.candidate as Scenario;
    expect(c.revision).toBe(8);
    expect(c.layout).toEqual(current.layout);
    expect([c.id, c.baseSeed, c.horizonMs, c.walkSpeedMps, c.notes, c.modelVersion]).toEqual(
      [current.id, current.baseSeed, current.horizonMs, current.walkSpeedMps, current.notes, current.modelVersion],
    );
  });
});

describe('1.8 parser and read errors', () => {
  it('shows the Papa Parse error message', async () => {
    vi.spyOn(Papa, 'parse').mockReturnValue({
      data: [], errors: [{ type: 'Quotes', code: 'MissingQuotes', message: 'Quoted field unterminated', row: 0 }], meta: {},
    } as never);
    const p = await previewCsv([arrivals('arrivals.csv', 'a,b\n"x\n')], baselineScenario(), deps());
    expect(messages(p)).toEqual(['Could not read arrivals.csv: Quoted field unterminated.']);
    expect(p.candidate).toBeNull();
  });

  it('shows the error name when the file cannot be read', async () => {
    const unreadable = { name: 'x.csv', size: 10, text: () => Promise.reject(new DOMException('no', 'NotReadableError')) } as unknown as File;
    const p = await previewCsv([{ table: 'arrivals', file: unreadable }], baselineScenario(), deps());
    expect(messages(p)).toEqual(['Could not read x.csv: NotReadableError.']);
  });
});

describe('1.9 formulas are text', () => {
  it('keeps a label that starts with = as literal text', async () => {
    const label = '"=HYPERLINK(""http://example.org"",""x"")"';
    const p = await previewCsv([stations('s.csv', stationsCsv(`checkin,${label},1,8,15,22,10,12`, PACKS_ROW))], baselineScenario(), deps());
    expect(p.errors).toEqual([]);
    expect(p.candidate?.stations[0]?.label).toBe('=HYPERLINK("http://example.org","x")');
  });
});
