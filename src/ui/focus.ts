// After a screen changes, the control that was activated is gone; focus goes to the new screen's heading so it is never lost
// to the document body (requirement 9.3). The heading is focusable by script only (tabindex -1), not a Tab stop. The request
// is a flag consumed by the next screen that mounts, so focus moves in that screen's own effect, after it is in the document.
import { useEffect } from 'react';

let pending = false;

/** Call when a control changes the screen; the screen that mounts next focuses its heading. */
export function requestHeadingFocus(): void {
  pending = true;
}

export function useHeadingFocus(): void {
  useEffect(() => {
    if (!pending) return;
    pending = false;
    const heading = document.querySelector<HTMLElement>('main h1');
    if (heading === null) return;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus();
  }, []);
}