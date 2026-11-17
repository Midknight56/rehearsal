// Preferences (task 12). Task 1 writes the types and signatures only.
export type Prefs = { version: 1; motion: 'system' | 'reduce' | 'allow' };
export const PREFS_KEY = 'rehearsal.prefs.v1';
export const DEFAULT_PREFS: Prefs = { version: 1, motion: 'system' };

export function createPrefsStore(_storage: Storage | null): { read(): Prefs; write(p: Prefs): void } {
  throw new Error('not implemented: createPrefsStore');
}
