import type { Scenario } from '../domain/scenario';

export type SheetRows = (string | number)[][];
export type WorkbookSheets = { Arrivals: SheetRows; Stations: SheetRows; Settings: SheetRows };

export function workbookRows(scenario: Scenario): WorkbookSheets {
  void scenario;
  throw new Error('not implemented: workbookRows');
}
export function exportWorkbook(scenario: Scenario): Uint8Array {
  void scenario;
  throw new Error('not implemented: exportWorkbook');
}
