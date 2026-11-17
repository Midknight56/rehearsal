// The one live region of the app (requirement 9.2). It is written only through store.setStatus (or the announcements the
// store derives from actions) and never per frame. No other aria-live, role="status" or <output> exists in the rendered app.
import type { ReactElement } from 'react';
import type { EditorStore } from './state/store';
import { useEditorState } from './state/useEditorState';

export function StatusRegion({ store }: { store: EditorStore }): ReactElement {
  const { status } = useEditorState(store);
  return (
    <div id="status" role="status" data-testid="status">
      {status}
    </div>
  );
}
