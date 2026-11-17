// Pointer drag of a station marker (requirement 3.2): pointerdown dispatches drag/start, pointermove drag/move with the
// hovered cell, pointerup drag/end (one committed edit, or a refusal that leaves the station). Escape dispatches drag/cancel.
import { useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import type { EditorStore } from '../state/store';
import { cellOfTarget } from './grid';

export function useStationDrag(store: EditorStore, dragging: boolean): {
  onMarkerPointerDown: (e: ReactPointerEvent<Element>) => void;
  onPointerMove: (e: ReactPointerEvent<Element>) => void;
} {
  // The pointer can be released anywhere, so the end of a drag is listened for on the window while one is in progress.
  useEffect(() => {
    if (!dragging) return undefined;
    const end = (e: PointerEvent): void => {
      const drag = store.getState().drag;
      if (drag === null) return;
      const cell = cellOfTarget(e.target);
      if (cell === null) store.dispatch({ type: 'drag/cancel', id: drag.stationId, cell: drag.from });
      else store.dispatch({ type: 'drag/end', id: drag.stationId, cell });
    };
    const cancel = (): void => {
      const drag = store.getState().drag;
      if (drag !== null) store.dispatch({ type: 'drag/cancel', id: drag.stationId, cell: drag.from });
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [store, dragging]);

  return {
    onMarkerPointerDown(e) {
      if (e.button !== 0 || e.shiftKey) return;
      const id = (e.currentTarget as Element).getAttribute('data-station');
      const station = id === null ? undefined : store.getState().scenario.stations.find((s) => s.id === id);
      if (station === undefined) return;
      store.dispatch({ type: 'select', selection: { kind: 'station', id: station.id } });
      store.dispatch({ type: 'drag/start', id: station.id, cell: station.cell });
    },
    onPointerMove(e) {
      const drag = store.getState().drag;
      if (drag === null) return;
      const cell = cellOfTarget(e.target);
      if (cell === null || (cell[0] === drag.current[0] && cell[1] === drag.current[1])) return;
      store.dispatch({ type: 'drag/move', id: drag.stationId, cell });
    },
  };
}
