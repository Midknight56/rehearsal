// Floor plan keyboard (requirements 3.4, 3.7, 9.1): the actions one key press stands for, as a pure function of the editor
// state. A refusal is not decided here: the reducer refuses and the store announces the text.
import type { Cell } from '../../domain/scenario';
import type { EditorAction, EditorState } from '../state/types';
import { ARROW_DELTAS } from './grid';

/** The cell the cursor sits on: the selected cell, otherwise null. */
export const cursorCell = (state: EditorState): Cell | null => (state.selection.kind === 'cell' ? state.selection.cell : null);

/**
 * The actions for a key pressed while the wrapper has focus; null when the key is not one of the floor plan keys
 * (the caller then leaves the event alone) and an empty list when the key is handled but changes nothing.
 */
export function keyActions(state: EditorState, key: string): EditorAction[] | null {
  const { layout, stations } = state.scenario;
  const { selection } = state;
  const delta = ARROW_DELTAS[key];
  if (delta !== undefined) {
    if (selection.kind === 'station') {
      const station = stations.find((s) => s.id === selection.id);
      if (station === undefined) return [];
      return [{ type: 'station/move', id: station.id, cell: [station.cell[0] + delta[0], station.cell[1] + delta[1]], via: 'nudge' }];
    }
    if (selection.kind === 'cohort') return [];
    const from = selection.kind === 'cell' ? selection.cell : layout.entrance;
    const x = Math.min(layout.cols - 1, Math.max(0, from[0] + delta[0]));
    const y = Math.min(layout.rows - 1, Math.max(0, from[1] + delta[1]));
    return [{ type: 'select', selection: { kind: 'cell', cell: [x, y] } }];
  }
  if (key === 'Escape') {
    if (selection.kind === 'station') {
      const station = stations.find((s) => s.id === selection.id);
      return [{ type: 'select', selection: { kind: 'cell', cell: station === undefined ? layout.entrance : station.cell } }];
    }
    if (selection.kind === 'cohort') return [{ type: 'select', selection: { kind: 'cell', cell: layout.entrance } }];
    return null;
  }
  const cell = cursorCell(state);
  if (key === ' ' || key === 'Spacebar') return cell === null ? [] : [{ type: 'layout/toggle-blocked', cell }];
  if (key === 'e' || key === 'E') return cell === null ? [] : [{ type: isBlocked(state, cell) ? 'layout/unblock-and-place-entrance' : 'layout/set-entrance', cell }];
  if (key === 'x' || key === 'X') return cell === null ? [] : [{ type: isBlocked(state, cell) ? 'layout/unblock-and-place-exit' : 'layout/set-exit', cell }];
  return null;
}

/** E and X on a blocked cell use the combined action, so the unblock and the placement are one undo entry. */
function isBlocked(state: EditorState, cell: Cell): boolean {
  return state.scenario.layout.blockedCells.some((b) => b[0] === cell[0] && b[1] === cell[1]);
}
