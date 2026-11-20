// The Copy share link button (spec share-link, requirement 1). The link is built in this browser and written to the
// clipboard; nothing is sent anywhere. The status region is written only through setStatus, and focus stays on the button.
import type { ReactElement } from 'react';
import { SHARE_COPIED_TEXT, SHARE_COPY_FAILED_TEXT, SHARE_TOO_LARGE_TEXT, buildShareLink } from '../exports/share-link';
import type { EditorStore } from './state/store';

export type CopyDeps = { writeText(text: string): Promise<void>; base: string };

export async function copyShareLink(store: EditorStore, deps: CopyDeps): Promise<void> {
  const built = await buildShareLink(store.getState().scenario, deps.base);
  if (!built.ok) {
    store.setStatus(SHARE_TOO_LARGE_TEXT);
    return;
  }
  try {
    await deps.writeText(built.url);
  } catch {
    store.setStatus(SHARE_COPY_FAILED_TEXT);
    return;
  }
  store.setStatus(SHARE_COPIED_TEXT);
}

function browserDeps(): CopyDeps {
  const { origin, pathname, search } = window.location;
  return {
    base: `${origin}${pathname}${search}`,
    writeText: async (text) => {
      if (navigator.clipboard === undefined) throw new Error('No clipboard.');
      await navigator.clipboard.writeText(text);
    },
  };
}

export function ShareLinkButton({ store }: { store: EditorStore }): ReactElement {
  return (
    <button type="button" data-testid="copy-share-link" onClick={() => void copyShareLink(store, browserDeps())}>Copy share link</button>
  );
}
