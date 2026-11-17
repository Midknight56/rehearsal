// The floor plan (requirements 3.1 to 3.5, 3.7, 3.8, 9.1): an SVG grid inside a focusable wrapper. It reads the one scenario
// of the editor store, so its markers and the stations table cannot disagree. Every action here has a form equivalent.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from 'react';
import type { EditorStore } from '../state/store';
import { useEditorState } from '../state/useEditorState';
import { keyActions } from './cursor';
import { useStationDrag } from './drag';
import { CELL_UNITS, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, cellCentre, cellOrigin, clampZoom, fitZoom, scrollAfterZoom } from './grid';
import { placeLabels, type LabelRequest, type Point } from '../../replay/labelPlacement';
import { routeSegments } from './routes';

/** Fit may use this share of the window height (the wrapper's max-height in app.css), so a wide grid fills the width. */
const FIT_HEIGHT_SHARE = 0.85;
/** The lane east of a station: ten queue slots 0.7 cell apart, as the game view lays them out. */
const LANE_CELLS = 9 * 0.7 + 1;
/** Label text is at least this many CSS px tall on screen, whatever the zoom: 11 on a wide window, 10 on a phone. */
const labelPx = (): number => (window.innerWidth < 480 ? 10 : 11);
const LANE_TEXT = 'the line forms here';

export const FLOOR_PLAN_KEY_HELP =
  'Arrow keys move the selected station or the cell cursor, Space toggles a blocked cell, E sets the entrance, X sets the exit, Escape clears the selection, Tab leaves the floor plan.';

export function FloorPlan({ store }: { store: EditorStore }): ReactElement {
  const state = useEditorState(store);
  const { scenario, selection, drag } = state;
  const { layout } = scenario;
  const helpId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);
  const panning = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const handlers = useStationDrag(store, drag !== null);

  const width = layout.cols * CELL_UNITS;
  const height = layout.rows * CELL_UNITS;

  const changeZoom = (next: number, pointer?: { x: number; y: number }, exact = false): void => {
    const el = wrapperRef.current;
    const target = exact ? next : clampZoom(next);
    if (target === zoom) return;
    if (el !== null) {
      const at = pointer ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 };
      pendingScroll.current = scrollAfterZoom({ left: el.scrollLeft, top: el.scrollTop }, at, zoom, target);
    }
    setZoom(target);
  };

  // The grid starts fitted to the wrapper, so every station is on the map and nothing is hidden at the right edge.
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (el !== null) setZoom(fitZoom(layout.cols, layout.rows, el.clientWidth, window.innerHeight * FIT_HEIGHT_SHARE));
    // Only on mount: later size changes are the Fit button's job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (el !== null && pendingScroll.current !== null) {
      el.scrollLeft = pendingScroll.current.left;
      el.scrollTop = pendingScroll.current.top;
    }
    pendingScroll.current = null;
  }, [zoom]);

  // Ctrl or Cmd with the wheel zooms around the pointer; a plain wheel keeps scrolling the page.
  const zoomRef = useRef(changeZoom);
  zoomRef.current = changeZoom;
  const zoomValue = useRef(zoom);
  zoomValue.current = zoom;
  useEffect(() => {
    const el = wrapperRef.current;
    if (el === null) return undefined;
    const onWheel = (e: WheelEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const box = el.getBoundingClientRect();
      zoomRef.current(zoomValue.current * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), { x: e.clientX - box.left, y: e.clientY - box.top });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' && state.drag !== null) {
      store.dispatch({ type: 'drag/cancel', id: state.drag.stationId, cell: state.drag.from });
      e.preventDefault();
      return;
    }
    const actions = keyActions(state, e.key);
    if (actions === null) return;
    e.preventDefault();
    for (const action of actions) store.dispatch(action);
  };

  const onPanDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    const el = wrapperRef.current;
    if (!e.shiftKey || el === null) return;
    panning.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
  };
  const onPanMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const el = wrapperRef.current;
    const p = panning.current;
    if (p === null || el === null) return;
    el.scrollLeft = p.left - (e.clientX - p.x);
    el.scrollTop = p.top - (e.clientY - p.y);
  };

  const cells: ReactElement[] = [];
  const blocked = new Set(layout.blockedCells.map((c) => `${c[0]},${c[1]}`));
  for (let y = 0; y < layout.rows; y += 1) {
    for (let x = 0; x < layout.cols; x += 1) {
      const key = `${x},${y}`;
      cells.push(
        <rect
          key={key}
          data-cell={key}
          className={blocked.has(key) ? 'cell blocked' : 'cell'}
          x={x * CELL_UNITS}
          y={y * CELL_UNITS}
          width={CELL_UNITS}
          height={CELL_UNITS}
          onPointerDown={(e) => {
            if (e.button !== 0 || e.shiftKey) return;
            store.dispatch({ type: 'select', selection: { kind: 'cell', cell: [x, y] } });
          }}
        />,
      );
    }
  }

  // Until a cohort is selected the route of the first cohort is drawn, so the walking labels are always on the map (3.8).
  const routeCohort = selection.kind === 'cohort' ? selection.id : scenario.cohorts[0]?.id;
  const segments = routeCohort === undefined ? [] : routeSegments(scenario, routeCohort);
  const entrance = cellOrigin(layout.entrance);
  const exit = cellOrigin(layout.exit);

  // Labels are placed in user units with a font that is labelPx() CSS px on screen (never below the 8 unit base), clear of the
  // markers and of each other. Widths are estimated at 0.6 em a character, a little wider than the bundled font.
  const fontUnits = Math.max(8, labelPx() / zoom);
  const lineH = fontUnits * 1.3;
  const textW = (s: string): number => s.length * fontUnits * 0.6 + 2;
  const pad = 3 / zoom;
  const markerBoxes = [
    ...scenario.stations.map((s) => cellOrigin(drag !== null && drag.stationId === s.id ? drag.current : s.cell)),
    entrance,
    exit,
  ].map((o) => ({ left: o.x, top: o.y, right: o.x + CELL_UNITS, bottom: o.y + CELL_UNITS }));
  const requests: LabelRequest[] = [];
  const beside = (o: Point, w: number, h: number, eastFirst: boolean): Point[] => {
    const east = { x: o.x + CELL_UNITS + pad, y: o.y + CELL_UNITS / 2 - h / 2 };
    const west = { x: o.x - pad - w, y: o.y + CELL_UNITS / 2 - h / 2 };
    return eastFirst ? [east, west] : [west, east];
  };
  for (const [id, text, o] of [['gate:in', 'In', entrance], ['gate:out', 'Out', exit]] as const) {
    requests.push({ id, w: textW(text), h: lineH, candidates: beside(o, textW(text), lineH, o.x + CELL_UNITS / 2 < width / 2) });
  }
  for (const station of scenario.stations) {
    const o = cellOrigin(drag !== null && drag.stationId === station.id ? drag.current : station.cell);
    const w = textW(station.label);
    const cx = o.x + CELL_UNITS / 2 - w / 2;
    requests.push({ id: `station:${station.id}`, w, h: lineH, candidates: [{ x: cx, y: o.y - lineH - 1 }, { x: cx, y: o.y + CELL_UNITS + 1 }, ...beside(o, w, lineH, true)] });
  }
  for (const station of scenario.stations) {
    const o = cellOrigin(drag !== null && drag.stationId === station.id ? drag.current : station.cell);
    const w = textW(LANE_TEXT);
    requests.push({
      id: `lane:${station.id}`, w, h: lineH,
      candidates: [{ x: o.x + CELL_UNITS + 3, y: o.y + CELL_UNITS / 2 - lineH / 2 }, { x: o.x + CELL_UNITS + 3, y: o.y + CELL_UNITS + 1 }, { x: o.x + CELL_UNITS + 3, y: o.y - lineH - 1 }],
    });
  }
  segments.forEach((segment, i) => {
    const mid =
      segment.kind === 'no-path'
        ? { x: (cellCentre(segment.fromCell).x + cellCentre(segment.toCell).x) / 2, y: (cellCentre(segment.fromCell).y + cellCentre(segment.toCell).y) / 2 }
        : cellCentre(segment.cells[Math.floor(segment.cells.length / 2)] as [number, number]);
    const w = textW(segment.label);
    requests.push({
      id: `route:${i}`, w, h: lineH,
      candidates: [{ x: mid.x - w / 2, y: mid.y - lineH - 2 }, { x: mid.x - w / 2, y: mid.y + 2 }, { x: mid.x + pad, y: mid.y - lineH / 2 }, { x: mid.x - pad - w, y: mid.y - lineH / 2 }],
    });
  });
  const spots = placeLabels({ w: width, h: height }, markerBoxes, requests, 1 / zoom);
  /** The text attributes of a placed label: its left edge and baseline in user units, at the screen-constant font size. */
  const at = (id: string): { x: number; y: number; style: { fontSize: number } } => {
    const p = spots.get(id) ?? { x: 0, y: 0 };
    return { x: p.x, y: p.y + fontUnits, style: { fontSize: fontUnits } };
  };

  return (
    <div className="floorplan">
      <div role="group" aria-label="Floor plan zoom" className="toolbar">
        <button type="button" onClick={() => changeZoom(zoom * ZOOM_STEP)}>Zoom in</button>
        <button type="button" onClick={() => changeZoom(zoom / ZOOM_STEP)}>Zoom out</button>
        <button
          type="button"
          onClick={() => {
            const el = wrapperRef.current;
            changeZoom(el === null ? 1 : fitZoom(layout.cols, layout.rows, el.clientWidth, window.innerHeight * FIT_HEIGHT_SHARE), undefined, true);
          }}
        >
          Fit
        </button>
        <span className="muted">Zoom {Math.round(zoom * 100)}% ({MIN_ZOOM * 100}% to {MAX_ZOOM * 100}%)</span>
      </div>
      <div
        ref={wrapperRef}
        className="floorplan-wrapper"
        tabIndex={0}
        role="application"
        aria-label="Floor plan"
        aria-describedby={helpId}
        onKeyDown={onKeyDown}
        onPointerDown={onPanDown}
        onPointerMove={onPanMove}
        onPointerUp={() => {
          panning.current = null;
        }}
      >
        <svg
          role="img"
          aria-label={`Floor plan of ${layout.cols} by ${layout.rows} cells`}
          viewBox={`0 0 ${width} ${height}`}
          width={width * zoom}
          height={height * zoom}
          onPointerMove={handlers.onPointerMove}
        >
          <defs>
            <pattern id="blocked-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" className="hatch-ground" />
              <line x1="0" y1="0" x2="0" y2="6" className="hatch-line" />
            </pattern>
            {/* Chalk: a noise mask on the strokes only (gates, markers, routes), never on text. The noise is drawn here, not in a stylesheet. */}
            <filter id="chalk-rough" filterUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="noise" />
              <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 5 -1" result="mask" />
              <feComposite in="SourceGraphic" in2="mask" operator="in" />
            </filter>
          </defs>
          {cells}
          {/* The line lane: where the queue forms east of each station (the game view's queue slots), a dashed pumpkin outline. */}
          <g pointerEvents="none" data-role="lanes">
            {scenario.stations.map((station) => {
              const left = station.cell[0] + 1;
              const laneW = Math.min(layout.cols, left + LANE_CELLS) - left;
              if (laneW <= 0) return null;
              const o = cellOrigin(drag !== null && drag.stationId === station.id ? drag.current : station.cell);
              return (
                <g key={station.id} className="lane" data-lane={station.id}>
                  <rect x={o.x + CELL_UNITS} y={o.y + 1} width={laneW * CELL_UNITS} height={CELL_UNITS - 2} rx="6" />
                  <text x={at(`lane:${station.id}`).x} y={at(`lane:${station.id}`).y} style={at(`lane:${station.id}`).style}>{LANE_TEXT}</text>
                </g>
              );
            })}
          </g>
          <g data-role="entrance" pointerEvents="none">
            <title>{`Entrance (${layout.entrance[0]}, ${layout.entrance[1]})`}</title>
            <rect className="gate" filter="url(#chalk-rough)" x={entrance.x} y={entrance.y} width={CELL_UNITS} height={CELL_UNITS} />
            <text className="gate-text" x={at('gate:in').x} y={at('gate:in').y} style={at('gate:in').style}>In</text>
          </g>
          <g data-role="exit" pointerEvents="none">
            <title>{`Exit (${layout.exit[0]}, ${layout.exit[1]})`}</title>
            <rect className="gate" filter="url(#chalk-rough)" x={exit.x} y={exit.y} width={CELL_UNITS} height={CELL_UNITS} />
            <text className="gate-text" x={at('gate:out').x} y={at('gate:out').y} style={at('gate:out').style}>Out</text>
          </g>
          <g pointerEvents="none">
            {segments.map((segment, i) => {
              if (segment.kind === 'no-path') {
                const a = cellCentre(segment.fromCell);
                const b = cellCentre(segment.toCell);
                return (
                  <g key={i} className="route no-path">
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeDasharray="4 3" filter="url(#chalk-rough)" />
                    <text className="route-label" x={at(`route:${i}`).x} y={at(`route:${i}`).y} style={at(`route:${i}`).style}>{segment.label}</text>
                  </g>
                );
              }
              const points = segment.cells.map((c) => {
                const p = cellCentre(c);
                return `${p.x},${p.y}`;
              });
              return (
                <g key={i} className="route">
                  <polyline points={points.join(' ')} fill="none" filter="url(#chalk-rough)" />
                  <text className="route-label" x={at(`route:${i}`).x} y={at(`route:${i}`).y} style={at(`route:${i}`).style}>{segment.label}</text>
                </g>
              );
            })}
          </g>
          {scenario.stations.map((station) => {
            const shown = drag !== null && drag.stationId === station.id ? drag.current : station.cell;
            const origin = cellOrigin(shown);
            const selected = selection.kind === 'station' && selection.id === station.id;
            const dragged = drag !== null && drag.stationId === station.id;
            return (
              <g
                key={station.id}
                role="img"
                aria-label={`${station.label} (${station.id}) at (${station.cell[0]}, ${station.cell[1]})`}
                data-station={station.id}
                data-cell={`${station.cell[0]},${station.cell[1]}`}
                className={selected ? 'marker selected' : 'marker'}
                pointerEvents={dragged ? 'none' : undefined}
                onPointerDown={handlers.onMarkerPointerDown}
              >
                <rect x={origin.x + 1} y={origin.y + 1} width={CELL_UNITS - 2} height={CELL_UNITS - 2} rx="3" filter="url(#chalk-rough)" />
                <text x={origin.x + CELL_UNITS / 2} y={origin.y + 11} textAnchor="middle" className="marker-glyph">{station.servers}</text>
              </g>
            );
          })}
          {/* Station names sit outside the marker groups, so a marker's box is its cell alone (the drag aims at it). */}
          <g pointerEvents="none" data-role="station-labels">
            {scenario.stations.map((station) => (
              <text key={station.id} x={at(`station:${station.id}`).x} y={at(`station:${station.id}`).y} style={at(`station:${station.id}`).style} className="marker-label">{station.label}</text>
            ))}
          </g>
          {selection.kind === 'cell' ? (
            <rect
              className="cursor"
              data-cell={`${selection.cell[0]},${selection.cell[1]}`}
              x={cellOrigin(selection.cell).x}
              y={cellOrigin(selection.cell).y}
              width={CELL_UNITS}
              height={CELL_UNITS}
              pointerEvents="none"
            />
          ) : null}
        </svg>
      </div>
      <p id={helpId} className="visually-hidden">{FLOOR_PLAN_KEY_HELP}</p>
    </div>
  );
}
