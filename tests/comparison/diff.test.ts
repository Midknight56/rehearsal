import { describe, expect, it } from 'vitest';
import { changesHeader } from '../../src/comparison/labels';
import { diffScenarios } from '../../src/comparison/diff';
import {
  formatCell, formatMeters, formatMinutes, formatPeople, formatRoute, formatSeconds, formatService, formatSpeed, formatWindow,
} from '../../src/comparison/format';
import type { Scenario } from '../../src/domain/scenario';
import { baseline, plusOneCheckin, shorterRoute } from '../model/fixtures/harbor-hall';
import { combined, population130 } from './fixtures/pairs';

const real = (d: ReturnType<typeof diffScenarios>) => d.changes.filter((c) => !c.derived);

describe('display formatters', () => {
  it('writes display units', () => {
    expect(formatMinutes(1_200_000)).toBe('20 min');
    expect(formatMinutes(750_000)).toBe('12.5 min');
    expect(formatWindow(0, 1_200_000)).toBe('0–20 min');
    expect(formatService({ kind: 'triangular', minS: 8, modeS: 15, maxS: 22 })).toBe('triangular 8/15/22 s');
    expect(formatService({ kind: 'constant', seconds: 60 })).toBe('constant 60 s');
    expect(formatCell([34, 12])).toBe('(34,12)');
    expect(formatMeters(38)).toBe('38.0 m');
    expect(formatSeconds(31_667)).toBe('31.7 s');
    expect(formatRoute(['checkin', 'packs'])).toBe('checkin → packs');
    expect(formatRoute([])).toBe('(no stations)');
    expect(formatPeople(120)).toBe('120 people');
    expect(formatSpeed(1.2)).toBe('1.2 m/s');
    expect(formatSpeed(1)).toBe('1.0 m/s');
  });
});

describe('diffScenarios (requirements 4.1 to 4.6)', () => {
  it('reports one staffing change for the extra desk', () => {
    const diff = diffScenarios(baseline, plusOneCheckin);
    expect(real(diff)).toHaveLength(1);
    expect(real(diff)[0]).toMatchObject({
      text: 'Station "Check-in desk": servers 1 → 2', group: 'staffing', path: 'stations.checkin.servers', derived: false, highlight: false,
    });
    expect(diff.kind).toBe('single');
    expect(diff.population.changed).toBe(false);
    expect(diff.changes.filter((c) => c.derived)).toHaveLength(0);
  });

  it('reports a moved station and the derived walking entry', () => {
    const diff = diffScenarios(baseline, shorterRoute);
    expect(real(diff)).toHaveLength(1);
    expect(real(diff)[0]!.text).toBe('Station "Welcome packs": position (34,12) → (14,8)');
    expect(real(diff)[0]!.group).toBe('layout');
    const derived = diff.changes.filter((c) => c.derived);
    expect(derived).toHaveLength(1);
    expect(derived[0]!.text).toBe('Walking per attendee, cohort "doors": 38.0 m → 18.0 m (31.7 s → 15.0 s)');
    expect(derived[0]!.group).toBe('derived');
    expect(diff.changes.at(-1)).toBe(derived[0]);
    expect(diff.kind).toBe('single');
  });

  it('reports nothing for identical scenarios', () => {
    expect(diffScenarios(baseline, baseline)).toMatchObject({ changes: [], kind: 'none' });
    expect(changesHeader('none', 0)).toBe('No assumption differs between these scenarios.');
  });

  it('reports a combined candidate with two changes', () => {
    const diff = diffScenarios(baseline, combined);
    expect(diff.kind).toBe('combined');
    expect(real(diff)).toHaveLength(2);
    expect(changesHeader(diff.kind, real(diff).length)).toBe('2 changes');
    expect(diff.changes.map((c) => c.group)).toEqual(['staffing', 'layout', 'derived']);
  });

  it('puts the highlighted population entry first', () => {
    const diff = diffScenarios(baseline, { ...population130, stations: plusOneCheckin.stations });
    expect(diff.changes[0]).toMatchObject({ group: 'population', highlight: true, path: 'cohorts', text: 'Cohort "doors": count 120 → 130 people' });
    expect(diff.changes[1]!.group).toBe('staffing');
    expect(diff.changes.filter((c) => c.highlight)).toHaveLength(1);
    expect(diff.population.changed).toBe(true);
    expect(diff.kind).toBe('combined');
  });

  it('ignores id, title, notes, revision and modelVersion', () => {
    const edited: Scenario = { ...baseline, id: 'other', title: 'Another', notes: 'x', revision: 9, modelVersion: '0.2.0' };
    expect(diffScenarios(baseline, edited)).toMatchObject({ changes: [], kind: 'none' });
  });

  it('writes timing, speed, seed, window, arrivals and route changes in display units', () => {
    const edited: Scenario = {
      ...baseline,
      horizonMs: 3_600_000, baseSeed: 'other', walkSpeedMps: 1,
      cohorts: [{ ...baseline.cohorts[0]!, endMs: 1_800_000, arrivals: 'even', route: ['packs'] }],
    };
    const texts = diffScenarios(baseline, edited).changes.map((c) => c.text);
    expect(texts).toContain('Observation window 40 min → 60 min');
    expect(texts).toContain('Seed harbor-hall-2026 → other');
    expect(texts).toContain('Walking speed 1.2 m/s → 1.0 m/s');
    expect(texts).toContain('Cohort "doors": window 0–20 min → 0–30 min');
    expect(texts).toContain('Cohort "doors": arrivals uniform → even');
    expect(texts).toContain('Cohort "doors": route checkin → packs → packs');
  });

  it('writes service, label, blocked-cell and added/removed station changes', () => {
    const edited: Scenario = {
      ...baseline,
      layout: { ...baseline.layout, blockedCells: [...baseline.layout.blockedCells.slice(1), [1, 1], [2, 2]] },
      stations: [
        { ...baseline.stations[0]!, label: 'Front desk', service: { kind: 'constant', seconds: 12 } },
        { id: 'extra', label: 'Extra', cell: [5, 5], servers: 1, service: { kind: 'constant', seconds: 5 } },
      ],
    };
    const diff = diffScenarios(baseline, edited);
    const texts = diff.changes.map((c) => c.text);
    expect(texts).toContain('Station "checkin": label "Check-in desk" → "Front desk"');
    expect(texts).toContain('Station "checkin": service triangular 8/15/22 s → constant 12 s');
    expect(texts).toContain('Blocked cells: 2 added, 1 removed');
    expect(texts).toContain('Station "extra" added');
    expect(texts).toContain('Station "packs" removed');
    const paths = real(diff).map((c) => c.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
