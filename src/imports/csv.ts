// CSV adapter over Papa Parse (requirement 1). Rows are arrays of strings (dynamicTyping off); every number is parsed
// by parseDecimal. A file above the size limit is refused before the parser is called.
import Papa from 'papaparse';
import type { Scenario } from '../domain/scenario';
import {
  ARRIVALS_COLUMNS, STATIONS_COLUMNS, buildPreview, emptyPreview, matchHeader, tooLargeMessage,
  type Deps, type ImportError, type ImportPreview, type ImportTable, type SourceRow, type SourceTable,
} from './preview';

type CsvFile = { table: 'arrivals' | 'stations'; file: File };

const unreadable = (name: string, reason: string): ImportError => ({ code: 'file-unreadable', message: `Could not read ${name}: ${reason}.` });

function toSource(rows: string[][], template: readonly string[], table: ImportTable): { source: SourceTable; notRead: string[] } {
  const header = matchHeader(rows[0] ?? [], template, table);
  const out: SourceRow[] = [];
  rows.slice(1).forEach((cells, i) => {
    if (cells.every((c) => c.trim() === '')) return;
    const record: SourceRow['cells'] = {};
    for (const [name, index] of Object.entries(header.index)) {
      const text = cells[index] ?? '';
      record[name] = text.trim() === '' ? { kind: 'blank' } : { kind: 'text', text };
    }
    out.push({ row: i + 2, cells: record });
  });
  return { source: { rows: out, headerErrors: header.errors }, notRead: header.notRead };
}

export async function previewCsv(files: CsvFile[], current: Scenario, deps: Deps): Promise<ImportPreview> {
  const source: ImportPreview['source'] = { kind: 'csv', files: files.map(({ table, file }) => ({ table, name: file.name, bytes: file.size })) };
  const tooLarge = files.filter(({ file }) => file.size > deps.maxBytes);
  if (tooLarge.length > 0) {
    return emptyPreview(source, tooLarge.map(({ file }): ImportError => ({ code: 'file-too-large', message: tooLargeMessage(file.name, file.size) })));
  }

  const tables: Partial<Record<'arrivals' | 'stations', SourceTable>> = {};
  const columnsNotRead = { arrivals: [] as string[], stations: [] as string[] };
  for (const { table, file } of files) {
    let text: string;
    try {
      text = (await file.text()).replace(/^\uFEFF/, '');
    } catch (error) {
      return emptyPreview(source, [unreadable(file.name, error instanceof Error ? error.name : 'Error')]);
    }
    let parsed: Papa.ParseResult<string[]>;
    try {
      parsed = Papa.parse<string[]>(text, { header: false, dynamicTyping: false, skipEmptyLines: false, delimiter: ',' });
    } catch (error) {
      return emptyPreview(source, [unreadable(file.name, error instanceof Error ? error.message : 'parse failed')]);
    }
    const first = parsed.errors[0];
    if (first !== undefined) return emptyPreview(source, [unreadable(file.name, first.message)]);
    const converted = toSource(parsed.data, table === 'arrivals' ? ARRIVALS_COLUMNS : STATIONS_COLUMNS, table);
    tables[table] = converted.source;
    columnsNotRead[table] = converted.notRead;
  }

  return buildPreview({
    current, deps, source, sheetsRead: [], sheetsIgnored: [], columnsNotRead,
    arrivals: tables.arrivals ?? null, stations: tables.stations ?? null, settings: null,
  });
}
