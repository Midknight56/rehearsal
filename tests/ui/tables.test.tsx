// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { File as NodeFile } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ImportDialog } from '../../src/ui/import/ImportDialog';
import { Templates } from '../../src/ui/import/Templates';
import { fakeWorkbook, harborHallSheets, sheetRows } from '../imports/fakeWorkbook';
import { TEMPLATE_ARRIVALS_CSV, TEMPLATE_STATIONS_CSV } from '../imports/helpers';
import { ArrivalsTable } from '../../src/ui/plan/ArrivalsTable';
import { StationsTable } from '../../src/ui/plan/StationsTable';
import { makeStore, renderWith } from './render';
import type { EditorStore } from '../../src/ui/state/store';

const stationsTable = () => screen.getByRole('table', { name: 'Stations' });

describe('9.1 semantic tables', () => {
  it.each([
    ['Arrivals', (s: ReturnType<typeof makeStore>) => <ArrivalsTable store={s} />],
    ['Stations', (s: ReturnType<typeof makeStore>) => <StationsTable store={s} />],
  ])('%s is a table with a caption and column headers with scope', (name, build) => {
    renderWith(makeStore(), build);
    const table = screen.getByRole('table', { name });
    expect(table.querySelector('caption')?.textContent).toContain(name);
    const headers = table.querySelectorAll('th[scope="col"]');
    expect(headers.length).toBeGreaterThan(3);
  });

  it('every input, select and button has a non-empty accessible name', () => {
    renderWith(makeStore(), (s) => <><ArrivalsTable store={s} /><StationsTable store={s} /></>);
    for (const el of screen.getAllByRole('textbox').concat(screen.queryAllByRole('spinbutton'), screen.getAllByRole('button'))) {
      const name = el.getAttribute('aria-label') ?? (el as HTMLInputElement).labels?.[0]?.textContent ?? el.textContent ?? '';
      expect(name.trim().length, el.outerHTML).toBeGreaterThan(0);
    }
  });

  it('shows the stations of the scenario with their cell coordinates', () => {
    renderWith(makeStore(), (s) => <StationsTable store={s} />);
    expect((screen.getByLabelText('cell_x of packs') as HTMLInputElement).value).toBe('34');
    expect((screen.getByLabelText('cell_y of packs') as HTMLInputElement).value).toBe('12');
  });

  it('renders a hostile label as text, verbatim, without creating elements', () => {
    const store = makeStore();
    act(() => store.dispatch({ type: 'station/set', id: 'checkin', patch: { label: '<script>alert(1)</script>' } }));
    renderWith(store, (s) => <StationsTable store={s} />);
    expect((screen.getByLabelText('label of checkin') as HTMLInputElement).value).toBe('<script>alert(1)</script>');
    expect(stationsTable().querySelector('script')).toBeNull();
  });
});

describe('field commits and inline errors', () => {
  it('commits a field on Enter, not on each keystroke', () => {
    const store = makeStore();
    renderWith(store, (s) => <StationsTable store={s} />);
    const servers = screen.getByLabelText('servers of checkin') as HTMLInputElement;
    fireEvent.change(servers, { target: { value: '3' } });
    expect(store.getState().scenario.stations[0]?.servers).toBe(1);
    expect(store.getState().past[0]).toHaveLength(0);
    fireEvent.keyDown(servers, { key: 'Enter' });
    expect(store.getState().scenario.stations[0]?.servers).toBe(3);
    expect(store.getState().past[0]).toHaveLength(1);
  });

  it('commits on blur and creates no entry when the value is unchanged', () => {
    const store = makeStore();
    renderWith(store, (s) => <StationsTable store={s} />);
    const servers = screen.getByLabelText('servers of checkin') as HTMLInputElement;
    fireEvent.blur(servers);
    expect(store.getState().past[0]).toHaveLength(0);
    fireEvent.change(servers, { target: { value: '2' } });
    fireEvent.blur(servers);
    expect(store.getState().past[0]).toHaveLength(1);
  });

  it('keeps the typed cell text and shows the refusal beside the inputs', () => {
    const store = makeStore();
    renderWith(store, (s) => <StationsTable store={s} />);
    const x = screen.getByLabelText('cell_x of packs') as HTMLInputElement;
    const y = screen.getByLabelText('cell_y of packs') as HTMLInputElement;
    fireEvent.change(x, { target: { value: '16' } });
    fireEvent.change(y, { target: { value: '21' } });
    fireEvent.keyDown(y, { key: 'Enter' });
    expect(screen.getByText('Cell (16, 21) is blocked.')).toBeTruthy();
    expect(x.value).toBe('16');
    expect(y.value).toBe('21');
    expect(store.getState().scenario.stations[1]?.cell).toEqual([34, 12]);
  });

  it('moves the station when a valid cell is typed (3.3)', () => {
    const store = makeStore();
    renderWith(store, (s) => <StationsTable store={s} />);
    fireEvent.change(screen.getByLabelText('cell_x of packs'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('cell_y of packs'), { target: { value: '7' } });
    fireEvent.keyDown(screen.getByLabelText('cell_y of packs'), { key: 'Enter' });
    expect(store.getState().scenario.stations[1]?.cell).toEqual([12, 7]);
  });
});

describe('Inspect and Delete', () => {
  it('Delete on a routed station is refused beside the button and in the status text', () => {
    const store = makeStore();
    renderWith(store, (s) => <StationsTable store={s} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete checkin' }));
    const text = 'Check-in desk (checkin) is on the route of cohort "doors". Remove it from the route before deleting the station.';
    expect(within(stationsTable()).getByText(text)).toBeTruthy();
    expect(store.getState().status).toBe(text);
    expect(store.getState().scenario.stations).toHaveLength(2);
  });

  it('Inspect selects the station', () => {
    const store = makeStore();
    renderWith(store, (s) => <StationsTable store={s} />);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect packs' }));
    expect(store.getState().selection).toEqual({ kind: 'station', id: 'packs' });
  });

  it('Add is disabled at 10 stations and says so', () => {
    const store = makeStore();
    for (let i = 0; i < 8; i++) act(() => store.dispatch({ type: 'station/add' }));
    renderWith(store, (s) => <StationsTable store={s} />);
    expect(screen.getByRole('button', { name: 'Add station' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('10 of 10 stations')).toBeTruthy();
  });
});

// Task 7: the import dialog (requirements 1.3, 1.5 to 1.8, 2.1 to 2.5, 2.7)
const file = (name: string, content: string | Uint8Array): File => new NodeFile([content] as never, name) as unknown as File;
const fixture = (name: string): File => file(name, readFileSync(`tests/imports/fixtures/${name}`));
const choose = (testId: string, ...files: File[]): void => {
  fireEvent.change(screen.getByTestId(testId), { target: { files } });
};
const openDialog = (store: EditorStore, deps: Parameters<typeof ImportDialog>[0]['deps'] = {}) => {
  renderWith(store, (s) => <><ArrivalsTable store={s} /><StationsTable store={s} /><ImportDialog store={s} deps={deps} /></>);
  act(() => store.dispatch({ type: 'import/open' }));
  return screen.getByRole('dialog', { name: 'Import' });
};
const applyButton = () => screen.getByRole('button', { name: 'Apply import' });

describe('import dialog: choosing files', () => {
  it('is headed Import and has the three file inputs with their test ids and labels', () => {
    const dialog = openDialog(makeStore());
    expect(within(dialog).getByRole('heading', { name: 'Import' })).toBeTruthy();
    expect(screen.getByLabelText('Arrivals CSV').getAttribute('data-testid')).toBe('import-arrivals-csv');
    expect(screen.getByLabelText('Stations CSV').getAttribute('data-testid')).toBe('import-stations-csv');
    expect(screen.getByLabelText('Workbook (.xlsx)').getAttribute('data-testid')).toBe('import-workbook');
    expect(applyButton().getAttribute('aria-disabled')).toBe('true');
  });

  it('refuses a file above 2,097,152 bytes with the size message and builds no preview', async () => {
    const store = makeStore();
    const dialog = openDialog(store);
    choose('import-arrivals-csv', file('big.csv', new Uint8Array(2_097_153)));
    await within(dialog).findByText('big.csv is 2.00 MiB; the limit is 2 MiB.');
    expect(applyButton().getAttribute('aria-disabled')).toBe('true');
    expect(store.getState().importDialog.open).toBe(true);
  });

  it('lists each error as a button that moves focus to the offending row, and keeps Apply import disabled', async () => {
    const store = makeStore();
    const dialog = openDialog(store);
    choose('import-arrivals-csv', fixture('arrivals-invalid-route.csv'));
    const button = await within(dialog).findByRole('button', { name: 'Row 2, route: station "lounge" is not defined.' });
    expect(applyButton().getAttribute('aria-disabled')).toBe('true');
    expect(applyButton().hasAttribute('disabled')).toBe(false);
    fireEvent.click(button);
    expect((document.activeElement as HTMLElement).id).toBe('import-row-arrivals-2');
    fireEvent.click(applyButton());
    expect(store.getState().scenario.revision).toBe(0);
    expect(store.getState().status).toBe('Apply import is unavailable: the preview has errors.');
  });

  it('shows the parsed rows in display units and notes the columns that are not read', async () => {
    const dialog = openDialog(makeStore());
    choose('import-arrivals-csv', fixture('arrivals-extra-column.csv'));
    await within(dialog).findByText('Columns not read: notes');
    const table = within(dialog).getByRole('table', { name: 'Arrivals preview' });
    expect(table.textContent).toContain('doors');
    expect(table.textContent).toContain('checkin|packs');
    expect(applyButton().getAttribute('aria-disabled')).not.toBe('true');
  });
});

describe('import dialog: applying', () => {
  it('replaces both tables in one committed edit, closes, announces and moves focus into the first changed table', async () => {
    const store = makeStore();
    const dialog = openDialog(store);
    choose('import-arrivals-csv', file('arrivals.csv', TEMPLATE_ARRIVALS_CSV));
    choose('import-stations-csv', file('stations.csv', TEMPLATE_STATIONS_CSV));
    await within(dialog).findByRole('table', { name: 'Stations preview' });
    fireEvent.click(applyButton());
    expect(store.getState().status).toBe('Imported 1 cohorts and 2 stations from arrivals.csv, stations.csv.');
    expect(store.getState().scenario.revision).toBe(1);
    expect(store.getState().past[0]).toHaveLength(1);
    expect(store.getState().importDialog.open).toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByRole('table', { name: 'Arrivals' }).contains(document.activeElement)).toBe(true);
  });

  it('a stations-only import moves focus into the Stations table and reports 0 cohorts', async () => {
    const store = makeStore();
    const dialog = openDialog(store);
    choose('import-stations-csv', file('stations.csv', TEMPLATE_STATIONS_CSV));
    await within(dialog).findByRole('table', { name: 'Stations preview' });
    fireEvent.click(applyButton());
    expect(store.getState().status).toBe('Imported 0 cohorts and 2 stations from stations.csv.');
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByRole('table', { name: 'Stations' }).contains(document.activeElement)).toBe(true);
  });
});

describe('import dialog: workbooks', () => {
  it('states the sheets read and not read, and the formula cells with the saved-value marker', async () => {
    const dialog = openDialog(makeStore());
    choose('import-workbook', fixture('harbor-hall-extra-sheet.xlsx'));
    await within(dialog).findByText('Sheets read: Arrivals, Stations, Settings. Not read: Attendees.');
    choose('import-workbook', fixture('harbor-hall-formula-saved.xlsx'));
    await within(dialog).findByText('Formula cells: Stations!C3');
    expect(within(dialog).getAllByText('formula (saved value used)').length).toBeGreaterThan(0);
  });

  it('says Not read: none for the plain workbook and refuses a workbook without Stations', async () => {
    const dialog = openDialog(makeStore());
    choose('import-workbook', file('harbor-hall.xlsx', readFileSync('public/examples/harbor-hall/harbor-hall.xlsx')));
    await within(dialog).findByText('Sheets read: Arrivals, Stations, Settings. Not read: none.');
    choose('import-workbook', fixture('harbor-hall-missing-stations.xlsx'));
    await within(dialog).findByText('The workbook has no sheet named "Stations". Sheets found: Arrivals, Settings.');
    expect(within(dialog).queryByRole('table', { name: 'Stations preview' })).toBeNull();
  });

  it('notes that the Settings sheet is absent and the current settings are kept', async () => {
    const { Arrivals, Stations } = harborHallSheets();
    const book = fakeWorkbook([['Arrivals', Arrivals!], ['Stations', Stations!]]);
    const dialog = openDialog(makeStore(), { reader: () => book });
    choose('import-workbook', file('x.xlsx', new Uint8Array([80, 75, 3, 4])));
    await within(dialog).findByText('Settings sheet not present; current settings kept.');
    void sheetRows;
  });
});

describe('template downloads (requirement 1.1)', () => {
  it('offers the three committed files by URL, served as they are', () => {
    renderWith(makeStore(), () => <Templates baseUrl="/" />);
    fireEvent.click(screen.getByRole('button', { name: 'Download templates' }));
    for (const name of ['arrivals.csv', 'stations.csv', 'rehearsal-template.xlsx']) {
      const link = screen.getByRole('link', { name });
      expect(link.getAttribute('href')).toBe(`/examples/${name}`);
      expect(link.getAttribute('download')).toBe(name);
    }
  });
});