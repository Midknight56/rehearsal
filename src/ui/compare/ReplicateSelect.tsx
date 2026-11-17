// Replication 0 to 29 for the replay (requirement 12.5). The value is the replicate on screen; a choice takes effect when
// the loader completes, so a pending choice never changes what the select or the layers show.
import type { ReactElement } from 'react';
import { REPLICATION_INDICES } from '../../comparison/replications';

export function ReplicateSelect(props: { replication: number; busy: boolean; onSelect: (r: number) => void }): ReactElement {
  return (
    <label>
      {'Replication shown in the game view '}
      <select data-testid="replicate-select" value={props.replication} aria-disabled={props.busy ? 'true' : undefined} onChange={(e) => { if (!props.busy) props.onSelect(Number(e.target.value)); }}>
        {REPLICATION_INDICES.map((r) => (
          <option key={r} value={r}>{String(r)}</option>
        ))}
      </select>
    </label>
  );
}