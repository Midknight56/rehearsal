// The tab bar: Plan, Game view, Compare, Run sheet. A nav named Screens holding four buttons, aria-current="page" on the current
// one. On a desktop it sits in the top bar; at 640 px and below it is the 64 px bar at the bottom (src/ui/styles/app.css).
// The buttons call the same code as the buttons of each screen's toolbar (openCompare, openRunSheet), so the two cannot differ.
import { useEffect, type ReactElement } from 'react';
import { openCompare, openGameView, openPlan, setPlanSection, usePlanSection } from './navigation';
import { openRunSheet } from './print/PrintControls';
import type { EditorStore } from './state/store';
import { useEditorState } from './state/useEditorState';

type TabId = 'plan' | 'game' | 'compare' | 'sheet';

export function ScreenTabs({ store }: { store: EditorStore }): ReactElement {
  const { screen } = useEditorState(store);
  const section = usePlanSection();
  // Game view is a section of the Plan screen; any other screen is no longer at it.
  useEffect(() => {
    if (screen !== 'plan') setPlanSection('plan');
  }, [screen]);
  const current: TabId = screen === 'compare' ? 'compare' : screen === 'print' ? 'sheet' : section === 'game' ? 'game' : 'plan';
  const tabs: { id: TabId; label: string; open: () => void }[] = [
    { id: 'plan', label: 'Plan', open: () => openPlan(store) },
    { id: 'game', label: 'Game view', open: () => openGameView(store) },
    { id: 'compare', label: 'Compare', open: () => { if (screen !== 'compare') openCompare(store); } },
    { id: 'sheet', label: 'Run sheet', open: () => { if (screen !== 'print') openRunSheet(store); } },
  ];
  return (
    <nav aria-label="Screens" className="screen-tabs">
      {tabs.map((t) => (
        <button key={t.id} type="button" aria-current={current === t.id ? 'page' : undefined} onClick={t.open}>{t.label}</button>
      ))}
    </nav>
  );
}
