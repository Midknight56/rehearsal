// Queue lines (requirement 6.6): the slots of a line beside its station, in queue-join order, and the colour that scales
// with the waiting count. The colour shows simulated waiting only; it is not a measure of crowd density, and the legend under
// the game view says so. Pure functions: the renderer only places sprites where these return.

import { waitColour } from './waitRamp';

const SLOTS_PER_ROW = 10;
const SLOT_GAP = 0.7;
/** The waiting count at which the colour stops changing. */
export const QUEUE_COLOUR_SATURATION = 20;

/** The position, in cell units, of the slot with the given queue index: east of the station, ten slots to a row. */
export function queueSlot(stationCell: [number, number], queueIndex: number): [number, number] {
  return [stationCell[0] + 1 + (queueIndex % SLOTS_PER_ROW) * SLOT_GAP, stationCell[1] + Math.floor(queueIndex / SLOTS_PER_ROW) * SLOT_GAP];
}

/** A 0xRRGGBB colour on the wait ramp: sage with nobody waiting to ember at QUEUE_COLOUR_SATURATION or more waiting. */
export function queueColour(waiting: number): number {
  return waitColour(waiting, QUEUE_COLOUR_SATURATION);
}
