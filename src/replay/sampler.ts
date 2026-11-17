// Pure sampler over a trace index (task 10.1). Task 1 writes the types and the signatures.
import type { Scenario } from '../domain/scenario';
import type { TraceIndex } from './traceIndex';

export type Phase = 'not-arrived' | 'walking' | 'waiting' | 'in-service' | 'exited';
export type AttendeeSample = { id: string; phase: Phase; position: [number, number]; stationId?: string; queueIndex?: number; server?: number };
export type StationSample = { waiting: number; inService: number; servers: number; nextServiceEndMs: number | null; longestWaitMs: number };
export type Sample = { tMs: number; attendees: AttendeeSample[]; perStation: Record<string, StationSample>; arrived: number; exited: number };
export type TimelineRow = { tMs: number; label: string; detail: string };
export type Aggregate = { stationId: string | 'entrance'; waiting: number; inService: number; walking: number };

export function sampleAt(_index: TraceIndex, _tMs: number): Sample {
  throw new Error('not implemented: sampleAt');
}

export function timelineOf(_index: TraceIndex, _attendeeId: string, _labels: Record<string, string>): TimelineRow[] {
  throw new Error('not implemented: timelineOf');
}

export function visibleSet(_sample: Sample, _cap: number): { drawn: AttendeeSample[]; aggregated: Aggregate[] } {
  throw new Error('not implemented: visibleSet');
}

export type StationList = Scenario['stations'];
