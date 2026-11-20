# Axe scan: requirements

Rehearsal runs the axe accessibility engine over every screen and state a person can reach, and a test fails on any serious or critical violation. The result stands beside the README sentence that WCAG 2.2 AA is a target and conformance is not claimed. An automated scan covers only part of WCAG; every document that quotes the result says so.

## 1. The scan tool
User story: as the owner, I want a pinned scan tool, so that the result can be repeated.

1. THE SYSTEM SHALL add `@axe-core/playwright` as a dev dependency at exactly 4.14.0 and add no other package.
2. THE SYSTEM SHALL record the `axe-core` version that it resolved in the log row of task 1 and in `docs/acceptance/axe-scan.md`.
3. THE SYSTEM SHALL run axe in headless Chromium only, with the tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa`.

## 2. Every reachable screen and state is scanned
User story: as a judge, I want no screen left out, so that "scanned" means the whole app.

1. THE SYSTEM SHALL scan each of these states in `tests/e2e/a11y.spec.ts`: the landing with the preview playing; the landing with reduced motion on; the landing with the saved scenario list open; the Plan screen with the baseline loaded; the Plan screen after Simulate with the game view and a result table; the import dialog at the picking step and at the preview step; the import dialog with a failed import and its error list; the floor plan with a station selected; the game view with an attendee selected; the Compare screen before and after a comparison; the printable comparison; the run sheet (the Run sheet screen and the generated run sheet document); the status region with a message; the Motion toggle set to System, Reduce and Allow.
2. THE SYSTEM SHALL name every scanned state in a table in `docs/acceptance/axe-scan.md`.
3. THE SYSTEM SHALL state in that document that axe cannot read inside the canvas of the game view, so the scan covers the DOM around it.

## 3. The test fails on serious and critical violations
User story: as a maintainer, I want a failing test when a serious or critical violation appears, so that it cannot return unseen.

1. WHEN a scan reports a violation with impact `serious` or `critical`, THE SYSTEM SHALL fail the test and print the rule id, the impact, the CSS target and the page state.
2. THE SYSTEM SHALL print and count `moderate` and `minor` violations, and SHALL NOT fail on them.
3. THE SYSTEM SHALL NOT disable a rule or exclude an element, unless it is a third party widget that cannot be changed; any exclusion is named with its reason in the document.

## 4. What the scan finds is fixed
User story: as a person using a keyboard or a screen reader, I want the violations fixed, so that the app works for me.

1. THE SYSTEM SHALL record the first measured result, before any fix, per state: the count of violations by impact and the rule ids.
2. THE SYSTEM SHALL fix each finding with the smallest change in `src/` and `src/ui/styles/`, keep the blackboard look and the tokens of `tokens.css`, and keep `tests/ui/styles.test.ts` passing.
3. THE SYSTEM SHALL NOT change a model number or an engine file, and SHALL NOT change a label that a current test checks unless the label is the violation; then it updates that test and the document says so.
4. THE SYSTEM SHALL NOT weaken a test to make it pass.

## 5. The result is recorded and limited
User story: as a reader of the write up, I want the number and its limits together, so that nobody reads more into it than is there.

1. THE SYSTEM SHALL record the final result in `docs/acceptance/axe-scan.md`: per state, counts by impact, the axe-core version, the date and the browser version.
2. THE SYSTEM SHALL carry the sentence `An automated scan finds only some WCAG failures; this is not a conformance claim.`
3. THE SYSTEM SHALL NOT edit `README.md`; the lead writes the line under "Status of claims".
