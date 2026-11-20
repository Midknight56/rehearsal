import { expect, test } from '@playwright/test';
import { openFair } from './helpers';

// Spec share-link, task 4. Headless Chromium only. Round trip through the clipboard, requests while a link opens, a damaged link.
test.describe('share link', () => {
  test('Copy share link, then the link opens the same plan on the Plan screen with no request to another address', async ({ browser, baseURL }) => {
    const origin = new URL(baseURL as string).origin;
    const sender = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1280, height: 720 } });
    const page = await sender.newPage();
    await openFair(page);
    await page.getByRole('button', { name: 'Copy share link' }).click();
    await expect(page.getByRole('status')).toHaveText('Share link copied');
    await expect(page.getByRole('button', { name: 'Copy share link' })).toBeFocused();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link.startsWith(`${origin}/#plan=v1.`)).toBe(true);
    expect(link.length).toBeLessThanOrEqual(6000);
    console.log(`share link length in the browser: ${link.length} characters`);
    await sender.close();

    const receiver = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const opened = await receiver.newPage();
    const requests: string[] = [];
    const errors: string[] = [];
    opened.on('request', (r) => requests.push(r.url()));
    opened.on('pageerror', (e) => errors.push(e.message));
    await opened.goto(link);
    await expect(opened.getByRole('heading', { name: 'Harbor Hall Community Fair: baseline' })).toBeVisible();
    await expect(opened.getByRole('status')).toHaveText('Opened "Harbor Hall Community Fair: baseline".');
    expect(new URL(opened.url()).hash).toBe('');
    expect(requests.length).toBeGreaterThan(0);
    for (const url of requests.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:'))) {
      const parsed = new URL(url);
      expect(parsed.origin, url).toBe(origin);
      expect(parsed.pathname === '/' || parsed.pathname.startsWith('/assets/') || parsed.pathname.startsWith('/examples/') || parsed.pathname === '/favicon.ico', url).toBe(true);
    }
    expect(errors).toEqual([]);
    await receiver.close();
  });

  test('a damaged link leaves the landing screen in place and says why', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/#plan=v1.AAAA');
    await expect(page.getByRole('heading', { level: 1, name: 'Rehearsal' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('This share link is damaged, so no plan was opened. Ask for a new link, or open a JSON file.');
    await expect(page.getByTestId('try-community-fair')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
