# Axe scan: tasks

- [x] 0. Spec: requirements.md, design.md, tasks.md.
- [x] 1. Add `@axe-core/playwright` 4.14.0 exactly; note the resolved `axe-core` version. (Requirement 1)
- [x] 2. Tests first: `tests/e2e/a11y.spec.ts` over every state; run it and record the first measured result in `docs/acceptance/axe-scan.md`. (Requirements 2, 3, 4.1)
- [x] 3. Fix every serious and critical violation with the smallest change; the spec passes; the touched unit tests pass. (Requirement 4)
- [x] 4. Record the final result and the limits in `docs/acceptance/axe-scan.md`; `npm run verify` exits 0. (Requirement 5)
