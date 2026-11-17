import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { openFair } from './helpers';

// The `run-sheet.spec.ts` row of the Playwright journeys table (paired-comparison-and-release design). It measures the
// generator's HTML document (matrix row 28); print.spec.ts measures the React run sheet. The page count of each PDF is read
// from the page objects of the file (`/Type /Page`, not `/Type /Pages`).
const TABS = [
  { key: 'baseline', texts: ['38.0 m per attendee', '4.167 s', '10.000 s', '17.500 s', '31.667 s', 'Staff-hours: 2.00 h'] },
  { key: 'plus-one-checkin', texts: ['38.0 m per attendee', '4.167 s', '10.000 s', '17.500 s', 'Staff-hours: 2.67 h'] },
  { key: 'shorter-route', texts: ['18.0 m per attendee', '4.167 s', '3.334 s', '7.500 s', '15.001 s', 'Staff-hours: 2.00 h'] },
] as const;

for (const tab of TABS) {
  test(`open-run-sheet for ${tab.key}: the numbers, one page under print media and a Letter and an A4 PDF`, async ({ page, context }) => {
    await openFair(page);
    await page.getByTestId(`scenario-tab-${tab.key}`).click();
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Back to plan' })).toBeVisible();
    const [sheet] = await Promise.all([context.waitForEvent('page'), page.getByTestId('open-run-sheet').click()]);
    await sheet.waitForLoadState();
    for (const text of tab.texts) await expect(sheet.locator('body')).toContainText(text);

    // The root's scrollHeight is never below the viewport height, so the viewport is shorter than the sheet to read its content height.
    await sheet.setViewportSize({ width: 704, height: 400 });
    await sheet.emulateMedia({ media: 'print' });
    const height = await sheet.evaluate(() => document.documentElement.scrollHeight);
    console.log(`run-sheet.spec scrollHeight ${tab.key}: ${height} px (generator document, print media, 704 px wide)`);
    expect(height).toBeLessThanOrEqual(960);

    mkdirSync('docs/acceptance/img', { recursive: true });
    for (const format of ['Letter', 'A4'] as const) {
      const pdf = await sheet.pdf({ format });
      const file = `docs/acceptance/img/run-sheet-${tab.key}-${format}.pdf`;
      writeFileSync(file, pdf);
      const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      console.log(`run-sheet.spec pages ${file}: ${pages}`);
      expect(pages, file).toBe(1);
    }
    await sheet.close();
  });
}