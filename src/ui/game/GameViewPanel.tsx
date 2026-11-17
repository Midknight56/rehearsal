// Game view panel (task 11). Task 1 writes a stub so that the tests compile.
import type { ReactElement } from 'react';
import type { EditorStore } from '../state/store';

export function GameViewPanel(_props: { store: EditorStore; createView?: typeof import("../../replay/gameView").createGameView }): ReactElement {
  throw new Error('not implemented: GameViewPanel');
}
