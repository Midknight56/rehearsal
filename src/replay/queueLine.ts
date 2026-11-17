// Queue lines (requirement 6.6): the slots of a line beside its station, in queue-join order, and the colour that scales
// with the waiting count. The colour shows simulated waiting only; it is not a measure of crowd density, and the legend under
// the game view says so. Pure functions: the renderer only places sprites where these return.

const SLOTS_PER_ROW = 10;
const SLOT_GAP = 0.7;
/** The waiting count at which the colour stops changing. */
export const QUEUE_COLOUR_SATURATION = 20;

/** The position, in cell units, of the slot with the given queue index: east of the station, ten slots to a row. */
export function queueSlot(stationCell: [number, number], queueIndex: number): [number, number] {
  return [stationCell[0] + 1 + (queueIndex % SLOTS_PER_ROW) * SLOT_GAP, stationCell[1] + Math.floor(queueIndex / SLOTS_PER_ROW) * SLOT_GAP];
}

const LOW = [0x33, 0x41, 0x55] as const;
const HIGH = [0xe8, 0x79, 0xf9] as const;

/** A 0xRRGGBB colour that moves from slate (nobody waiting) to magenta (QUEUE_COLOUR_SATURATION or more waiting). */
export function queueColour(waiting: number): number {
  const t = Math.min(1, Math.max(0, waiting / QUEUE_COLOUR_SATURATION));
  const channel = (i: 0 | 1 | 2): number => Math.round(LOW[i] + (HIGH[i] - LOW[i]) * t);
  return (channel(0) << 16) | (channel(1) << 8) | channel(2);
}