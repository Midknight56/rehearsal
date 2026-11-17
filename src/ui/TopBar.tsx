// The top bar of every screen: the app name, the tab bar (when a scenario is open), and the screen buttons that already exist
// (Compare, Print run sheet, Back to plan) in a group of their own. The tab bar repeats the screens; it does not replace those buttons.
import type { ReactElement, ReactNode } from 'react';
import { ScreenTabs } from './ScreenTabs';
import type { EditorStore } from './state/store';

export function TopBar({ children, store }: { children?: ReactNode; store?: EditorStore }): ReactElement {
  return (
    <header className="topbar no-print">
      <p className="brand">Rehearsal</p>
      {store === undefined ? null : <ScreenTabs store={store} />}
      {children === undefined ? null : <div role="group" aria-label="Screen buttons" className="topnav">{children}</div>}
    </header>
  );
}
