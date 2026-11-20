# Share link: tasks

Each task: write its tests, run them, see them fail for the right reason, then write the code and see them pass. Run only the tests of the task.

- [x] 0. Spec: requirements.md, design.md, tasks.md.
- [x] 1. The codec. Tests first: `tests/imports/share-link.test.ts`. Then `src/exports/share-link.ts` and `src/imports/shareLink.ts`. (Requirements 1.3, 1.4, 2.1, 3.1 to 3.3)
- [x] 2. The copy button. Tests first: `tests/ui/share-link-copy.test.tsx`. Then `ShareLinkButton.tsx` and its place in `PlanScreen.tsx`. (Requirement 1)
- [x] 3. Opening a link. Tests first: `tests/ui/share-link-open.test.tsx`. Then `ReviewDialog.tsx` (extracted from `OpenJson.tsx`, whose tests still pass), `ShareLinkOpener.tsx` and the `App` wiring. (Requirements 2, 3, 4)
- [ ] 4. Browser check. `tests/e2e/share-link.spec.ts` in headless Chromium only: round trip, same origin requests, damaged link. Run that one file. Not ticked: written, but it could not run because ports 4273 and 4274 are held by another checkout's preview servers (see the log row).
- [x] 5. `npm run verify` exits 0.
