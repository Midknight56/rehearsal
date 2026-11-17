// The wait ramp of the game view: a guest's colour is a continuous function of the time it has waited so far in its current
// visit, from sage (no wait) through straw and pumpkin to ember (the longest wait of the run). Display only: it reads the
// trace index and changes nothing in it.
import { lastAtOrBefore } from './sampler';
import type { TraceIndex } from './traceIndex';

/** Sage, straw, pumpkin, ember as 0xRRGGBB; the same stops as --wait-ramp in tokens.css. */
export const WAIT_RAMP = [0x9fd8b4, 0xf2d377, 0xff9a3d, 0xff7f61] as const;

const channel = (colour: number, shift: number): number => (colour >> shift) & 255;

/** The ramp colour for `waitedMs` of `maxWaitMs`; below 0 is sage, above the maximum is ember, and a run with no waiting is sage. */
export function waitColour(waitedMs: number, maxWaitMs: number): number {
  const t = maxWaitMs > 0 ? Math.min(1, Math.max(0, waitedMs / maxWaitMs)) : 0;
  const scaled = t * (WAIT_RAMP.length - 1);
  const segment = Math.min(WAIT_RAMP.length - 2, Math.floor(scaled));
  const f = scaled - segment;
  const from = WAIT_RAMP[segment] as number;
  const to = WAIT_RAMP[segment + 1] as number;
  const mix = (shift: number): number => Math.round(channel(from, shift) + (channel(to, shift) - channel(from, shift)) * f);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/** The time this attendee has waited in its current visit at `tMs`: since the join while waiting, the whole wait while in service, else 0. */
export function waitedMsAt(index: TraceIndex, attendeeId: string, tMs: number): number {
  const attendee = index.byId.get(attendeeId);
  if (attendee === undefined) return 0;
  const k = lastAtOrBefore(attendee.events, tMs);
  const event = k < 0 ? undefined : attendee.events[k];
  if (event === undefined) return 0;
  if (event.kind === 'join') return Math.max(0, tMs - event.timeMs);
  if (event.kind === 'start') return event.waitMs;
  return 0;
}

/** The longest wait of the run: the largest recorded wait, or the time since the join of someone still waiting at the end. */
export function longestWaitMs(index: TraceIndex): number {
  let longest = 0;
  for (const attendee of index.attendees) {
    attendee.events.forEach((event, i) => {
      if (event.kind === 'start') longest = Math.max(longest, event.waitMs);
      else if (event.kind === 'join' && attendee.events[i + 1]?.kind !== 'start') longest = Math.max(longest, index.endMs - event.timeMs);
    });
  }
  return longest;
}