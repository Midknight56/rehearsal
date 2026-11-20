# Landing preview: tasks

- [x] 0. Spec: requirements.md, design.md, tasks.md.
- [x] 1. Tests first: `tests/ui/landing-preview.test.tsx` and `tests/e2e/landing-preview.spec.ts`; run them and see them fail for the right reason. (Requirements 1 to 5)
- [x] 2. `previewHeadline.ts` and its tests pass. (Requirement 2)
- [x] 3. `LandingPreview.tsx`, the `Landing` prop and the `App` wiring; the unit tests pass and the existing landing tests still pass. (Requirements 1, 3, 4)
- [x] 4. CSS in `app.css`; the e2e spec passes (first moving frame, reduced motion, headline, layout at 360 by 640 and 1920 by 1080). (Requirements 1, 5)
- [x] 5. Two captures, looked at and fixed; `docs/acceptance/landing-preview.md`. (Requirement 5)
- [x] 6. `npm run verify` and `npm run test:e2e` exit 0.
- [x] 7. Requirement 6: tests first (`tests/ui/landing-preview.test.tsx`, `tests/e2e/landing-preview.spec.ts`), seen failing; then `LandingPreview.tsx` (seek 04:00, 4x, loop at 16:00, real clock and speed text); both captures retaken and looked at; `docs/acceptance/landing-preview.md`; the four named e2e specs and `npm run verify` pass. (Requirement 6)
