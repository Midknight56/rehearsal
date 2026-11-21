// The run sheet on screen (requirements 8.1, 8.2). It renders the RunSheetModel of src/exports/run-sheet.ts with React text
// nodes only, through the same row builders and headings as the saved HTML document, so the two print identical strings.
// There is no local run-sheet model type in src/ui.
import type { ReactElement } from 'react';
import {
  ASSUMPTIONS_TITLE, RUN_SHEET_TABLES, cohortRows, generatedLine, modelVersionText, runSheetHeading, scenarioHashLine, segmentRows,
  staffHoursLine, stationRows, walkingRows, type RunSheetModel, type RunSheetRow,
} from '../../exports/run-sheet';
import { NOT_A_FORECAST } from '../../exports/assumptions-text';
import { NoBreak } from '../noBreak';

function SheetTable({ spec, rows }: { spec: { title: string; columns: readonly string[] }; rows: RunSheetRow[] }): ReactElement {
  return (
    <div className="table-scroll" role="group" aria-label={`${spec.title} table`} tabIndex={0}>
    <table className="stack">
      {/* The section heading above shows the title; the caption keeps the table named for a screen reader. */}
      <caption className="visually-hidden">{spec.title}</caption>
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
              <td key={`${row.head}|${spec.columns[i + 1] ?? i}`} data-label={spec.columns[i + 1]}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

/** The hash line in four unbroken 16 character pieces, so on a phone it wraps between pieces instead of running off the sheet; its text is unchanged. */
function HashLine({ text }: { text: string }): ReactElement {
  const m = /^(.*?)([0-9a-f]{64})(.*)$/s.exec(text);
  if (m === null) return <p className="hash-line">{text}</p>;
  const hash = m[2] as string;
  return (
    <p className="hash-line">
      {m[1]}
      {[0, 16, 32, 48].map((i) => <span key={i} className="hash-part">{hash.slice(i, i + 16)}</span>)}
      {m[3]}
    </p>
  );
}

/** `results` is the one line that may carry the stale label; the staffing and station tables never do. */
export function RunSheetView({ model, results }: { model: RunSheetModel; results: string }): ReactElement {
  return (
    <article id="run-sheet" className="run-sheet" aria-label="Run sheet">
      <h1><NoBreak text={runSheetHeading(model)} /></h1>
      <p><NoBreak text={generatedLine(model.generatedAt)} /></p>
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
        <p><NoBreak text={staffHoursLine(model)} /></p>
      </section>
      <p data-testid="run-sheet-results"><NoBreak text={results} /></p>
      <section id="assumptions" aria-label={ASSUMPTIONS_TITLE}>
        <h2>{ASSUMPTIONS_TITLE}</h2>
        <HashLine text={scenarioHashLine(model)} />
        <p><NoBreak text={modelVersionText(model)} /></p>
        <ul aria-label="Model assumptions">
          {model.assumptions.map((line) => (
            <li key={line}><NoBreak text={line} /></li>
          ))}
        </ul>
        <p><NoBreak text={model.limits} /></p>
        <p><NoBreak text={NOT_A_FORECAST} /></p>
      </section>
    </article>
  );
}