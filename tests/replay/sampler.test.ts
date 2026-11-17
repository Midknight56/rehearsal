import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatTimestamp } from '../../src/replay/format';
import { checkProperty } from '../ui/property';
import { buildIndex } from '../../src/replay/traceIndex';
import { sampleAt, timelineOf, type Sample } from '../../src/replay/sampler';
import { loadTraceFixture, makeTrace } from './generators';

const labels = { desk: 'Desk' };
const three = () => {
  const f = loadTraceFixture('three-people');
  return buildIndex(f.trace, f.stations);
};
const byId = (s: Sample, id: string) => s.attendees.find((a) => a.id === id);
const rowText = (r: { label: string; detail: string }) => `${r.label} ${r.detail}`;

describe('sampleAt on three-people.json', () => {
  it('t = 3,500 ms: one in service, one waiting at index 0, one walking at (3, 1)', () => {
    const s = sampleAt(three(), 3500);
    expect(byId(s, 'a#0000')).toMatchObject({ phase: 'in-service', stationId: 'desk', server: 0 });
    expect(byId(s, 'a#0001')).toMatchObject({ phase: 'waiting', stationId: 'desk', queueIndex: 0 });
    expect(byId(s, 'a#0002')?.phase).toBe('walking');
    expect(byId(s, 'a#0002')?.position).toEqual([3, 1]);
    expect(s.perStation.desk).toEqual({ waiting: 1, inService: 1, servers: 1, nextServiceEndMs: 5000, longestWaitMs: 500 });
  });

  it('t = 9,000 ms: one exited, one walking at (6, 1), one in service; arrived = 1 + 0 + 1 + 1', () => {
    const s = sampleAt(three(), 9000);
    expect(byId(s, 'a#0000')?.phase).toBe('exited');
    expect(byId(s, 'a#0001')?.phase).toBe('walking');
    expect(byId(s, 'a#0001')?.position).toEqual([6, 1]);
    expect(byId(s, 'a#0002')?.phase).toBe('in-service');
    expect(s.arrived).toBe(3);
    expect(s.exited).toBe(1);
  });

  it('t = 0: the first attendee has arrived at the entrance and the others have not', () => {
    const s = sampleAt(three(), 0);
    expect(byId(s, 'a#0000')?.phase).toBe('walking');
    expect(byId(s, 'a#0001')?.phase).toBe('not-arrived');
    expect(s.arrived).toBe(1);
  });
});

describe('timelineOf', () => {
  it('a#0001 reads as the design table, with the time in mm:ss.mmm', () => {
    expect(timelineOf(three(), 'a#0001', labels).map(rowText)).toEqual([
      'Arrived 00:01.000',
      'Walked to Desk (00:02.000)',
      'Joined queue at Desk 00:03.000',
      'Service started (server 1) 00:05.000 · waited 00:02.000',
      'Service ended 00:08.000',
      'Walked to exit (00:02.500)',
      'Exited 00:10.500',
    ]);
  });

  it('an unfinished attendee ends with "Unfinished at the drain cap" and stays in service at later times', () => {
    const f = loadTraceFixture('unfinished');
    const index = buildIndex(f.trace, f.stations);
    const rows = timelineOf(index, 'a#0000', labels);
    expect(rows[rows.length - 1]?.label).toBe('Unfinished at the drain cap');
    for (const t of [2500, 60_000, 7_000_000]) expect(sampleAt(index, t).attendees[0]?.phase).toBe('in-service');
  });
});

describe('purity', () => {
  it('equal inputs give deep-equal samples and 1,000 samples leave the trace deep-equal', () => {
    const f = loadTraceFixture('three-people');
    const before = JSON.stringify(f.trace);
    const index = buildIndex(f.trace, f.stations);
    for (let i = 0; i < 1000; i++) sampleAt(index, (i * 37) % 14_000);
    expect(JSON.stringify(f.trace)).toBe(before);
    expect(sampleAt(index, 4321)).toEqual(sampleAt(index, 4321));
  });
});

const traceInputs = fc.record({ attendees: fc.integer({ min: 1, max: 40 }), stations: fc.integer({ min: 1, max: 4 }), seed: fc.integer({ min: 0, max: 1_000_000 }), at: fc.double({ min: 0, max: 1, noNaN: true }) });

describe('P9 sample conservation (requirements 6.3 and 6.4)', () => {
  it('every arrived attendee is in exactly one phase, waiting indices are unique per station, and sampling is pure', async () => {
    await checkProperty('P9 sample conservation', traceInputs, ({ attendees, stations, seed, at }) => {
      const made = makeTrace({ attendees, stations, seed });
      const before = JSON.stringify(made.trace);
      const index = buildIndex(made.trace, made.stations);
      const t = Math.floor(at * made.endMs);
      const s = sampleAt(index, t);
      const count = (phase: string) => s.attendees.filter((a) => a.phase === phase).length;
      expect(s.attendees.filter((a) => a.phase !== 'not-arrived')).toHaveLength(count('walking') + count('waiting') + count('in-service') + count('exited'));
      expect(s.arrived).toBe(attendees - count('not-arrived'));
      expect(s.exited).toBe(count('exited'));
      for (const [id, station] of Object.entries(s.perStation)) {
        const waiting = s.attendees.filter((a) => a.phase === 'waiting' && a.stationId === id);
        expect(waiting.map((a) => a.queueIndex).sort((p, q) => (p as number) - (q as number))).toEqual(waiting.map((_, i) => i));
        expect(station.waiting).toBe(waiting.length);
      }
      expect(sampleAt(index, t)).toEqual(s);
      expect(JSON.stringify(made.trace)).toBe(before);
    });
  });
});

describe('P13 timeline (requirement 7.4)', () => {
  it('rows are non-decreasing, every wait equals start minus join, and the kinds follow the grammar', async () => {
    await checkProperty('P13 timeline', traceInputs, ({ attendees, stations, seed }) => {
      const made = makeTrace({ attendees, stations, seed });
      const index = buildIndex(made.trace, made.stations);
      const labels = Object.fromEntries(made.stations.map((s) => [s.id, s.label]));
      for (const a of made.trace.attendees) {
        const rows = timelineOf(index, a.id, labels);
        for (let i = 1; i < rows.length; i++) expect((rows[i] as { tMs: number }).tMs).toBeGreaterThanOrEqual((rows[i - 1] as { tMs: number }).tMs);
        const letters = rows
          .map((r) => (r.label === 'Arrived' ? 'A' : r.label === 'Walked to exit' ? 'X' : r.label.startsWith('Walked to') ? 'W' : r.label.startsWith('Joined') ? 'J' : r.label.startsWith('Service started') ? 'S' : r.label === 'Service ended' ? 'E' : r.label === 'Exited' ? 'Z' : '?'))
          .join('');
        expect(letters).toMatch(/^A(WJSE)*XZ$/);
        let joinedAt = -1;
        for (const r of rows) {
          if (r.label.startsWith('Joined')) joinedAt = r.tMs;
          if (r.label.startsWith('Service started')) {
            expect(r.tMs - joinedAt).toBeGreaterThanOrEqual(0);
            expect(r.detail).toBe(`${formatTimestamp(r.tMs)} \u00b7 waited ${formatTimestamp(r.tMs - joinedAt)}`);
          }
        }
      }
    });
  });
});