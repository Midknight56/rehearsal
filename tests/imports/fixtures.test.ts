import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { scenarioHash } from '../../src/domain/hash';
import { validateScenario } from '../../src/domain/validate';

const dataRows = (path: string): number => {
  const parsed = Papa.parse<string[]>(readFileSync(path, 'utf8'), { skipEmptyLines: 'greedy' });
  return parsed.data.length - 1;
};

describe('CSV fixtures parse to the row counts of the design table', () => {
  it.each([
    ['arrivals-duplicate-header.csv', 1],
    ['arrivals-invalid-route.csv', 1],
    ['arrivals-negative-count.csv', 1],
    ['arrivals-extra-column.csv', 1],
    ['stations-unreachable.csv', 2],
    ['stations-not-a-number.csv', 2],
    ['stations-script-label.csv', 2],
    ['stations-bad-id.csv', 2],
  ])('%s has %d data rows', (name, rows) => {
    expect(dataRows(`tests/imports/fixtures/${name}`)).toBe(rows);
  });

  it('layout-ring-30-4.json adds the eight neighbours of (30,4) to the baseline blocked cells', () => {
    const baseline = JSON.parse(readFileSync('public/examples/harbor-hall/baseline.json', 'utf8')) as { layout: { blockedCells: number[][] } };
    const ring = JSON.parse(readFileSync('tests/imports/fixtures/layout-ring-30-4.json', 'utf8')) as { blockedCells: number[][] };
    const extra = ring.blockedCells.filter((c) => !baseline.layout.blockedCells.some((b) => b[0] === c[0] && b[1] === c[1]));
    expect(extra.map((c) => `${c[0]},${c[1]}`).sort()).toEqual(
      ['29,3', '30,3', '31,3', '29,4', '31,4', '29,5', '30,5', '31,5'].sort(),
    );
  });
});

describe('Harbor Hall scenario files (written by simulation-contract task 15)', () => {
  const names = ['baseline', 'plus-one-checkin', 'shorter-route'] as const;
  const read = (name: string): unknown => JSON.parse(readFileSync(`public/examples/harbor-hall/${name}.json`, 'utf8'));

  it.each(names)('%s passes validateScenario with no warning', (name) => {
    const result = validateScenario(read(name));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings).toEqual([]);
  });

  it('the three have three distinct canonical hashes', async () => {
    const hashes = await Promise.all(names.map((name) => scenarioHash(read(name) as never)));
    expect(new Set(hashes).size).toBe(3);
  });

  it('carry the ids and the model version of the contract', () => {
    expect(names.map((n) => (read(n) as { id: string }).id)).toEqual(['harbor-hall-baseline', 'harbor-hall-plus-one-checkin', 'harbor-hall-shorter-route']);
    expect(names.map((n) => (read(n) as { modelVersion: string }).modelVersion)).toEqual(['0.1.0', '0.1.0', '0.1.0']);
  });
});

describe('browser fixtures', () => {
  it.each(['large-1200', 'large-5000'])('%s passes validateScenario', (name) => {
    const result = validateScenario(JSON.parse(readFileSync(`tests/e2e/fixtures/${name}.json`, 'utf8')));
    expect(result.ok).toBe(true);
  });
});
