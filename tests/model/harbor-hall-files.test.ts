import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scenarioHash } from '../../src/domain/hash';
import { validateScenario } from '../../src/domain/validate';
import { harborHall } from './fixtures/harbor-hall';

const DIR = resolve(import.meta.dirname, '../../public/examples/harbor-hall');
const FILES = { baseline: 'baseline.json', 'plus-one-checkin': 'plus-one-checkin.json', 'shorter-route': 'shorter-route.json' } as const;

describe('row 11.4: the Harbor Hall example files', () => {
  it('each file validates with no issue and no warning and hash-equals its TS fixture; the hashes are distinct', async () => {
    const hashes: string[] = [];
    for (const [name, fixture] of Object.entries(harborHall) as [keyof typeof FILES, (typeof harborHall)[keyof typeof FILES]][]) {
      const fixtureHash = await scenarioHash(fixture);
      const path = resolve(DIR, FILES[name]);
      if (process.env.UPDATE_EXPECTED === '1') writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
      expect(existsSync(path), `${FILES[name]} is written at task 15`).toBe(true);
      const result = validateScenario(JSON.parse(readFileSync(path, 'utf8')));
      expect(result).toMatchObject({ ok: true, warnings: [] });
      if (result.ok) expect(await scenarioHash(result.scenario)).toBe(fixtureHash);
      hashes.push(fixtureHash);
    }
    expect(new Set(hashes).size).toBe(3);
  });
});