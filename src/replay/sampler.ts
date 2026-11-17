// Pure sampler over a trace index (requirements 6.2, 6.3, 6.4, 6.6, 7.4). sampleAt is a function of the index and the time;
// it never mutates the index or the trace and reads no clock, so the canvas, the tables and the timeline all agree.
import type { Cell, Scenario } from '../domain/scenario';
import { formatTimestamp } from './format';
import type { AttendeeEvent, IndexedAttendee, TraceIndex } from './traceIndex';

export type Phase = 'not-arrived' | 'walking' | 'waiting' | 'in-service' | 'exited';
export type AttendeeSample = { id: string; phase: Phase; position: [number, number]; stationId?: string; queueIndex?: number; server?: number };
export type StationSample = { waiting: number; inService: number; servers: number; nextServiceEndMs: number | null; longestWaitMs: number };
export type Sample = { tMs: number; attendees: AttendeeSample[]; perStation: Record<string, StationSample>; arrived: number; exited: number };
export type TimelineRow = { tMs: number; label: string; detail: string };
export type Aggregate = { stationId: string | 'entrance'; waiting: number; inService: number; walking: number };

export type StationList = Scenario['stations'];

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The index of the last event with timeMs <= tMs (the engine's later event wins at equal times), or -1. */
function lastAtOrBefore(events: AttendeeEvent[], tMs: number): number {
  let lo = 0;
  let hi = events.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((events[mid] as AttendeeEvent).timeMs <= tMs) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** A point on a path's cells at elapsed/duration of its length, linear in time (edges * elapsed / duration, then between cells). */
function along(cells: Cell[], elapsedMs: number, durationMs: number): [number, number] {
  const edges = cells.length - 1;
  const first = cells[0] as Cell;
  if (edges <= 0) return [first[0], first[1]];
  if (durationMs <= 0 || elapsedMs >= durationMs) {
    const last = cells[edges] as Cell;
    return [last[0], last[1]];
  }
  const f = (Math.max(0, elapsedMs) * edges) / durationMs;
  const i = Math.min(Math.floor(f), edges - 1);
  const frac = f - i;
  const a = cells[i] as Cell;
  const b = cells[i + 1] as Cell;
  return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
}

function stationCell(index: TraceIndex, id: string, fallback: Cell): Cell {
  return index.stationCells.get(id) ?? fallback;
}

type Where = { sample: AttendeeSample; joinMs?: number; endsAtMs?: number | null };

function whereIs(index: TraceIndex, a: IndexedAttendee, tMs: number): Where {
  const k = lastAtOrBefore(a.events, tMs);
  if (k < 0) return { sample: { id: a.id, phase: 'not-arrived', position: [a.entranceCell[0], a.entranceCell[1]] } };
  const e = a.events[k] as AttendeeEvent;
  switch (e.kind) {
    case 'arrive':
      return { sample: { id: a.id, phase: 'walking', position: [a.entranceCell[0], a.entranceCell[1]] } };
    case 'depart': {
      const path = index.paths.get(e.pathId);
      const position = path === undefined ? a.entranceCell : along(path.cells, tMs - e.timeMs, e.arriveMs - e.timeMs);
      return { sample: { id: a.id, phase: 'walking', position: [position[0], position[1]] } };
    }
    case 'join': {
      const cell = stationCell(index, e.stationId, a.entranceCell);
      return { sample: { id: a.id, phase: 'waiting', position: [cell[0], cell[1]], stationId: e.stationId }, joinMs: e.timeMs };
    }
    case 'start': {
      const cell = stationCell(index, e.stationId, a.entranceCell);
      const next = a.events[k + 1];
      return {
        sample: { id: a.id, phase: 'in-service', position: [cell[0], cell[1]], stationId: e.stationId, server: e.server },
        endsAtMs: next !== undefined && next.kind === 'complete' ? next.timeMs : null,
      };
    }
    case 'complete': {
      const cell = stationCell(index, e.stationId, a.entranceCell);
      return { sample: { id: a.id, phase: 'walking', position: [cell[0], cell[1]] } };
    }
    case 'exit':
      return { sample: { id: a.id, phase: 'exited', position: [a.exitCell[0], a.exitCell[1]] } };
  }
}

export function sampleAt(index: TraceIndex, tMs: number): Sample {
  const perStation: Record<string, StationSample> = {};
  for (const s of index.stations) perStation[s.id] = { waiting: 0, inService: 0, servers: s.servers, nextServiceEndMs: null, longestWaitMs: 0 };
  const attendees: AttendeeSample[] = [];
  const waiting = new Map<string, { sample: AttendeeSample; joinMs: number }[]>();
  let arrived = 0;
  let exited = 0;
  for (const a of index.attendees) {
    const where = whereIs(index, a, tMs);
    const sample = where.sample;
    attendees.push(sample);
    if (sample.phase !== 'not-arrived') arrived += 1;
    if (sample.phase === 'exited') exited += 1;
    const station = sample.stationId === undefined ? undefined : perStation[sample.stationId];
    if (station === undefined) continue;
    if (sample.phase === 'waiting') {
      station.waiting += 1;
      station.longestWaitMs = Math.max(station.longestWaitMs, tMs - (where.joinMs as number));
      const list = waiting.get(sample.stationId as string);
      const entry = { sample, joinMs: where.joinMs as number };
      if (list === undefined) waiting.set(sample.stationId as string, [entry]);
      else list.push(entry);
    } else if (sample.phase === 'in-service') {
      station.inService += 1;
      const end = where.endsAtMs;
      if (end !== null && end !== undefined && (station.nextServiceEndMs === null || end < station.nextServiceEndMs)) station.nextServiceEndMs = end;
    }
  }
  for (const list of waiting.values()) {
    list.sort((p, q) => p.joinMs - q.joinMs || byCodeUnit(p.sample.id, q.sample.id));
    list.forEach((entry, i) => {
      entry.sample.queueIndex = i;
    });
  }
  return { tMs, attendees, perStation, arrived, exited };
}

/** One row per trace event of one attendee in time order, then the closing row when the attendee never exits (7.4). */
export function timelineOf(index: TraceIndex, attendeeId: string, labels: Record<string, string>): TimelineRow[] {
  const a = index.byId.get(attendeeId);
  if (a === undefined) return [];
  const name = (id: string): string => labels[id] ?? id;
  const rows: TimelineRow[] = [];
  for (const e of a.events) {
    switch (e.kind) {
      case 'arrive':
        rows.push({ tMs: e.timeMs, label: 'Arrived', detail: formatTimestamp(e.timeMs) });
        break;
      case 'depart':
        rows.push({ tMs: e.timeMs, label: e.to.kind === 'station' ? `Walked to ${name(e.to.id)}` : 'Walked to exit', detail: `(${formatTimestamp(e.arriveMs - e.timeMs)})` });
        break;
      case 'join':
        rows.push({ tMs: e.timeMs, label: `Joined queue at ${name(e.stationId)}`, detail: formatTimestamp(e.timeMs) });
        break;
      case 'start':
        rows.push({ tMs: e.timeMs, label: `Service started (server ${e.server + 1})`, detail: `${formatTimestamp(e.timeMs)} \u00b7 waited ${formatTimestamp(e.waitMs)}` });
        break;
      case 'complete':
        rows.push({ tMs: e.timeMs, label: 'Service ended', detail: formatTimestamp(e.timeMs) });
        break;
      case 'exit':
        rows.push({ tMs: e.timeMs, label: 'Exited', detail: formatTimestamp(e.timeMs) });
        break;
    }
  }
  const last = a.events[a.events.length - 1];
  if (last !== undefined && last.kind !== 'exit') {
    if (index.capMs !== null) rows.push({ tMs: index.capMs, label: 'Unfinished at the drain cap', detail: formatTimestamp(index.capMs) });
    else {
      const where = whereIs(index, a, last.timeMs).sample.phase;
      const phase = where === 'waiting' ? 'waiting' : where === 'in-service' ? 'in service' : 'walking';
      rows.push({ tMs: last.timeMs, label: `Still ${phase} at closing`, detail: formatTimestamp(last.timeMs) });
    }
  }
  return rows;
}

/** The `cap` lexically smallest ids among attendees that have arrived and not exited are drawn; the rest are counted per station (6.4). */
export function visibleSet(sample: Sample, cap: number): { drawn: AttendeeSample[]; aggregated: Aggregate[] } {
  const present = sample.attendees.filter((a) => a.phase === 'walking' || a.phase === 'waiting' || a.phase === 'in-service').sort((p, q) => byCodeUnit(p.id, q.id));
  const drawn = present.slice(0, cap);
  const counts = new Map<string, Aggregate>();
  for (const a of present.slice(cap)) {
    const key = a.phase === 'walking' || a.stationId === undefined ? 'entrance' : a.stationId;
    let entry = counts.get(key);
    if (entry === undefined) {
      entry = { stationId: key, waiting: 0, inService: 0, walking: 0 };
      counts.set(key, entry);
    }
    if (a.phase === 'walking') entry.walking += 1;
    else if (a.phase === 'waiting') entry.waiting += 1;
    else entry.inService += 1;
  }
  return { drawn, aggregated: [...counts.values()].sort((p, q) => byCodeUnit(p.stationId, q.stationId)) };
}
