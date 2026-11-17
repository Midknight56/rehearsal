# Browser tests

Playwright 1.64.1, Chromium only, headless only. `playwright.config.ts` starts two preview servers and stops them when the
run ends: the test build (`vite build --mode test`, which loads `.env.test` and sets `VITE_REHEARSAL_TEST=1`, read in the
app as `import.meta.env.VITE_REHEARSAL_TEST === '1'`) on port 4173, and a plain production build on port 4174 for
`hook-absent.spec.ts`. Viewport 1,280 x 720 unless a spec sets 1,024 x 640 or 640 x 360. Every test gets a fresh context.

Run `npx playwright install chromium` once on a new machine (done on 2026-11-16 on this PC: Chrome Headless Shell
156.0.8078.4, 118.1 MiB).

## Playwright API used, read from `node_modules/playwright-core/types/types.d.ts` and `node_modules/playwright/types/test.d.ts`

| Need | API |
| --- | --- |
| Reduced-motion emulation | `page.emulateMedia({ reducedMotion: 'reduce' })` (`null`, `'reduce'` or `'no-preference'`), or `test.use({ contextOptions: { reducedMotion: 'reduce' } })` |
| Print-media emulation | `page.emulateMedia({ media: 'print' })` (`null`, `'screen'` or `'print'`) |
| Choosing a file | `locator.setInputFiles(path \| path[])` on the `<input type="file">` |
| Downloads | `page.waitForEvent('download')` returns a `Download` with `suggestedFilename()` and `path()` |
| Device scale factor | `browser.newContext({ deviceScaleFactor: 2 })` |
| Viewport | `page.setViewportSize({ width, height })` |
| Document hidden | `page.evaluate` redefines `document.visibilityState` and `document.hidden` and dispatches `visibilitychange` |
| Servers | `webServer: [{ command, url, reuseExistingServer, timeout }]` |

## Can PixiJS 8.22.0 create a canvas in headless Chromium?

Observed on 2026-11-16 on this PC (Windows, Chrome Headless Shell 156.0.8078.4, default launch flags, no GPU flags):
`canvas.getContext('webgl2')` and `getContext('webgl')` both return a context, and `navigator.gpu` is absent (no WebGPU).
That shows a WebGL context exists. Whether PixiJS itself starts on it is not yet observed; task 10.3 records that, and until
then the canvas cases of tasks 11 and 16 stay unconfirmed. If PixiJS fails to start, those cases record
`not run (no graphics context in headless Chromium)`, the fallback path of requirement 6.8 is still tested, and nothing runs headed.

## Test build hook

`window.__rehearsal` (`loadScenario(json)`, `gameView()`, `forceRendererFailure(boolean)`, `lastResultJson(tabKey)`, and from
task 19 `storage.failNextWrite(name)`) exists only when `VITE_REHEARSAL_TEST` is `1`. `hook-absent.spec.ts` checks the
plain production build.
