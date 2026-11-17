// Moving between the four tabs (Plan, Game view, Compare, Run sheet). The screens are Plan, Compare and the run sheet; Game view
// is a section of the Plan screen, so the tab bar keeps one small piece of state: whether the Plan screen was opened at its Game
// view section. Opening Compare or the run sheet is exactly what the existing toolbar buttons do.
import { useSyncExternalStore } from 'react';
import { requestHeadingFocus } from './focus';
import type { EditorStore } from './state/store';

export type PlanSection = 'plan' | 'game';

let section: PlanSection = 'plan';
let pendingGameFocus = false;
const listeners = new Set<() => void>();
const emit = (): void => {
  for (const l of [...listeners]) l();
};

export function setPlanSection(next: PlanSection): void {
  if (section === next) return;
  section = next;
  emit();
}

export function usePlanSection(): PlanSection {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => section,
  );
}

/** The Plan screen that mounts next moves focus to the Game view heading (or, with no run, to Simulate). */
export function requestGameViewFocus(): void {
  pendingGameFocus = true;
}
export function hasPendingGameViewFocus(): boolean {
  return pendingGameFocus;
}
/** Reads and clears the request. */
export function takePendingGameViewFocus(): boolean {
  const was = pendingGameFocus;
  pendingGameFocus = false;
  return was;
}

export function resetNavigationForTest(): void {
  section = 'plan';
  pendingGameFocus = false;
  emit();
}

/** The Compare button of the Plan toolbar and the Compare tab do this. */
export function openCompare(store: EditorStore): void {
  requestHeadingFocus();
  store.dispatch({ type: 'screen/set', screen: 'compare' });
}

export const NO_RUN_STATUS = 'Press Simulate to see the game view.';

const hasRun = (store: EditorStore): boolean => {
  const state = store.getState();
  const stored = state.results[state.currentIndex];
  return stored !== undefined && stored.status !== 'none';
};

/** Focus and scroll to the Simulate button of the Plan screen, when it is in the page. */
export function focusSimulate(): void {
  const simulate = [...document.querySelectorAll<HTMLElement>('main button')].find((b) => b.textContent === 'Simulate');
  if (simulate === undefined) return;
  simulate.focus();
  simulate.scrollIntoView({ block: 'center' });
}

/** Moves focus and scroll to the Game view section heading of the Plan screen; with no run, to the Simulate button. */
export function focusGameViewSection(store: EditorStore): boolean {
  if (!hasRun(store)) {
    store.setStatus(NO_RUN_STATUS);
    focusSimulate();
    return true;
  }
  const heading = document.querySelector<HTMLElement>('[data-testid="game-view-panel"] h2');
  if (heading === null) return false;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus();
  heading.scrollIntoView({ block: 'start' });
  return true;
}

/** The Game view tab. */
export function openGameView(store: EditorStore): void {
  setPlanSection('game');
  if (store.getState().screen === 'plan') {
    if (!focusGameViewSection(store)) requestGameViewFocus();
    return;
  }
  requestGameViewFocus();
  store.dispatch({ type: 'screen/set', screen: 'plan' });
  if (!hasRun(store)) store.setStatus(NO_RUN_STATUS);
}

/** The Plan tab: the Plan screen at its top. */
export function openPlan(store: EditorStore): void {
  setPlanSection('plan');
  if (store.getState().screen === 'plan') {
    const heading = document.querySelector<HTMLElement>('main h1');
    window.scrollTo(0, 0);
    if (heading !== null) {
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
    return;
  }
  requestHeadingFocus(true);
  store.dispatch({ type: 'screen/set', screen: 'plan' });
}
