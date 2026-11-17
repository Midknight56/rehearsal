// Per-attendee index of a trace (task 10.1). Task 1 writes the type and the signature.
import type { Scenario } from '../domain/scenario';
import type { Trace } from '../simulation/trace';

export type TraceIndex = { trace: Trace; stations: Scenario['stations']; endMs: number };

export function buildIndex(_trace: Trace, _stations: Scenario['stations']): TraceIndex {
  throw new Error('not implemented: buildIndex');
}
