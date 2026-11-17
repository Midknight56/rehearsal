// The top bar of every screen: the app name, and the screen buttons that already exist (Compare, Print run sheet, Back to plan),
// placed in a nav. It adds no control and no tab bar; it only holds the existing ones.
import type { ReactElement, ReactNode } from 'react';

export function TopBar({ children }: { children?: ReactNode }): ReactElement {
  return (
    <header className="topbar no-print">
      <p className="brand">Rehearsal</p>
      {children === undefined ? null : <nav aria-label="Screens" className="topnav">{children}</nav>}
    </header>
  );
}