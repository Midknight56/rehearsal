import { describe, expect, it } from 'vitest';
import { PER_PERSON_OFF, countSentence } from '../../src/comparison/labels';
import { attendeePairs, populationChange } from '../../src/comparison/population';
import type { ReplaySelection } from '../../src/comparison/replay-contract';
import type { Scenario } from '../../src/domain/scenario';
import { baseline, plusOneCheckin } from '../model/fixtures/harbor-hall';
import { runOnce } from '../model/helpers/run';
import { population130, renamedCohort } from './fixtures/pairs';

async function selectionFor(a: Scenario, b: Scenario): Promise<ReplaySelection> {
  const [left, right] = await Promise.all([runOnce(a, 0, true), runOnce(b, 0, true)]);
  return { replication: 0, baseline: left, candidate: right, label: 'Replay of replication 0, one example run', clock: { horizonMs: left.horizonMs, endMs: left.horizonMs } };
}

describe('populationChange (matrix row 25)', () => {
  it('detects a changed count and names the cohort', () => {
    const change = populationChange(baseline, population130);
    expect(change.changed).toBe(true);
    expect(change.baselineCount).toBe(120);
    expect(change.candidateCount).toBe(130);
    expect(change.details).toEqual(['Cohort "doors": count 120 → 130 people']);
  });

  it('detects a renamed cohort as one added and one removed', () => {
    const change = populationChange(baseline, renamedCohort);
    expect(change.changed).toBe(true);
    expect(change.details).toEqual(['Cohort "doors" removed (120 people)', 'Cohort "gate" added (120 people)']);
    expect(change.baselineCount).toBe(120);
    expect(change.candidateCount).toBe(120);
  });

  it('is unchanged when only staffing differs', () => {
    expect(populationChange(baseline, plusOneCheckin)).toEqual({ changed: false, baselineCount: 120, candidateCount: 120, details: [] });
  });

  it('ignores cohort order', () => {
    const a: Scenario = { ...baseline, cohorts: [{ ...baseline.cohorts[0]!, id: 'a', count: 5 }, { ...baseline.cohorts[0]!, id: 'b', count: 7 }] };
    const b: Scenario = { ...a, cohorts: [...a.cohorts].reverse() };
    expect(populationChange(a, b).changed).toBe(false);
  });
});

describe('attendeePairs', () => {
  it('pairs 120 attendees with equal arrivals when the population is unchanged', async () => {
    const selection = await selectionFor(baseline, plusOneCheckin);
    const result = attendeePairs(selection, populationChange(baseline, plusOneCheckin));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pairs).toHaveLength(120);
    for (const pair of result.pairs) {
      const left = selection.baseline.trace!.attendees.find((a) => a.id === pair.id)!;
      const right = selection.candidate.trace!.attendees.find((a) => a.id === pair.id)!;
      expect(left.arrivalMs).toBe(right.arrivalMs);
      expect(pair.arrivalMs).toBe(left.arrivalMs);
    }
    const sorted = [...result.pairs].sort((a, b) => a.arrivalMs - b.arrivalMs || (a.id < b.id ? -1 : 1));
    expect(result.pairs.map((p) => p.id)).toEqual(sorted.map((p) => p.id));
  });

  it('sums waits from the start events and takes journeys from the exit', async () => {
    const selection = await selectionFor(baseline, plusOneCheckin);
    const result = attendeePairs(selection, populationChange(baseline, plusOneCheckin));
    if (!result.ok) throw new Error('expected pairs');
    const trace = selection.baseline.trace!;
    const pair = result.pairs[0]!;
    const wait = trace.events.filter((e) => e.kind === 'start' && e.attendeeId === pair.id).reduce((s, e) => s + (e.kind === 'start' ? e.waitMs : 0), 0);
    expect(pair.baselineWaitMs).toBe(wait);
    const attendee = trace.attendees.find((a) => a.id === pair.id)!;
    expect(pair.baselineJourneyMs).toBe((attendee.exitMs as number) - attendee.arrivalMs);
    expect(result.pairs.some((p) => (p.candidateWaitMs as number) < (p.baselineWaitMs as number))).toBe(true);
  });

  it('gives null waits and journeys for an attendee who did not finish', async () => {
    const selection = await selectionFor(baseline, plusOneCheckin);
    const trace = selection.baseline.trace!;
    const target = trace.attendees[5]!;
    const cut = { ...selection, baseline: { ...selection.baseline, trace: { ...trace, attendees: trace.attendees.map((a) => (a.id === target.id ? { ...a, exitMs: null } : a)) } } };
    const result = attendeePairs(cut, populationChange(baseline, plusOneCheckin));
    if (!result.ok) throw new Error('expected pairs');
    const pair = result.pairs.find((p) => p.id === target.id)!;
    expect(pair.baselineWaitMs).toBeNull();
    expect(pair.baselineJourneyMs).toBeNull();
    expect(pair.candidateJourneyMs).not.toBeNull();
  });

  it('refuses person-for-person pairs when the population changed', async () => {
    const selection = await selectionFor(baseline, population130);
    const result = attendeePairs(selection, populationChange(baseline, population130));
    expect(result).toEqual({ ok: false, code: 'POPULATION_CHANGED', message: PER_PERSON_OFF });
  });
});

describe('countSentence', () => {
  const input = { metricLabel: 'mean queue wait', improved: 27, n: 30, baselineCount: 120, candidateCount: 130 };
  it('renders the three templates exactly', () => {
    const person = countSentence({ ...input, direction: 'lower', languageMode: 'person-for-person' });
    const group = countSentence({ ...input, direction: 'lower', languageMode: 'population' });
    const none = countSentence({ ...input, metricLabel: 'staff-hours', direction: 'none', improved: null, languageMode: 'population' });
    expect(person).toBe('Candidate had lower mean queue wait in 27 of 30 runs; the same simulated attendees and random draws were used in both.');
    expect(group).toBe('Candidate had lower mean queue wait in 27 of 30 runs; the attendee populations differ (120 vs 130 people), so this compares groups, not the same people.');
    expect(none).toBe('No better direction is defined for staff-hours; read the values.');
    for (const text of [person, group, none]) expect(text).not.toContain('confidence interval');
    expect(person).toContain('the same simulated attendees');
    expect(group).not.toContain('the same simulated attendees');
  });
});
