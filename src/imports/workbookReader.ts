// The only file that reads with SheetJS Community Edition (xlsx 0.20.3, Apache-2.0); src/exports/xlsx.ts is the only one that writes with it. Tests pass a fake WorkbookReader instead.
//
// SheetJS cell object fields read here (checked on 0.20.3 against the fixtures of scripts/make-fixtures.ts):
//   t  type: 'n' number, 's' string, 'b' boolean, 'e' error, 'd' date (with the cellDates read option), 'z' stub (blank)
//   v  the saved (cached) value; absent for a formula cell that was saved without one
//   f  the formula text; present for a formula cell. A formula is never evaluated: only f's presence and v are read.
// Read options: type 'array', cellFormula true, cellDates true, and `sheets` limited to the three template names so that
// SheetJS does not parse the cells of any other sheet.
import * as XLSX from 'xlsx';
import type { CellRef } from './preview';

export interface WorkbookReader {
  sheetNames(): string[];
  sheet(name: string): SheetReader | null;
}
export interface SheetReader {
  rows(): CellValue[][];
}
export type CellValue =
  | { kind: 'blank'; ref: CellRef }
  | { kind: 'number'; ref: CellRef; value: number; formula?: string }
  | { kind: 'text'; ref: CellRef; value: string; formula?: string }
  | { kind: 'formula-no-value'; ref: CellRef; formula: string }
  | { kind: 'date' | 'boolean' | 'error'; ref: CellRef };

export const TEMPLATE_SHEETS = ['Arrivals', 'Stations', 'Settings'] as const;

function toCellValue(sheet: string, address: string, cell: XLSX.CellObject | undefined): CellValue {
  const ref: CellRef = { sheet, cell: address };
  if (cell === undefined || cell.t === 'z') return { kind: 'blank', ref };
  const formula = typeof cell.f === 'string' && cell.f !== '' ? cell.f : undefined;
  if (formula !== undefined && cell.v === undefined) return { kind: 'formula-no-value', ref, formula };
  const withFormula = formula === undefined ? {} : { formula };
  switch (cell.t) {
    case 'n':
      return typeof cell.v === 'number' ? { kind: 'number', ref, value: cell.v, ...withFormula } : { kind: 'blank', ref };
    case 's':
      return typeof cell.v === 'string' && cell.v !== '' ? { kind: 'text', ref, value: cell.v, ...withFormula } : { kind: 'blank', ref };
    case 'b':
      return { kind: 'boolean', ref };
    case 'd':
      return { kind: 'date', ref };
    default:
      return { kind: 'error', ref };
  }
}

export function openWorkbook(bytes: ArrayBuffer): WorkbookReader {
  const workbook = XLSX.read(new Uint8Array(bytes), {
    type: 'array', cellFormula: true, cellDates: true, cellText: false, sheets: [...TEMPLATE_SHEETS],
  });
  return {
    sheetNames: () => [...workbook.SheetNames],
    sheet(name: string): SheetReader | null {
      const sheet = workbook.Sheets[name];
      if (sheet === undefined) return null;
      return {
        rows(): CellValue[][] {
          const ref = sheet['!ref'];
          if (ref === undefined) return [];
          const range = XLSX.utils.decode_range(ref);
          const rows: CellValue[][] = [];
          for (let r = 0; r <= range.e.r; r += 1) {
            const row: CellValue[] = [];
            for (let c = 0; c <= range.e.c; c += 1) {
              const address = XLSX.utils.encode_cell({ r, c });
              row.push(toCellValue(name, address, sheet[address] as XLSX.CellObject | undefined));
            }
            rows.push(row);
          }
          while (rows.length > 0 && (rows[rows.length - 1] as CellValue[]).every((c) => c.kind === 'blank')) rows.pop();
          return rows;
        },
      };
    },
  };
}
