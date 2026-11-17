// The run sheet on screen (requirements 8.1, 8.2). It renders the RunSheetModel of src/exports/run-sheet.ts with React text
// nodes only, through the same row builders and headings as the saved HTML document, so the two print identical strings.
// There is no local run-sheet model type in src/ui.
import type { ReactElement } from 'react';
import {
  ASSUMPTIONS_TITLE, RUN_SHEET_TABLES, cohortRows, generatedLine, modelVersionText, runSheetHeading, scenarioHashLine, segmentRows,
  staffHoursLine, stationRows, walkingRows, type RunSheetModel, type RunSheetRow,
} from '../../exports/run-sheet';
import { NOT_A_FORECAST } from '../../exports/assumptions-text';

function SheetTable({ spec, rows }: { spec: { title: string; columns: readonly string[] }; rows: RunSheetRow[] }): ReactElement {
  return (
    <table>
      <caption>{spec.title}</caption>
      <thead>
        <tr>
          {spec.columns.map((column) => (
            <th key={column} scope="col">{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.head}>
            <th scope="row">{row.head}</th>
            {row.cells.map((cell, i) => (
              <td key={`${row.head}|${spec.columns[i + 1] ?? i}`}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** `results` is the one line that may carry the stale label; the staffing and station tables never do. */
export function RunSheetView({ model, results }: { model: RunSheetModel; results: string }): ReactElement {
  return (
    <article id="run-sheet" className="run-sheet" aria-label="Run sheet">
      <h1>{runSheetHeading(model)}</h1>
      <p>{generatedLine(model.generatedAt)}</p>
      <section id="cohorts" aria-label={RUN_SHEET_TABLES.cohorts.title}>
        <h2>{RUN_SHEET_TABLES.cohorts.title}</h2>
        <SheetTable spec={RUN_SHEET_TABLES.cohorts} rows={cohortRows(model)} />
      </section>
      <section id="stations" aria-label={RUN_SHEET_TABLES.stations.title}>
        <h2>{RUN_SHEET_TABLES.stations.title}</h2>
        <SheetTable spec={RUN_SHEET_TABLES.stations} rows={stationRows(model)} />
      </section>
      <section id="segments" aria-label={RUN_SHEET_TABLES.segments.title}>
        <h2>{RUN_SHEET_TABLES.segments.title}</h2>
        <SheetTable spec={RUN_SHEET_TABLES.segments} rows={segmentRows(model)} />
      </section>
      <section id="walking" aria-label={RUN_SHEET_TABLES.walking.title}>
        <h2>{RUN_SHEET_TABLES.walking.title}</h2>
        <SheetTable spec={RUN_SHEET_TABLES.walking} rows={walkingRows(model)} />
      </section>
      <section id="staff-hours" aria-label="Staff-hours">
        <p>{staffHoursLine(model)}</p>
      </section>
      <p data-testid="run-sheet-results">{results}</p>
      <section id="assumptions" aria-label={ASSUMPTIONS_TITLE}>
        <h2>{ASSUMPTIONS_TITLE}</h2>
        <p>{scenarioHashLine(model)}</p>
        <p>{modelVersionText(model)}</p>
        <ul aria-label="Model assumptions">
          {model.assumptions.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>{model.limits}</p>
        <p>{NOT_A_FORECAST}</p>
      </section>
    </article>
  );
}