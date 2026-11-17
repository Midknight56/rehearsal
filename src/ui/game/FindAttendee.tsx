// Find attendee (requirement 7.3): the combobox pattern over every attendee id of the loaded trace. Case-insensitive
// substring, sorted, at most 20 shown with the match count. It reads ids only, so it works without the canvas.
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';

const MAX_SHOWN = 20;
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function FindAttendee(props: { attendeeIds: string[]; onPick: (id: string) => void; onFollow?: (id: string) => void }): ReactElement {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const optionRefs = useRef(new Map<string, HTMLElement>());
  const needle = query.trim().toLowerCase();
  const matches = useMemo(
    () => (needle === '' ? [] : props.attendeeIds.filter((id) => id.toLowerCase().includes(needle)).sort(byCodeUnit)),
    [props.attendeeIds, needle],
  );
  const shown = matches.slice(0, MAX_SHOWN);
  const expanded = needle !== '';
  const optionId = (i: number): string => `${listId}-option-${i}`;
  const clamped = Math.min(active, Math.max(0, shown.length - 1));

  const pick = (id: string): void => {
    props.onPick(id);
    // Focus moves to the chosen option, at once, so F and Escape work from there (7.1, 7.2) even when the next key follows immediately.
    optionRefs.current.get(id)?.focus();
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(shown.length - 1, clamped + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(0, clamped - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const id = shown[clamped];
      if (id !== undefined) pick(id);
    }
  };

  const onOptionKey = (id: string, i: number) => (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(id);
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      props.onFollow?.(id);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = shown[i + (e.key === 'ArrowDown' ? 1 : -1)];
      if (next !== undefined) optionRefs.current.get(next)?.focus();
    }
  };

  return (
    <div className="find-attendee">
      <label>
        Find attendee{' '}
        <input
          type="text"
          role="combobox"
          aria-label="Find attendee"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && shown.length > 0 ? optionId(clamped) : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onInputKey}
        />
      </label>
      {expanded ? (
        <>
          <p className="muted">
            {matches.length === 0 ? `No attendee matches "${query.trim()}".` : matches.length > MAX_SHOWN ? `${MAX_SHOWN} of ${matches.length} matches` : `${matches.length} matches`}
          </p>
          <ul id={listId} role="listbox" aria-label="Matching attendees" className="options">
            {shown.map((id, i) => (
              <li
                key={id}
                id={optionId(i)}
                role="option"
                aria-selected={i === clamped}
                tabIndex={-1}
                ref={(el) => {
                  if (el === null) optionRefs.current.delete(id);
                  else optionRefs.current.set(id, el);
                }}
                onClick={() => pick(id)}
                onKeyDown={onOptionKey(id, i)}
              >
                {id}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <ul id={listId} role="listbox" aria-label="Matching attendees" hidden />
      )}
    </div>
  );
}