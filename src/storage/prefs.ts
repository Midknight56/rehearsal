// Preferences: `motion` under localStorage['rehearsal.prefs.v1']. Reads never throw; a failed write is ignored
// (the in-memory preference still applies for the session).
export type Prefs = { version: 1; motion: 'system' | 'reduce' | 'allow' };
export const PREFS_KEY = 'rehearsal.prefs.v1';
export const DEFAULT_PREFS: Prefs = { version: 1, motion: 'system' };

export function createPrefsStore(storage: Storage | null): { read(): Prefs; write(p: Prefs): void } {
  return {
    read() {
      try {
        const raw = storage?.getItem(PREFS_KEY);
        if (raw === null || raw === undefined) return { ...DEFAULT_PREFS };
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_PREFS };
        const motion = (parsed as { version?: unknown; motion?: unknown }).motion;
        if ((parsed as { version?: unknown }).version !== 1) return { ...DEFAULT_PREFS };
        if (motion === 'system' || motion === 'reduce' || motion === 'allow') return { version: 1, motion };
        return { ...DEFAULT_PREFS };
      } catch {
        return { ...DEFAULT_PREFS };
      }
    },
    write(p) {
      try {
        storage?.setItem(PREFS_KEY, JSON.stringify({ version: 1, motion: p.motion }));
      } catch {
        // Unwritable storage: nothing to do.
      }
    },
  };
}