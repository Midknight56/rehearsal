// Keeps a number with its unit, and a hyphenated word, on one line. The text stays one string per element for the reader; only
// the line breaking changes, through a span with white-space: nowrap (src/ui/styles/app.css). Text nodes only.
import type { ReactElement, ReactNode } from 'react';

/** A number with an optional unit (and a closing full stop), or a word joined by hyphens. */
const KEEP_TOGETHER = /[\p{L}\d]+(?:-[\p{L}\d]+)+|[-+\u2212]?\d[\d.,]*(?:\s(?:s|ms|%|h|people|attendees)\b\.?)?/gu;

export function noBreak(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(KEEP_TOGETHER)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<span key={m.index} className="nb">{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function NoBreak({ text }: { text: string }): ReactElement {
  return <>{noBreak(text)}</>;
}