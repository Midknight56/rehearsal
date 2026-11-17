// Aggregate badges (requirement 6.4): the attendees beyond the sprite cap are counted, not drawn.
import type { Aggregate } from './sampler';

export type Badge = { stationId: string | 'entrance'; lines: string[] };

/** `+<n> waiting` and `+<n> in service` per station, `+<n> walking` at the entrance. Empty counts give no line. */
export function badgeLines(aggregated: Aggregate[]): Badge[] {
  const badges: Badge[] = [];
  for (const g of aggregated) {
    const lines: string[] = [];
    if (g.stationId === 'entrance') {
      if (g.walking > 0) lines.push(`+${g.walking} walking`);
    } else {
      if (g.waiting > 0) lines.push(`+${g.waiting} waiting`);
      if (g.inService > 0) lines.push(`+${g.inService} in service`);
    }
    if (lines.length > 0) badges.push({ stationId: g.stationId, lines });
  }
  return badges;
}