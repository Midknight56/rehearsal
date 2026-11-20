// Shared fixtures for the share-link tests.
import type { Scenario } from '../../src/domain/scenario';
import { harborHall, mulberry32 } from './generators';

/** Harbor Hall on an 80 by 80 grid with 3,500 pseudo random blocked cells in rows 20 and below: valid, and too random to compress below 6,000 characters. */
export function bigScenario(): Scenario {
  const base = harborHall().baseline;
  const rand = mulberry32(7);
  const cells = new Map<string, [number, number]>();
  while (cells.size < 3500) {
    const cell: [number, number] = [Math.floor(rand() * 80), 20 + Math.floor(rand() * 60)];
    cells.set(`${cell[0]},${cell[1]}`, cell);
  }
  return { ...base, layout: { ...base.layout, cols: 80, rows: 80, blockedCells: [...cells.values()] } };
}
