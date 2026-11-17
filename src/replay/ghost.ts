// The baseline ghost layer (requirement 12.4). Pure: it decides which attendees each layer draws and how each layer looks;
// the one file that talks to PixiJS (gameView.ts) draws what this returns. Both layers read one replay clock.
import { CANDIDATE_STYLE, GHOST_STYLE } from '../comparison/replay-contract';
import { visibleSet, type Aggregate, type AttendeeSample, type Sample } from './sampler';

/** Sprites per layer; two layers keep the whole canvas within the 1,000-sprite budget. */
export const LAYER_CAP = 500;

export type Layer = { drawn: AttendeeSample[]; aggregated: Aggregate[] };

/** The candidate layer and the baseline ghost, each capped at `cap` sprites with the rest counted for badges. */
export function splitLayers(candidate: Sample, baseline: Sample | null, cap: number = LAYER_CAP): { candidate: Layer; baseline: Layer } {
  return {
    candidate: visibleSet(candidate, cap),
    baseline: baseline === null ? { drawn: [], aggregated: [] } : visibleSet(baseline, cap),
  };
}

export type LayerLook = {
  alpha: number;
  outline: 'solid' | 'dashed';
  fill: 'solid' | 'hatched';
  /** 0xRRGGBB. Cyan for the candidate, orange for the baseline; contrast on the board is checked in tests/ui/styles.test.ts. */
  colour: number;
};

const HUES = { cyan: 0x22d3ee, orange: 0xfb923c } as const;

/** The look of a layer from the style constants of the comparison contract (GHOST_STYLE, CANDIDATE_STYLE). */
export function lookOf(role: 'candidate' | 'baseline'): LayerLook {
  const style = role === 'baseline' ? GHOST_STYLE : CANDIDATE_STYLE;
  return { alpha: style.alpha, outline: style.outline, fill: style.fill, colour: HUES[style.hue] };
}

/** Pool keys: one attendee id can sit in both layers, so the ghost's slot key carries a prefix no attendee id can have. */
export const GHOST_KEY_PREFIX = '\u0000ghost:';
export const ghostKey = (id: string): string => `${GHOST_KEY_PREFIX}${id}`;
