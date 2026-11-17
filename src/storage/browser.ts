// The browser's localStorage for the scenario and comparison stores, or null when the browser refuses it (private mode, policy).
// In the test build only (VITE_REHEARSAL_TEST=1) it is wrapped so window.__rehearsal.storage.failNextWrite(name) can make the
// next write throw an error with that name; the production build keeps the plain object and drops the wrapper.

let failNext: string | null = null;

/** Makes the next setItem through browserStorage() throw an error named `name` (test build). */
export function failNextWrite(name: string): void {
  failNext = name;
}

function failable(inner: Storage): Storage {
  return {
    get length() { return inner.length; },
    clear: () => inner.clear(),
    getItem: (key) => inner.getItem(key),
    key: (index) => inner.key(index),
    removeItem: (key) => inner.removeItem(key),
    setItem: (key, value) => {
      if (failNext !== null) {
        const name = failNext;
        failNext = null;
        const error = new Error(`Injected storage failure (${name}).`);
        error.name = name;
        throw error;
      }
      inner.setItem(key, value);
    },
  };
}

export function browserStorage(): Storage | null {
  try {
    const storage = window.localStorage;
    return import.meta.env.VITE_REHEARSAL_TEST === '1' ? failable(storage) : storage;
  } catch {
    return null;
  }
}