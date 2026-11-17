import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scenarioHash } from '../../src/domain/hash';
import { validateScenario } from '../../src/domain/validate';
import { previewCsv } from '../../src/imports/csv';
import { parseDecimal } from '../../src/imports/numbers';
import { previewWorkbook } from '../../src/imports/xlsx';
import type { CellValue } from '../../src/imports/workbookReader';
import { blank, fakeWorkbook, harborHallSheets, text } from '../imports/fakeWorkbook';import { baselineScenario, csvFile, deps, scenarioToCsv } from '../imports/helpers';
import type { Scenario } from '../../src/domain/scenario';
import { commits, reduce, refusal } from '../../src/ui/state/reducer';
import { resultsStatus } from '../../src/ui/state/selectors';
import type { EditorAction, EditorState } from '../../src/ui/state/types';
import { HOSTILE_STRINGS, makeEdits, makeScenario, makeState } from './generators';
import { checkProperty } from './property';

// P8 with task 9, P14 with task 12, P15 with task 13.
describe('generators', () => {
  it('makeScenario is valid by construction: validateScenario reports no issue and no warning', async () => {
    await checkProperty('makeScenario is valid by construction', fc.integer({ min: 0, max: 1_000_000 }), (seed) => {
      const result = validateScenario(makeScenario(seed));
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (result.ok) expect(result.warnings).toEqual([]);
    });
  });
});

const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
const decimalLike = fc.oneof(
  fc.string({ maxLength: 12 }),
  fc.stringMatching(/^[ +-]?[0-9]{0,6}(\.[0-9]{0,6})?[ eE]?$/),
  fc.constantFrom('1e3', '1,200', '10%', 'NaN', 'Infinity', '∞', '', ' 7 ', '+3', '.5', '5.', '--1', '1.5'),
  fc.double({ noNaN: false }).map(String),
);

describe('P2 decimal parsing (requirement 1.4)', () => {
  it('accepts exactly the strings that match the pattern after trimming, returns Number(s), and only finite values', async () => {
    await checkProperty('P2 decimal parsing', decimalLike, (text) => {
      const trimmed = text.trim();
      const result = parseDecimal(text);
      const expected = DECIMAL.test(trimmed) && Number.isFinite(Number(trimmed));
      expect(result.ok).toBe(expected);
      if (result.ok) {
        expect(result.value).toBe(Number(trimmed));
        expect(Number.isFinite(result.value)).toBe(true);
      }
    });
  });
});

describe('P1 CSV round trip (requirements 1.2 and 1.7)', () => {
  it('serializing the cohorts and stations to the template CSVs and importing them into the same layout gives the same hash', async () => {
    await checkProperty('P1 CSV round trip', fc.integer({ min: 0, max: 100_000 }), async (seed) => {
      const scenario = makeScenario(seed);
      const csv = scenarioToCsv(scenario);
      const preview = await previewCsv(
        [{ table: 'arrivals', file: csvFile('arrivals.csv', csv.arrivals) }, { table: 'stations', file: csvFile('stations.csv', csv.stations) }],
        scenario,
        deps(),
      );
      expect(preview.errors.map((e) => e.message)).toEqual([]);
      expect(preview.candidate?.stations).toEqual(scenario.stations);
      expect(preview.candidate?.cohorts).toEqual(scenario.cohorts);
      expect(preview.canonicalHash).toBe(await scenarioHash(scenario));
    });
  });
});

describe('P3 atomic preview (requirements 1.6 and 2.9)', () => {
  const corruptions = [
    (s: string) => s.replace(/,(\d+),/, ',x,'),
    (s: string) => s.replace(/\n[^,]*,/, '\n,'),
    (s: string) => s.replace('uniform', 'random').replace('even', 'random'),
    (s: string) => s.replace(/\|/, '|nowhere|'),
    (s: string) => s,
  ];

  it('candidate and hash are null exactly when there is at least one error, and an error-free candidate is the current scenario with the imported tables', async () => {
    await checkProperty('P3 atomic preview', fc.tuple(fc.integer({ min: 0, max: 100_000 }), fc.integer({ min: 0, max: corruptions.length - 1 })), async ([seed, which]) => {
      const scenario = makeScenario(seed);
      const csv = scenarioToCsv(scenario);
      const arrivals = (corruptions[which] as (s: string) => string)(csv.arrivals);
      const preview = await previewCsv([{ table: 'arrivals', file: csvFile('arrivals.csv', arrivals) }], scenario, deps());
      if (preview.errors.length > 0) {
        expect(preview.candidate).toBeNull();
        expect(preview.canonicalHash).toBeNull();
      } else {
        expect(preview.candidate).not.toBeNull();
        expect({ ...preview.candidate, revision: 0 }).toEqual({ ...scenario, revision: 0, cohorts: preview.candidate?.cohorts });
        expect(preview.candidate?.revision).toBe(scenario.revision + 1);
      }
    });
  });
});
describe('P16 sheet isolation (requirement 2.2, invariant I10)', () => {
  const READ = ['Arrivals', 'Stations', 'Settings'];
  const extraNames = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 }).filter((n) => !READ.includes(n)), { maxLength: 5 });
  const cellText = fc.string({ maxLength: 20 });

  it('opens only Arrivals, Stations and Settings and lists exactly the other sheets as ignored, in workbook order', async () => {
    await checkProperty(
      'P16 sheet isolation',
      fc.record({ extras: extraNames, content: cellText, position: fc.nat(5), dropSettings: fc.boolean() }),
      async ({ extras, content, position, dropSettings }) => {
        const base = harborHallSheets();
        if (dropSettings) delete base.Settings;
        const names = [...Object.keys(base)];
        names.splice(Math.min(position, names.length), 0, ...extras);
        const sheets: [string, CellValue[][]][] = names.map((name) => [name, base[name] ?? [[text(name, 'A1', content), blank(name, 'B1')]]]);
        const book = fakeWorkbook(sheets);
        const preview = await previewWorkbook(new File([new Uint8Array(4)], 'x.xlsx'), baselineScenario(), deps({ reader: () => book }));
        expect(book.opened.every((n) => READ.includes(n))).toBe(true);
        expect(preview.sheetsIgnored).toEqual(names.filter((n) => !READ.includes(n)));
        expect(preview.errors).toEqual([]);
      },
    );
  });
});
const strip = (s: Scenario): Scenario => ({ ...s, revision: 0 });
const seeds = fc.integer({ min: 0, max: 100_000 });

describe('P4 agreement of the scenario after station moves (requirements 3.1 to 3.4)', () => {
  it('an accepted move puts the station on the target cell, a refused move changes nothing, and no station ever sits on a blocked, entrance, exit or shared cell', async () => {
    const via = fc.constantFrom('drag' as const, 'form' as const, 'nudge' as const);
    await checkProperty('P4 agreement', fc.tuple(seeds, fc.array(fc.tuple(fc.nat(9), fc.integer({ min: -2, max: 82 }), fc.integer({ min: -2, max: 82 }), via), { maxLength: 40 })), ([seed, moves]) => {
      const scenario = makeScenario(seed);
      let state: EditorState = makeState([scenario]);
      for (const [index, x, y, how] of moves) {
        const station = state.scenario.stations[index % state.scenario.stations.length]!;
        const action: EditorAction = { type: 'station/move', id: station.id, cell: [x, y], via: how };
        const next = reduce(state, action);
        if (refusal(state, action) === null) expect(next.scenario.stations.find((s) => s.id === station.id)?.cell).toEqual([x, y]);
        else expect(next).toBe(state);
        state = next;
        const { layout, stations } = state.scenario;
        const keys = stations.map((s) => `${s.cell[0]},${s.cell[1]}`);
        expect(new Set(keys).size).toBe(keys.length);
        for (const s of stations) {
          expect(s.cell[0]).toBeGreaterThanOrEqual(0);
          expect(s.cell[0]).toBeLessThan(layout.cols);
          expect(s.cell[1]).toBeGreaterThanOrEqual(0);
          expect(s.cell[1]).toBeLessThan(layout.rows);
          expect(layout.blockedCells.some((b) => b[0] === s.cell[0] && b[1] === s.cell[1])).toBe(false);
          expect(keys.filter((k) => k === `${layout.entrance[0]},${layout.entrance[1]}` || k === `${layout.exit[0]},${layout.exit[1]}`)).toEqual([]);
        }
      }
    });
  });
});

describe('P5 undo and redo (requirements 4.1 and 4.2, invariant I3)', () => {
  it('undo n times returns the scenario before the committed edits, redo n times returns the last, past never exceeds 100, and a plain action leaves past alone', async () => {
    await checkProperty('P5 undo redo', fc.tuple(seeds, fc.integer({ min: 1, max: 130 })), ([seed, n]) => {
      const scenario = makeScenario(seed);
      let state: EditorState = makeState([scenario]);
      const snapshots: Scenario[] = [strip(scenario)];
      for (const action of makeEdits(seed, n, scenario)) {
        const next = reduce(state, action);
        if (next.scenario !== state.scenario) {
          expect(commits(action)).toBe(true);
          snapshots.push(strip(next.scenario));
        }
        state = next;
        expect(state.past[0]!.length).toBeLessThanOrEqual(100);
      }
      const committed = snapshots.length - 1;
      const depth = state.past[0]!.length;
      expect(depth).toBe(Math.min(committed, 100));
      const plain = reduce(state, { type: 'select', selection: { kind: 'none' } });
      expect(plain.past[0]).toEqual(state.past[0]);
      for (let i = 0; i < depth; i++) state = reduce(state, { type: 'undo' });
      expect(strip(state.scenario)).toEqual(snapshots[committed - depth]);
      for (let i = 0; i < depth; i++) state = reduce(state, { type: 'redo' });
      expect(strip(state.scenario)).toEqual(snapshots[committed]);
    });
  });
});

describe('P6 delete guard (requirement 3.6, invariant I11)', () => {
  it('a routed station cannot be deleted: the same state object comes back and the refusal names the first cohort that routes it', async () => {
    await checkProperty('P6 delete guard', seeds, (seed) => {
      const scenario = makeScenario(seed);
      const state = makeState([scenario]);
      for (const station of scenario.stations) {
        const cohort = scenario.cohorts.find((c) => c.route.includes(station.id));
        if (cohort === undefined) continue;
        const action: EditorAction = { type: 'station/delete', id: station.id };
        expect(reduce(state, action)).toBe(state);
        expect(refusal(state, action)).toBe(`${station.label} (${station.id}) is on the route of cohort "${cohort.id}". Remove it from the route before deleting the station.`);
      }
    });
  });
});

describe('P7 stale derivation (requirement 4.3, invariant I4)', () => {
  it('a result is stale exactly when the new hash differs from the result hash, and a title or notes edit never changes the hash', async () => {
    await checkProperty('P7 stale derivation', fc.tuple(seeds, fc.constantFrom(...HOSTILE_STRINGS, 'plain title')), async ([seed, title]) => {
      const scenario = makeScenario(seed);
      const h0 = await scenarioHash(scenario);
      let state = makeState([scenario], { hashes: [h0] });
      state = reduce(state, { type: 'run/result', runId: 1, tabIndex: 0, result: { scenarioHash: h0 } as never, snapshot: scenario, hash: h0 });
      expect(resultsStatus(state, 0)).toBe('fresh');
      const text = reduce(state, { type: 'settings/set', patch: { title, notes: title } });
      expect(resultsStatus(text, 0)).toBe('fresh');
      expect(await scenarioHash(text.scenario)).toBe(h0);
      for (const action of makeEdits(seed, 1, scenario)) {
        const next = reduce(state, action);
        if (next.scenario === state.scenario) {
          expect(resultsStatus(next, 0)).toBe('fresh');
          continue;
        }
        const h1 = await scenarioHash(next.scenario);
        const settled = reduce(next, { type: 'hash/computed', tabIndex: 0, revision: next.scenario.revision, hash: h1 });
        expect(resultsStatus(settled, 0)).toBe(h1 === h0 ? 'fresh' : 'stale');
      }
    });
  });
});