// Fields that hold typed text the model cannot run (a refused edit such as Servers 0). The scenario keeps its last valid
// value, so without this list Simulate would run that old value and show "Run complete" beside a field marked in red.
// A field registers its message while it shows one and removes it when the message goes or the field unmounts.
import { useSyncExternalStore } from 'react';

export type InvalidField = { label: string; message: string };

const fields = new Map<string, InvalidField>();
let snapshot: InvalidField[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  snapshot = [...fields.values()];
  for (const l of [...listeners]) l();
}

export function setInvalidField(key: string, field: InvalidField | null): void {
  const had = fields.get(key);
  if (field === null) {
    if (had === undefined) return;
    fields.delete(key);
  } else {
    if (had !== undefined && had.label === field.label && had.message === field.message) return;
    fields.set(key, field);
  }
  emit();
}

export function invalidFields(): InvalidField[] {
  return snapshot;
}

export function useInvalidFields(): InvalidField[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
  );
}

/** The run panel's text for a Simulate pressed while a field is marked. */
export function invalidRunMessage(list: InvalidField[]): string | null {
  const first = list[0];
  if (first === undefined) return null;
  const more = list.length > 1 ? ` ${list.length - 1} more ${list.length === 2 ? 'field is' : 'fields are'} marked too.` : '';
  return `Run blocked: ${first.label} holds a value the model cannot run (${first.message.replace(/\.$/, '')}). Fix the field marked in red, then activate Simulate.${more}`;
}

export const HIDDEN_RESULTS_TEXT = 'The results are hidden while a field marked in red holds a value the model cannot run, because they were made from the old value. Fix the field, then activate Simulate.';

export function resetInvalidFieldsForTest(): void {
  fields.clear();
  emit();
}
