# Axe scan: design

## Scan helper
`tests/e2e/a11y.spec.ts` holds one `scan(page, state)` function. It runs `new AxeBuilder({ page }).withTags([...]).analyze()` with the five tags, no `disableRules`, no `exclude`. Before it runs, it waits for finite animations to end (the screens fade in over 150 ms, and axe would read half transparent colours). It sorts the violations into impact buckets and prints one line per state: `a11y <state>: critical 0, serious 0, moderate 0, minor 0, needs review 0 [rule ids]`. For each violation it prints the rule id, impact, every CSS target and the state.

## One test per state
Each state is its own `test`, so one failing state does not hide another. A test collects the serious and critical violations of its scan and fails with `expect(blocking, message).toEqual([])`, where the message lists them. Moderate and minor ones only print. `scan` also appends one JSON line per state to a file when the environment variable `A11Y_REPORT` names a path, so a measured result can be copied into the document without retyping it; the test writes nothing without it, and the file is deleted by the person before a run.

## Reaching the states
The helpers in `tests/e2e/helpers.ts` (`openFair`, `importFile`, `simulate`) open the Plan screen and run a result. The landing states use `/` with the preview given time to show its first frame. Reduced motion uses a `reducedMotion: 'reduce'` context. The saved list needs one saved scenario, made with `Save` and a reload. The import states use the bundled `public/examples/arrivals.csv`, `stations.csv` and `rehearsal-template.xlsx`, and a CSV from `tests/imports/fixtures` for the failed import. An attendee is selected with `Find attendee`; a station with `Inspect`. Compare uses the pick buttons and `Run comparison`. The printable comparison and the generated run sheet open in a new page; the scan runs on that page. The status region state triggers a message with `Save`.

## Fixes
Each rule gets the smallest change: an accessible name where one is missing, a landmark or heading fix, a colour value moved within the blackboard palette. Contrast fixes change a token only with the recomputed ratios in the log row, and `tests/ui/styles.test.ts` must still pass. Elements are fixed, not excluded.

## Limits
Axe checks part of WCAG by reading the DOM and computed styles. It cannot read inside the canvas of the game view, cannot judge whether a label is meaningful, and cannot test keyboard order or motion. The result is a measured count on one build, one browser and one date.
