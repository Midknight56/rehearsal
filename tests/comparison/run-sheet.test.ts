import { describe, expect, it } from 'vitest';
import { scenarioHash } from '../../src/domain/hash';
import { ASSUMPTIONS, LIMITS_TEXT, NOT_A_FORECAST } from '../../src/exports/assumptions-text';
import { escapeHtml } from '../../src/exports/html-escape';
import { buildRunSheetModel, renderRunSheet } from '../../src/exports/run-sheet';
import { hostile } from './fixtures/hostile';
import { baseline, plusOneCheckin, shorterRoute } from './fixtures/pairs';
import { badgeWords, forbiddenMarkup, generatedAt } from './helpers/render';

const render = async (scenario: typeof baseline) => {
  const hash = await scenarioHash(scenario);
  return { hash, ...renderRunSheet(scenario, { generatedAt, scenarioHash: hash }) };
};

describe.each([['baseline', baseline], ['plusOneCheckin', plusOneCheckin]] as const)('run sheet model, %s (matrix row 28)', (_name, scenario) => {
  const model = buildRunSheetModel(scenario, 'h');

  it('has the three walking segments in order of first use', () => {
    expect(model.segments.map((s) => s.durationMs)).toEqual([4167, 10000, 17500]);
    expect(model.segments.map((s) => s.distanceM)).toEqual([5, 12, 21]);
    expect(model.segments.map((s) => `${s.from}>${s.to}`)).toEqual(['entrance>checkin', 'checkin>packs', 'packs>exit']);
    expect(model.segments.map((s) => s.cells)).toEqual([10, 24, 42]);
    expect(model.segments[0]!.fromLabel).toBe('Entrance');
    expect(model.segments[0]!.toLabel).toBe('Check-in desk');
    expect(model.segments[2]!.toLabel).toBe('Exit');
  });

  it('has the walking per route, the meters from the entrance and the cohorts', () => {
    expect(model.walkingPerRoute[0]).toEqual({ cohortId: 'doors', distanceM: 38, durationMs: 31667 });
    expect(model.stations.find((s) => s.id === 'checkin')!.metersFromEntrance).toBe(5);
    expect(model.stations.find((s) => s.id === 'packs')!.metersFromEntrance).toBe(17);
    expect(model.cohorts).toEqual([{ id: 'doors', startMs: 0, endMs: 1_200_000, count: 120, arrivals: 'uniform', route: ['checkin', 'packs'] }]);
    expect(model.modelVersion).toBe('0.1.0');
    expect(model.horizonMs).toBe(2_400_000);
  });
});

describe('staff-hours', () => {
  it('is sum(servers) x H / 3,600,000', () => {
    expect(buildRunSheetModel(baseline, 'h').staffHours).toBe(2);
    expect(buildRunSheetModel(plusOneCheckin, 'h').staffHours).toBe(8 / 3);
    expect(buildRunSheetModel(shorterRoute, 'h').staffHours).toBe(2);
  });
});

describe('run sheet model, shorterRoute', () => {
  const model = buildRunSheetModel(shorterRoute, 'h');
  it('has the shorter walking', () => {
    expect(model.segments.map((s) => s.durationMs)).toEqual([4167, 3334, 7500]);
    expect(model.segments.map((s) => s.distanceM)).toEqual([5, 4, 9]);
    expect(model.walkingPerRoute[0]).toEqual({ cohortId: 'doors', distanceM: 18, durationMs: 15001 });
    expect(model.stations.find((s) => s.id === 'packs')!.metersFromEntrance).toBe(9);
  });
});

describe('segments are distinct pairs used by any route', () => {
  it('lists a shared pair once', () => {
    const two = { ...baseline, cohorts: [...baseline.cohorts, { ...baseline.cohorts[0]!, id: 'late', route: ['checkin'] }] };
    const model = buildRunSheetModel(two, 'h');
    expect(model.segments.map((s) => `${s.from}>${s.to}`)).toEqual(['entrance>checkin', 'checkin>packs', 'packs>exit', 'checkin>exit']);
    expect(model.walkingPerRoute.map((w) => w.cohortId)).toEqual(['doors', 'late']);
  });
});

describe('run sheet HTML', () => {
  it('baseline: the numbers, hash, version, assumptions and limits, in section order', async () => {
    const { html, hash, model } = await render(baseline);
    for (const text of ['4.167 s', '10.000 s', '17.500 s', '31.667 s', '38.0 m per attendee', '2.00 h', '5.0 m', '17.0 m', '4,167 ms', '17,500 ms']) {
      expect(html).toContain(text);
    }
    expect(html).toContain(hash);
    expect(html).toContain('0.1.0');
    for (const line of ASSUMPTIONS) expect(html).toContain(escapeHtml(line));
    expect(html).toContain(escapeHtml(LIMITS_TEXT));
    expect(html).toContain(NOT_A_FORECAST);
    expect(html).toContain(`${baseline.title} (run sheet)`);
    expect(html).toContain(generatedAt.slice(0, 10));
    const at = ['cohorts', 'stations', 'segments', 'walking', 'staff-hours', 'assumptions'].map((id) => html.indexOf(`id="${id}"`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).toContain('0 to 20 min');
    expect(html).toContain('checkin \u2192 packs');
    expect(model.generatedAt).toBe(generatedAt);
    expect(model.scenarioHash).toBe(hash);
  });

  it('plus-one: 2.67 h', async () => {
    expect((await render(plusOneCheckin)).html).toContain('2.67 h');
  });

  it('shorter route: 3.334 s, 7.500 s, 15.001 s, 18.0 m per attendee, packs at 9.0 m', async () => {
    const { html } = await render(shorterRoute);
    for (const text of ['4.167 s', '3.334 s', '7.500 s', '15.001 s', '18.0 m per attendee', '9.0 m', '2.00 h']) expect(html).toContain(text);
  });

  it('is a complete document without active markup or approval vocabulary', async () => {
    for (const scenario of [baseline, plusOneCheckin, shorterRoute]) {
      const { html } = await render(scenario);
      expect(html.startsWith('<!doctype html>')).toBe(true);
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<meta charset="utf-8">');
      expect(html.match(/<style>/g)).toHaveLength(1);
      expect(html).toContain('@page { margin: 12mm }');
      expect(html).not.toMatch(forbiddenMarkup);
      expect(html).not.toMatch(badgeWords);
      expect(html).not.toMatch(/confidence interval|prediction interval/i);
    }
  });

  it('escapes hostile labels, ids and the title', async () => {
    const { html } = await render(hostile);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('=SUM(A1:A3)');
    expect(html).toContain('+late');
    expect(html).toContain('-Harbor');
    expect(html).not.toMatch(forbiddenMarkup);
  });

  it('reads no clock: the same input gives the same bytes', async () => {
    expect((await render(baseline)).html).toBe((await render(baseline)).html);
  });
});
