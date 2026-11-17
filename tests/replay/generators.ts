import { readFileSync } from 'node:fs';
import type { Layout, Scenario, Station } from '../../src/domain/scenario';
import type { CachedPath } from '../../src/spatial/path-cache';
import type { MovementSegment, Trace, TraceAttendee, TraceEvent } from '../../src/simulation/trace';

/** mulberry32: a small seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type TraceFixture = {
  layout: Layout;
  stations: Station[];
  walkSpeedMps: number;
  completion: 'complete' | 'drain-capped';
  unfinished: string[];
  trace: Trace;
};

export function loadTraceFixture(name: 'three-people' | 'unfinished'): TraceFixture {
  return JSON.parse(readFileSync(`tests/replay/fixtures/${name}.json`, 'utf8')) as TraceFixture;
}

export type MadeTrace = { trace: Trace; layout: Layout; stations: Scenario['stations']; endMs: number };

const CELL_MS = 500; // 0.5 m cells at 1 m/s

/**
 * A trace consistent with one FIFO server per station. Stations sit on row 1 at x = 4, 9, 14, ...;
 * every attendee visits every station in order. A walk of n cell edges takes n * 500 ms. Service lasts 1,000 to 5,000 ms.
 * Equal join times are served in attendee-id order. `arrivalWindowMs` bounds the arrivals; `serviceMs` overrides the draw.
 */
export function buildFifoTrace(input: {
  count: number;
  stationCount: number;
  seed: number;
  arrivalWindowMs?: number;
  serviceMs?: () => number;
}): MadeTrace {
  const rand = mulberry32(input.seed);
  const window = input.arrivalWindowMs ?? 20_000;
  const stationCount = input.stationCount;
  const cols = 5 * stationCount + 5;
  const layout: Layout = { cols, rows: 3, cellSizeM: 0.5, blockedCells: [], entrance: [0, 1], exit: [cols - 1, 1] };
  const stations: Station[] = [];
  for (let i = 0; i < stationCount; i++) {
    stations.push({ id: `st${i}`, label: `Station ${i}`, cell: [4 + 5 * i, 1], servers: 1, service: { kind: 'constant', seconds: 3 } });
  }
  const nodes = [layout.entrance[0], ...stations.map((s) => s.cell[0]), layout.exit[0]];
  const pathFor = (leg: number): CachedPath => {
    const a = nodes[leg] as number;
    const b = nodes[leg + 1] as number;
    const cells: [number, number][] = [];
    for (let x = a; x <= b; x++) cells.push([x, 1]);
    const edges = b - a;
    return {
      id: leg,
      from: leg === 0 ? { kind: 'entrance' } : { kind: 'station', id: `st${leg - 1}` },
      to: leg === stationCount ? { kind: 'exit' } : { kind: 'station', id: `st${leg}` },
      cells,
      distanceM: edges * 0.5,
      durationMs: edges * CELL_MS,
    };
  };
  const paths = Array.from({ length: stationCount + 1 }, (_, leg) => pathFor(leg));

  const people = Array.from({ length: input.count }, (_, i) => ({
    id: `a#${String(i).padStart(4, '0')}`,
    arrivalMs: Math.floor(rand() * window),
  })).sort((p, q) => p.arrivalMs - q.arrivalMs || (p.id < q.id ? -1 : 1));

  const events: TraceEvent[] = [];
  const segments: MovementSegment[] = [];
  let ready = people.map((p) => ({ id: p.id, at: p.arrivalMs })); // time each person leaves the previous node
  for (const p of people) {
    events.push({ kind: 'arrive', timeMs: p.arrivalMs, attendeeId: p.id });
  }
  for (let s = 0; s < stationCount; s++) {
    const station = stations[s] as Station;
    const path = paths[s] as CachedPath;
    const joins = ready
      .map((r) => ({ id: r.id, departMs: r.at, joinMs: r.at + path.durationMs }))
      .sort((p, q) => p.joinMs - q.joinMs || (p.id < q.id ? -1 : 1));
    for (const j of joins) {
      events.push({ kind: 'depart', timeMs: j.departMs, attendeeId: j.id, from: path.from, to: path.to, pathId: path.id, arriveMs: j.joinMs });
      segments.push({ attendeeId: j.id, startMs: j.departMs, endMs: j.joinMs, pathId: path.id });
    }
    let freeAt = 0;
    const starts: number[] = [];
    const next: { id: string; at: number }[] = [];
    joins.forEach((j, order) => {
      const start = Math.max(j.joinMs, freeAt);
      const duration = input.serviceMs !== undefined ? input.serviceMs() : 1000 + Math.floor(rand() * 4001);
      const complete = start + duration;
      freeAt = complete;
      starts.push(start);
      const waiting = starts.slice(0, order).filter((t) => t > j.joinMs).length;
      events.push({ kind: 'join', timeMs: j.joinMs, attendeeId: j.id, stationId: station.id, position: waiting });
      events.push({ kind: 'start', timeMs: start, attendeeId: j.id, stationId: station.id, server: 0, waitMs: start - j.joinMs });
      events.push({ kind: 'complete', timeMs: complete, attendeeId: j.id, stationId: station.id, server: 0 });
      next.push({ id: j.id, at: complete });
    });
    ready = next;
  }
  const last = paths[stationCount] as CachedPath;
  for (const r of ready) {
    events.push({ kind: 'depart', timeMs: r.at, attendeeId: r.id, from: last.from, to: last.to, pathId: last.id, arriveMs: r.at + last.durationMs });
    segments.push({ attendeeId: r.id, startMs: r.at, endMs: r.at + last.durationMs, pathId: last.id });
    events.push({ kind: 'exit', timeMs: r.at + last.durationMs, attendeeId: r.id });
  }
  events.sort((p, q) => p.timeMs - q.timeMs);
  const attendees: TraceAttendee[] = people.map((p) => ({
    id: p.id,
    cohortId: 'a',
    arrivalMs: p.arrivalMs,
    exitMs: (events.find((e) => e.kind === 'exit' && e.attendeeId === p.id) as { timeMs: number }).timeMs,
  }));
  const endMs = Math.max(...events.map((e) => e.timeMs));
  return { trace: { version: 1, paths, attendees, events, segments }, layout, stations, endMs };
}

/** makeTrace({ attendees, stations, seed }): the generated trace of P9 to P13. */
export function makeTrace(input: { attendees: number; stations: number; seed: number }): MadeTrace {
  return buildFifoTrace({ count: input.attendees, stationCount: input.stations, seed: input.seed });
}

/**
 * 1,200 attendees arriving within 10 s at one station with one server and 60 s service: nobody exits before 60 s,
 * so at t = 30,000 ms all 1,200 have arrived and none has exited.
 */
export function cap1200(): MadeTrace {
  return buildFifoTrace({ count: 1200, stationCount: 1, seed: 1200, arrivalWindowMs: 10_000, serviceMs: () => 60_000 });
}
