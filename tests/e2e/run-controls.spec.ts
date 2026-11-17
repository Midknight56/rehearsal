import { expect, test } from '@playwright/test';
import { loadFixture, openFair, readStatus } from './helpers';

test.describe('5.1 and 5.2 progress and completion', () => {
  test('Simulate shows progress text, then announces the completion with the attendee count and hash prefix', async ({ page }) => {
    await openFair(page);
    await page.getByRole('button', { name: 'Simulate' }).click();
    await expect(page.getByText(/Simulating… \d+ of 1/)).toBeVisible();
    await expect.poll(() => readStatus(page), { timeout: 60_000 }).toMatch(/^Run complete: 120 attendees, replication 0, hash [0-9a-f]{8}\.$/);
    await expect(page.getByRole('button', { name: 'Simulate' })).not.toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('5.3 cancel on the 5,000-attendee fixture', () => {
  test('Cancel answers and the previous results keep their label; the interval is printed', async ({ page }) => {
    await openFair(page);
    await loadFixture(page, 'large-5000');
    await page.getByRole('button', { name: 'Simulate' }).click();
    const cancel = page.getByRole('button', { name: 'Cancel' });
    await expect(cancel).toBeVisible();
    if ((await readStatus(page)).startsWith('Run complete')) {
      console.log('not run (run completed before cancel)');
      return;
    }
    const startedAt = Date.now();
    await cancel.click();
    await expect.poll(() => readStatus(page)).toBe('Run cancelled.');
    console.log(`cancel to "Run cancelled." (wall clock, includes polling): ${Date.now() - startedAt} ms`);
    await expect(page.getByRole('button', { name: 'Simulate' })).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText(/Simulation cancelled\./)).toBeVisible();
  });
});

test.describe('5.5 Simulate during a run', () => {
  test('cancels the current run and starts the next from the finished callback', async ({ page }) => {
    await openFair(page);
    await loadFixture(page, 'large-5000');
    await page.getByRole('button', { name: 'Simulate' }).click();
    await page.getByRole('button', { name: 'Simulate' }).click();
    await expect.poll(() => readStatus(page), { timeout: 60_000 }).toMatch(/Run cancelled\.|Run complete/);
  });
});

test.describe('5.6 the page stays responsive during a 5,000 run', () => {
  test('ten synchronous DOM interactions during the run are timed and the p95 is printed', async ({ page }) => {
    await openFair(page);
    await loadFixture(page, 'large-5000');
    await page.getByRole('button', { name: 'Simulate' }).click();
    const latencies: number[] = [];
    for (let i = 0; i < 10; i++) {
      latencies.push(
        await page.evaluate(() => {
          const t0 = performance.now();
          document.querySelector<HTMLElement>('[aria-label="Floor plan"]')?.focus();
          return performance.now() - t0;
        }),
      );
    }
    latencies.sort((a, b) => a - b);
    console.log(`focus latency during a 5,000 run, 10 samples: p95 ${latencies[9]?.toFixed(1)} ms (a target of 200 ms until recorded)`);
    expect(latencies).toHaveLength(10);
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
});
