// @vitest-environment jsdom
// The four screen tabs: Plan, Game view, Compare, Run sheet, in a nav named Screens, with aria-current on the current one.
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScreenTabs } from '../../src/ui/ScreenTabs';
import { resetNavigationForTest, takePendingGameViewFocus } from '../../src/ui/navigation';
import type { EditorStore } from '../../src/ui/state/store';
import { TopBar } from '../../src/ui/TopBar';
import { makeStore, renderWith } from './render';

const nav = () => screen.getByRole('navigation', { name: 'Screens' });
const tab = (name: string) => within(nav()).getByRole('button', { name });
const current = () => within(nav()).getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page').map((b) => b.textContent);

let store: EditorStore;
beforeEach(() => {
  resetNavigationForTest();
  store = makeStore();
  store.dispatch({ type: 'screen/set', screen: 'plan' });
});
afterEach(() => resetNavigationForTest());

describe('the tab bar', () => {
  it('is a nav named Screens with four buttons in the order Plan, Game view, Compare, Run sheet', () => {
    renderWith(store, (s) => <ScreenTabs store={s} />);
    expect(within(nav()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Plan', 'Game view', 'Compare', 'Run sheet']);
    expect(document.querySelectorAll('nav[aria-label="Screens"]')).toHaveLength(1);
  });

  it('marks Plan as current on the Plan screen', () => {
    renderWith(store, (s) => <ScreenTabs store={s} />);
    expect(current()).toEqual(['Plan']);
    expect(tab('Plan').getAttribute('aria-current')).toBe('page');
    expect(tab('Compare').hasAttribute('aria-current')).toBe(false);
  });

  it('Compare opens the Compare screen and becomes current', () => {
    renderWith(store, (s) => <ScreenTabs store={s} />);
    fireEvent.click(tab('Compare'));
    expect(store.getState().screen).toBe('compare');
    expect(current()).toEqual(['Compare']);
  });

  it('Run sheet opens the print screen and becomes current', () => {
    renderWith(store, (s) => <ScreenTabs store={s} />);
    fireEvent.click(tab('Run sheet'));
    expect(store.getState().screen).toBe('print');
    expect(current()).toEqual(['Run sheet']);
  });

  it('Plan from another screen opens the Plan screen', () => {
    store.dispatch({ type: 'screen/set', screen: 'compare' });
    renderWith(store, (s) => <ScreenTabs store={s} />);
    fireEvent.click(tab('Plan'));
    expect(store.getState().screen).toBe('plan');
    expect(current()).toEqual(['Plan']);
  });

  it('Game view with no run stays on the Plan screen and says what to press, as a text node of the one status region', () => {
    renderWith(store, (s) => <ScreenTabs store={s} />);
    expect(store.getState().results[store.getState().currentIndex]?.status ?? 'none').toBe('none');
    fireEvent.click(tab('Game view'));
    expect(store.getState().screen).toBe('plan');
    expect(store.getState().status).toBe('Press Simulate to see the game view.');
    expect(current()).toEqual(['Game view']);
  });

  it('Game view from Compare opens the Plan screen and asks it to move focus to the Game view heading', () => {
    store.dispatch({ type: 'screen/set', screen: 'compare' });
    renderWith(store, (s) => <ScreenTabs store={s} />);
    fireEvent.click(tab('Game view'));
    expect(store.getState().screen).toBe('plan');
    expect(takePendingGameViewFocus()).toBe(true);
    expect(takePendingGameViewFocus()).toBe(false);
  });

  it('going back to the Plan screen by any other way shows Plan as current again', () => {
    const view = renderWith(store, (s) => <ScreenTabs store={s} />);
    fireEvent.click(tab('Game view'));
    expect(current()).toEqual(['Game view']);
    act(() => store.dispatch({ type: 'screen/set', screen: 'compare' }));
    act(() => store.dispatch({ type: 'screen/set', screen: 'plan' }));
    view.rerender(<ScreenTabs store={store} />);
    expect(current()).toEqual(['Plan']);
  });

  it('puts the existing screen buttons in a group of their own, not in the Screens nav', () => {
    renderWith(store, (s) => <TopBar store={s}><button type="button">Compare</button></TopBar>);
    const group = screen.getByRole('group', { name: 'Screen buttons' });
    expect(within(group).getAllByRole('button')).toHaveLength(1);
    expect(within(nav()).getAllByRole('button')).toHaveLength(4);
  });

  it('has no tab bar on the landing screen (no scenario yet)', () => {
    renderWith(store, () => <TopBar />);
    expect(screen.queryByRole('navigation', { name: 'Screens' })).toBeNull();
  });
});
