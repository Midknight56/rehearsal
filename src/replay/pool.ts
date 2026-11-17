// Fixed-size sprite slot pool (task 10.2). Task 1 writes the type and the signature.

export type Pool<T> = {
  readonly size: number;
  readonly used: number;
  readonly allocated: number;
  /** Assigns a slot to each id (reusing slots of ids that stay); releases the rest. */
  sync(ids: string[]): Map<string, T>;
  releaseAll(): void;
};

export function createPool<T>(_size: number, _make: () => T): Pool<T> {
  throw new Error('not implemented: createPool');
}
