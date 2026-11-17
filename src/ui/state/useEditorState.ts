import { useSyncExternalStore } from 'react';
import type { EditorStore } from './store';
import type { EditorState } from './types';

/** The editor state of a store, re-rendered in the same commit as every change. */
export function useEditorState(store: EditorStore): EditorState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
