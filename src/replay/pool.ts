// Fixed-size sprite slot pool (requirement 6.4, 6.9, invariant I7). Every slot is allocated once, up front; sync() only moves
// slots between ids, so the number of allocated objects never rises above `size` however many results are loaded.

export type Pool<T> = {
  readonly size: number;
  readonly used: number;
  readonly allocated: number;
  /** Assigns a slot to each id (reusing slots of ids that stay); releases the rest. */
  sync(ids: string[]): Map<string, T>;
  releaseAll(): void;
};

export function createPool<T>(size: number, make: () => T): Pool<T> {
  const items: T[] = Array.from({ length: size }, () => make());
  const slotOf = new Map<string, number>();
  const free: number[] = [];
  for (let i = size - 1; i >= 0; i -= 1) free.push(i);

  return {
    size,
    get used() {
      return slotOf.size;
    },
    get allocated() {
      return items.length;
    },
    sync(ids) {
      const wanted = new Set(ids.slice(0, size));
      for (const [id, slot] of slotOf) {
        if (!wanted.has(id)) {
          slotOf.delete(id);
          free.push(slot);
        }
      }
      const result = new Map<string, T>();
      for (const id of wanted) {
        let slot = slotOf.get(id);
        if (slot === undefined) {
          slot = free.pop();
          if (slot === undefined) continue;
          slotOf.set(id, slot);
        }
        result.set(id, items[slot] as T);
      }
      return result;
    },
    releaseAll() {
      slotOf.clear();
      free.length = 0;
      for (let i = size - 1; i >= 0; i -= 1) free.push(i);
    },
  };
}