// The parsed rows of an import preview in display units, with the error text of each cell and the formula marker.
import type { ReactElement } from 'react';
import type { ImportError, ImportPreview, PreviewRow } from '../../imports/preview';

const ARRIVALS_FIELDS = ['cohort_id', 'start_min', 'end_min', 'count', 'arrival_pattern', 'route'] as const;
const STATIONS_FIELDS = ['station_id', 'label', 'servers', 'service_min_s', 'service_mode_s', 'service_max_s', 'cell_x', 'cell_y'] as const;
const SETTINGS_FIELDS = ['key', 'value'] as const;

export const FORMULA_MARKER = 'formula (saved value used)';

function Rows(props: { name: string; table: 'arrivals' | 'stations' | 'settings'; fields: readonly string[]; rows: PreviewRow<unknown>[] }): ReactElement {
  const { table, fields, rows } = props;
  return (
    <div className="table-scroll">
      <table>
        <caption>{`${props.name} preview`}</caption>
        <thead>
          <tr>
            <th scope="col">Row</th>
            {fields.map((f) => (
              <th key={f} scope="col">{f}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.row} id={`import-row-${table}-${r.row}`} tabIndex={-1}>
              <td>{r.row}</td>
              {fields.map((f) => {
                const own = r.errors.filter((e: ImportError) => e.location?.field === f || (f.startsWith('cell_') && e.location?.field === 'cell_x/cell_y' && f === 'cell_x'));
                return (
                  <td key={f}>
                    {r.raw[f] ?? ''}
                    {r.formulaFields.includes(f) ? <span className="muted">{` ${FORMULA_MARKER}`}</span> : null}
                    {own.map((e) => (
                      <span key={e.message} className="field-error">{e.message}</span>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PreviewTable({ preview }: { preview: ImportPreview }): ReactElement {
  return (
    <div>
      {preview.arrivals === null ? null : <Rows name="Arrivals" table="arrivals" fields={ARRIVALS_FIELDS} rows={preview.arrivals as PreviewRow<unknown>[]} />}
      {preview.stations === null ? null : <Rows name="Stations" table="stations" fields={STATIONS_FIELDS} rows={preview.stations as PreviewRow<unknown>[]} />}
      {preview.settings === null ? null : <Rows name="Settings" table="settings" fields={SETTINGS_FIELDS} rows={preview.settings as PreviewRow<unknown>[]} />}
    </div>
  );
}
