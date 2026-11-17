// The Compare headline with its number counting up to the real value in 600 ms, ease-out. While it counts, the moving number is
// in an aria-hidden element and the real sentence sits beside it as visually hidden text, so a screen reader gets the final
// sentence at once; when the count ends (or under reduced motion, from the start) the sentence is one plain text. The final
// number is always the real one: it is the text it was given, not a computed copy.
import { useEffect, useState, type ReactElement } from 'react';
import { easeOutCubic } from '../../replay/easing';
import { NoBreak } from '../noBreak';
import { splitHeadlineNumber } from './headline';

export const COUNT_UP_MS = 600;
const FRAME_MS = 16;

/** The number to show `elapsedMs` into the count: from 0 to `target`, with the target's decimals, exactly `target` at the end. */
export function countUpText(target: string, elapsedMs: number): string {
  if (elapsedMs >= COUNT_UP_MS) return target;
  const plain = target.replace(/,/g, '');
  const decimals = plain.includes('.') ? (plain.split('.')[1] as string).length : 0;
  const value = Number(plain) * easeOutCubic(elapsedMs / COUNT_UP_MS);
  return value.toFixed(decimals);
}

function Counting({ text, before, number, after, className }: { text: string; before: string; number: string; after: string; className?: string }): ReactElement {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      const ms = Date.now() - started;
      setElapsed(ms);
      if (ms >= COUNT_UP_MS) clearInterval(timer);
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, []);
  if (elapsed >= COUNT_UP_MS) return <p className={className}><NoBreak text={text} /></p>;
  return (
    <p className={className}>
      <span className="visually-hidden">{text}</span>
      <span aria-hidden="true">
        {before}
        <span className="nb"><span className="count">{countUpText(number, elapsed)}</span>{after}</span>
      </span>
    </p>
  );
}

/** One sentence; `reduced` shows it at once. A sentence with no number is shown as it is. */
export function CountUpSentence({ text, reduced, className }: { text: string; reduced: boolean; className?: string }): ReactElement {
  const parts = reduced ? null : splitHeadlineNumber(text);
  if (parts === null) return <p className={className}><NoBreak text={text} /></p>;
  return <Counting key={text} text={text} {...parts} {...(className === undefined ? {} : { className })} />;
}
