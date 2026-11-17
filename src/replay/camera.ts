// Follow camera, display state only (task 10.2). Task 1 writes the type and the signature.

export type Camera = {
  zoom: number;
  setZoom(z: number): void;
  centerOn(position: [number, number]): void;
  /** Cell position to viewport pixels. */
  toScreen(position: [number, number]): [number, number];
};

export function createCamera(_viewport: { width: number; height: number; cellPx: number }): Camera {
  throw new Error('not implemented: createCamera');
}
