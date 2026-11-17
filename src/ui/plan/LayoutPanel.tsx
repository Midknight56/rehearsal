// Layout panel: the keyboard and form equivalent of every floor plan action that is not a station move (requirement 3.7).
import { useState, type ReactElement } from 'react';
import { parseWhole } from '../../imports/numbers';
import type { EditorStore } from '../state/store';
import { useEditorState } from '../state/useEditorState';
import { CommitInput, PairInput, attempt } from './fields';

const cellParse = (text: string): number | null => {
  const p = parseWhole(text);
  return p.ok && p.value >= 0 ? p.value : null;
};
const cellParseError = (name: 'x' | 'y', text: string): string => `${name} must be a whole number of 0 or more (got "${text.trim()}")`;

export function LayoutPanel({ store }: { store: EditorStore }): ReactElement {
  const { scenario } = useEditorState(store);
  const { layout } = scenario;
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const resize = (axis: 'cols' | 'rows') => (text: string): string | null => {
    const p = parseWhole(text);
    if (!p.ok) return `must be a whole number from 1 to 80 (got "${text.trim()}")`;
    return attempt(store, { type: 'layout/resize', cols: axis === 'cols' ? p.value : layout.cols, rows: axis === 'rows' ? p.value : layout.rows });
  };

  const addCell = (): void => {
    const px = cellParse(x);
    const py = cellParse(y);
    if (px === null || py === null) return setAddError('Blocked cell x and y must be whole numbers of 0 or more.');
    if (layout.blockedCells.some((b) => b[0] === px && b[1] === py)) return setAddError(`Cell (${px}, ${py}) is already blocked.`);
    const text = attempt(store, { type: 'layout/toggle-blocked', cell: [px, py] });
    setAddError(text);
    if (text === null) {
      setX('');
      setY('');
    }
  };

  return (
    <div>
      <h2>Layout</h2>
      <p>
        <label>Columns <CommitInput label="Columns" value={String(layout.cols)} inputMode="numeric" width="4em" onCommit={resize('cols')} /></label>{' '}
        <label>Rows <CommitInput label="Rows" value={String(layout.rows)} inputMode="numeric" width="4em" onCommit={resize('rows')} /></label>
      </p>
      <p>
        Entrance (x, y){' '}
        <PairInput labelX="Entrance x" labelY="Entrance y" value={layout.entrance} parse={cellParse} parseError={cellParseError} onCommit={(cell) => attempt(store, { type: 'layout/set-entrance', cell })} />
      </p>
      <p>
        Exit (x, y){' '}
        <PairInput labelX="Exit x" labelY="Exit y" value={layout.exit} parse={cellParse} parseError={cellParseError} onCommit={(cell) => attempt(store, { type: 'layout/set-exit', cell })} />
      </p>
      <h3>Blocked cells</h3>
      <ul aria-label="Blocked cells">
        {layout.blockedCells.map((b) => (
          <li key={`${b[0]},${b[1]}`}>
            {`(${b[0]}, ${b[1]})`}{' '}
            <button type="button" aria-label={`Remove (${b[0]}, ${b[1]})`} onClick={() => attempt(store, { type: 'layout/toggle-blocked', cell: [b[0], b[1]] })}>Remove</button>
          </li>
        ))}
      </ul>
      <p>
        <input aria-label="Blocked cell x" inputMode="numeric" value={x} style={{ width: '4em' }} onChange={(e) => setX(e.target.value)} />{' '}
        <input aria-label="Blocked cell y" inputMode="numeric" value={y} style={{ width: '4em' }} onChange={(e) => setY(e.target.value)} />{' '}
        <button type="button" onClick={addCell}>Add cell</button>
        {addError === null ? null : <span className="field-error">{addError}</span>}
      </p>
    </div>
  );
}
