// Template downloads (requirement 1.1): the three committed files, served as they are from public/examples/.
import { useState, type ReactElement } from 'react';

export const TEMPLATE_FILES = ['arrivals.csv', 'stations.csv', 'rehearsal-template.xlsx'] as const;

export function Templates({ baseUrl }: { baseUrl?: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const base = (baseUrl ?? import.meta.env.BASE_URL).replace(/\/?$/, '/');
  return (
    <span>
      <button type="button" aria-expanded={open} onClick={() => setOpen(true)}>Download templates</button>
      {open ? (
        <ul aria-label="Templates" style={{ display: 'inline-flex', gap: '12px', listStyle: 'none', margin: '0 0 0 8px', padding: 0 }}>
          {TEMPLATE_FILES.map((name) => (
            <li key={name}>
              <a href={`${base}examples/${name}`} download={name}>{name}</a>
            </li>
          ))}
        </ul>
      ) : null}
    </span>
  );
}
