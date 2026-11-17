import { describe, expect, it } from 'vitest';
import { buildIndex } from '../../src/replay/traceIndex';
import { sampleAt, timelineOf, type Sample } from '../../src/replay/sampler';
import { loadTraceFixture } from './generators';

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
