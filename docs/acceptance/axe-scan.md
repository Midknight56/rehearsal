# Axe scan

This page records an automated accessibility scan of Rehearsal with axe. An automated scan finds only some WCAG failures; this is not a conformance claim. WCAG 2.2 AA stays a target.

The test is `tests/e2e/a11y.spec.ts`. It runs in headless Chromium, loads each state below and runs axe with the tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa`. It fails on any violation with impact `serious` or `critical` and prints the rule id, the impact, the CSS target and the page state. Moderate and minor violations are printed and counted and do not fail the test. No rule is disabled and no element is excluded.

## What the scan covers and what it does not

- The scan reads the DOM and computed styles of the page. The game view draws its people, queues and floor on a canvas, and axe cannot read inside a canvas. The scan covers the DOM around it (the controls, the tables, the labels, the wrapper and its key help), not the picture.
- The landing preview is also a picture (a canvas inside an element with `role="img"`); the same limit applies.
- Axe cannot judge whether a label is meaningful, whether the reading order makes sense, whether keyboard use works, or whether motion is comfortable. Those stay with `tests/e2e/keyboard-journey.spec.ts`, `tests/e2e/reduced-motion.spec.ts` and a person.
- Axe reports some checks as "needs review" instead of pass or fail; those are not counted as violations. The final scan has one `color-contrast` item to review on each of 13 states (every state except the import dialog states, the printable comparison and the two run sheets). It was not examined further here. The colour tokens are checked separately by `tests/ui/styles.test.ts`.
- Each state is scanned once, on one build, in one browser, on one date. The numbers describe that scan.

## States scanned

| # | State | How the test reaches it |
| --- | --- | --- |
| 1 | landing, preview playing | open `/`, wait for the preview result line |
| 2 | landing, saved scenario list open | save the baseline, reload, `Open a saved scenario` |
| 3 | landing, reduced motion on | browser context with reduced motion, open `/` |
| 4 | plan, baseline loaded | `Try the community fair` |
| 5 | plan, after Simulate with game view and result tables | `Simulate`, wait for `Run complete` |
| 6 | plan, floor plan with a station selected | `Inspect packs` |
| 7 | plan, game view with an attendee selected | `Simulate`, then `Find attendee` doors#0007 |
| 8 | plan, status region with a message | `Save`, the status region reads `Saved` |
| 9 | plan, Motion toggle set to System | `Motion` = System |
| 10 | plan, Motion toggle set to Reduce | `Motion` = Reduce |
| 11 | plan, Motion toggle set to Allow | `Motion` = Allow |
| 12 | import dialog, picking step | `Import`, no file chosen |
| 13 | import dialog, preview step with a workbook | `harbor-hall.xlsx` from `public/examples/harbor-hall` |
| 14 | import dialog, preview step with CSV files | `public/examples/stations.csv` |
| 15 | import dialog, failed import with the error list | `arrivals-invalid-route.csv` from `tests/imports/fixtures` |
| 16 | compare, before a comparison | `Compare` |
| 17 | compare, after a comparison | pick baseline and candidate, `Run comparison` |
| 18 | printable comparison document | `Open printable comparison` (a new page, scanned as a page) |
| 19 | run sheet screen | `Print run sheet` |
| 20 | run sheet document opened from Compare | `Open run sheet` (a new page, scanned as a page) |

The Game view tab is a section of the Plan screen, so states 5 and 7 are the game view. There is no other screen: `src/app.tsx` renders the landing, the Plan screen, the Compare screen and the run sheet screen.

## First measured result (before any fix)

Run on 2026-11-20 with `@axe-core/playwright` 4.14.0, `axe-core` 4.14.1 and Chromium 156.0.8078.4 (the Playwright 1.64.1 build), headless, on the build before any change to `src/`. Counts are violations (rules with at least one failing element), not elements.

| # | State | Critical | Serious | Moderate | Minor | Rule ids |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | landing, preview playing | 0 | 0 | 0 | 0 | none |
| 2 | landing, saved scenario list open | 0 | 0 | 0 | 0 | none |
| 3 | landing, reduced motion on | 0 | 0 | 0 | 0 | none |
| 4 | plan, baseline loaded | 0 | 1 | 0 | 0 | color-contrast |
| 5 | plan, after Simulate with game view and result tables | 0 | 0 | 0 | 0 | none |
| 6 | plan, floor plan with a station selected | 0 | 0 | 0 | 0 | none |
| 7 | plan, game view with an attendee selected | 0 | 0 | 0 | 0 | none |
| 8 | plan, status region with a message | 0 | 0 | 0 | 0 | none |
| 9 | plan, Motion toggle set to System | 0 | 0 | 0 | 0 | none |
| 10 | plan, Motion toggle set to Reduce | 0 | 0 | 0 | 0 | none |
| 11 | plan, Motion toggle set to Allow | 0 | 0 | 0 | 0 | none |
| 12 | import dialog, picking step | 0 | 0 | 0 | 0 | none |
| 13 | import dialog, preview step with a workbook | 0 | 0 | 0 | 0 | none |
| 14 | import dialog, preview step with CSV files | 0 | 0 | 0 | 0 | none |
| 15 | import dialog, failed import with the error list | 0 | 0 | 0 | 0 | none |
| 16 | compare, before a comparison | 0 | 2 | 0 | 0 | color-contrast, label-content-name-mismatch |
| 17 | compare, after a comparison | 0 | 1 | 0 | 0 | label-content-name-mismatch |
| 18 | printable comparison document | 0 | 0 | 0 | 0 | none |
| 19 | run sheet screen | 0 | 0 | 0 | 0 | none |
| 20 | run sheet document opened from Compare | 0 | 0 | 0 | 0 | none |

Three of the 20 states failed the test on the first run.

## What the first run found, and what was done

- `label-content-name-mismatch` (states 16 and 17, WCAG 2.5.3 Label in Name). The pick buttons on the Compare screen showed `Use as baseline` or `Use as candidate` but their accessible names were `Baseline: <title>` and `Candidate: <title>`, which do not contain the visible text. Fix in `src/ui/compare/PickScenarios.tsx`: the accessible name now starts with the visible text, `Use as baseline: <title>` or `Baseline: <title>` once chosen, and the same for the candidate. This is a label change. The only test that read the old names was the keyboard journey helper `tests/e2e/journey.ts`, which looked for `Baseline: <title>` and `Candidate: <title>` before the buttons were chosen; it now looks for `Use as baseline: <title>` and `Use as candidate: <title>`. `tests/e2e/keyboard-journey.spec.ts` passed after the change (25 passed together with the scan).
- `color-contrast` (states 4 and 16). The failing elements were table headers and muted text on screens that had just opened. Every screen fades in over 150 ms (`animation: screen-in` on `main` in `src/ui/styles/app.css`), and the first run scanned while the fade was still running, so axe measured text that was half transparent. The same elements passed in state 5 and in the second run. No colour and no token was changed. The scan now waits for finite animations to end before it runs (`settle` in `tests/e2e/a11y.spec.ts`); a screen that is half faded is not a state a person stays on. This is a change to the test's timing, not to which rules run, and a real contrast failure still fails the test. `tests/ui/styles.test.ts` passes unchanged.
- Nothing is excluded from any scan and no rule is disabled.

## Final result

Run on 2026-11-20 with `@axe-core/playwright` 4.14.0, `axe-core` 4.14.1 and Chromium 156.0.8078.4 (Playwright 1.64.1), headless, on the build with the fix above. Command: `npx playwright test tests/e2e/a11y.spec.ts`; 20 passed.

| # | State | Critical | Serious | Moderate | Minor | Rule ids | Needs review |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | landing, preview playing | 0 | 0 | 0 | 0 | none | 1 (color-contrast) |
| 2 | landing, saved scenario list open | 0 | 0 | 0 | 0 | none | 1 (color-contrast) |
| 3 | landing, reduced motion on | 0 | 0 | 0 | 0 | none | 1 (color-contrast) |
| 4 | plan, baseline loaded | 0 | 0 | 0 | 0 | none | 1 (color-contrast) |
| 5 | plan, after Simulate with game view and result tables | 0 | 0 | 0 | 0 | none | 1 (color-contrast) |
| 6 | plan, floor plan with a station selected | 0 | 0 | 0 | 0 | none | 1 (color-contrast) |
| 7 | plan, game view with an attendee selected | 0 | 0 | 0 | 0 | none | 1 (color-contrast) |
| 8 | plan, status region with a message | 0 | 0 | 0 | 0 | none | 1 (color-contrast) |
| 9 | plan, Motion toggle set to System | 0 | 0 | 0 | 0 | none | 1 (color-contrast) |
| 10 | plan, Motion toggle set to Reduce | 0 | 0 | 0 | 0 | none | 1 (color-contrast) |
| 11 | plan, Motion toggle set to Allow | 0 | 0 | 0 | 0 | none | 1 (color-contrast) |
| 12 | import dialog, picking step | 0 | 0 | 0 | 0 | none | 0 |
| 13 | import dialog, preview step with a workbook | 0 | 0 | 0 | 0 | none | 0 |
| 14 | import dialog, preview step with CSV files | 0 | 0 | 0 | 0 | none | 0 |
| 15 | import dialog, failed import with the error list | 0 | 0 | 0 | 0 | none | 0 |
| 16 | compare, before a comparison | 0 | 0 | 0 | 0 | none | 1 (color-contrast) |
| 17 | compare, after a comparison | 0 | 0 | 0 | 0 | none | 1 (color-contrast) |
| 18 | printable comparison document | 0 | 0 | 0 | 0 | none | 0 |
| 19 | run sheet screen | 0 | 0 | 0 | 0 | none | 0 |
| 20 | run sheet document opened from Compare | 0 | 0 | 0 | 0 | none | 0 |

Totals over the 20 states: critical 0, serious 0, moderate 0, minor 0.

An automated scan finds only some WCAG failures; this is not a conformance claim. The scan does not read inside the canvas of the game view, does not test keyboard use, reading order or motion, and was run once on one build in one browser. The product was not tested with users.
