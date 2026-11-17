# Acceptance record: scenario-editor-and-replay (first part)

This is Kiro's own record of its own work (Kiro CLI 3.3.0, model auto), written on 2026-11-17 for task 14. It is not an independent review. Each line names the matrix row, the test file and the line the runner printed when that file was run alone on this working tree (headless Chromium on this Windows PC for Playwright). The model's results are scenario results, not a forecast; the Harbor Hall numbers are fictional and illustrative. Nothing here is a claim of keyboard, screen-reader, reduced-motion or WCAG conformance: those stay targets until the reviewer repeats the journey by hand.

- Row 13 (rejected imports, field messages, no partial replacement): `tests/e2e/import.spec.ts`, `12 passed (15.3s)`.
- Row 14 (workbook against the CSV pair, formula cells, missing sheet, extra sheet): `tests/e2e/import.spec.ts`, `12 passed (15.3s)`; sheet isolation in `tests/imports/xlsx.test.ts`, run with `tests/ui/replay-boundary.test.ts`: `Test Files  2 passed (2)`, `Tests  27 passed (27)`.
- Row 15 (drag, type, nudge, delete a routed station): `tests/e2e/editor.spec.ts`, `12 passed (12.5s)`. Screenshot: `docs/acceptance/img/drag-packs.png`.
- Row 16 (blocked route, results labelled stale): `tests/e2e/blocked-route.spec.ts`, `1 passed (9.7s)`. Screenshot: `docs/acceptance/img/blocked-route.png`.
- Row 17 (stale label, cancel, late result discarded): `tests/e2e/run-controls.spec.ts`, `4 passed (9.8s)`.
- Row 18 (save with an injected quota failure): not run. The save failure block and `storage.failNextWrite` belong to task 19, which has not been done.
- Row 19 (reduced motion): `tests/e2e/reduced-motion.spec.ts`, `3 passed (10.1s)`. Screenshot: `docs/acceptance/img/reduced-motion-order.png`.
- Row 20 (keyboard only): `tests/e2e/keyboard-journey.spec.ts`, `5 passed (15.8s)`. The journey ends at the replay: compare and export are not built, so the row is only partly covered.
- Row 21 (anonymous session, network inspection): `tests/e2e/network.spec.ts`, `1 passed (8.5s)`, against the local test server only. Not run on a deployed URL, so the longer privacy sentence stays unwritten.
- Row 22 (1,200 attendees in view): `tests/e2e/replay.spec.ts`, `9 passed (16.7s)`. Screenshot: `docs/acceptance/img/sprite-cap.png`.

Whole suite on the branch: `npm run verify` exit 0; `npm run test:e2e` 67 passed (63 before the four screenshot cases of `tests/e2e/acceptance-shots.spec.ts` were added).

## Round trip and labels (task 16)

- Round trip (requirement 8.5, replay half): `tests/e2e/round-trip.spec.ts`, `3 passed` (headless Chromium, this PC). `harbor-hall.xlsx` imported into the baseline, simulated, the timeline of `doors#0000` opened: the imported servers and cells, the floor plan labels `5 m · 4.2 s`, `12 m · 10.0 s`, `21 m · 17.5 s`, one `Scenario hash` in the assumptions panel and the Game view heading (first 8 hex), and `Walked to Check-in desk (00:04.167)`; the shorter-route tab with `5 m · 4.2 s`, `4 m · 3.3 s`, `9 m · 7.5 s`. The round trip ends at the replay: task 15 is not built, so no print or run sheet part exists and none is claimed.
- Labels screenshot: `docs/acceptance/img/labels.png` (the Game view heading with `Replay of replication 0, one example run`, `Follow` activated, and the landing pitch line, two captures stacked on one page). The test asserts `aria-pressed="true"`; the image itself shows no distinct pressed colour on `Follow`.
- Landing sentence: `Everything runs in this browser.` is unchanged in `src/ui/landing/Landing.tsx`; the longer sentence with `nothing uploaded` appears nowhere in `src/` and waits for row 21 on the deployed URL.