// The assumptions diff (requirement 12.2): the header from changesHeader, the ordered list of change texts and, when the
// populations differ, the highlighted population entry.
import type { ReactElement } from 'react';
import { COMBINED_NOTE, changesHeader } from '../../comparison/labels';
import type { CompareView } from './view';

export function ChangeList({ view }: { view: CompareView }): ReactElement {
  const { diff } = view;
  const real = diff.changes.filter((c) => !c.derived).length;
  return (
    <section className="panel" aria-label="Changes">
      <h3>{changesHeader(diff.kind, real)}</h3>
      {diff.kind === 'combined' ? <p>{COMBINED_NOTE}</p> : null}
      <ol data-testid="change-list" data-kind={diff.kind} aria-label="Changes between the scenarios">
        {diff.changes.map((entry) => (
          <li
            key={`${entry.path}|${entry.text}`}
            data-testid={entry.group === 'population' && entry.highlight ? 'population-change' : undefined}
            className={entry.highlight ? 'population' : undefined}
          >
            {entry.text}
          </li>
        ))}
      </ol>
    </section>
  );
}