import { expect, test } from '@playwright/test';
import { applyImport, importFile, openFair, simulate } from './helpers';

// 9.7 (matrix row 21, preview portion). The deployed-URL check is judge-access.spec.ts.
test('every request during the journey is same-origin under /, /assets/ or /examples/', async ({ page, baseURL }) => {
  const origin = new URL(baseURL as string).origin;
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await openFair(page);
  await importFile(page, 'public/examples/harbor-hall/harbor-hall.xlsx');
  await applyImport(page);
  await simulate(page);
  await page.getByRole('combobox', { name: 'Find attendee' }).fill('doors#0007');
  expect(requests.length).toBeGreaterThan(3);
  for (const url of requests.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:'))) {
    const parsed = new URL(url);
    expect(parsed.origin, url).toBe(origin);
    expect(/^\/(assets\/|examples\/)?/.test(parsed.pathname), url).toBe(true);
    expect(parsed.pathname === '/' || parsed.pathname.startsWith('/assets/') || parsed.pathname.startsWith('/examples/') || parsed.pathname === '/favicon.ico', url).toBe(true);
  }
});
