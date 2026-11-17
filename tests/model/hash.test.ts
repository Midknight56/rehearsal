import { describe, expect, it } from 'vitest';
import { scenarioHash } from '../../src/domain/hash';
import { scenario } from './helpers/build-scenario';
import { baseline, plusOneCheckin, shorterRoute } from './fixtures/harbor-hall';

const stationA = { id: 'a', label: 'A', cell: [0, 0] as [number, number], servers: 1, service: { kind: 'constant' as const, seconds: 10 } };
const stationB = { id: 'b', label: 'B', cell: [0, 0] as [number, number], servers: 2, service: { kind: 'constant' as const, seconds: 20 } };

describe('row 1.6: canonical hash', () => {
  it('a title, notes, id or revision change keeps the hash', async () => {
    const original = scenario({ stations: [stationA] });
    expect(await scenarioHash({ ...original, title: 'other', notes: 'x', id: 'other-id', revision: 9 })).toBe(await scenarioHash(original));
  });

  it('reordering stations keeps the hash', async () => {
    expect(await scenarioHash(scenario({ stations: [stationA, stationB] }))).toBe(await scenarioHash(scenario({ stations: [stationB, stationA] })));
  });

  it('a servers change changes the hash', async () => {
    expect(await scenarioHash(scenario({ stations: [stationA] }))).not.toBe(await scenarioHash(scenario({ stations: [{ ...stationA, servers: 2 }] })));
  });

  it('the three Harbor Hall scenarios hash to 64 lowercase hex characters, all distinct', async () => {
    const hashes = await Promise.all([baseline, plusOneCheckin, shorterRoute].map((fixture) => scenarioHash(fixture)));
    for (const hash of hashes) expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(hashes).size).toBe(3);
  });
});