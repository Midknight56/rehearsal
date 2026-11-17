# Decisions

Picks made while building without the owner. Each line says what was picked and why.

| Date | Decision | Why |
| --- | --- | --- |
| 2026-11-16 | Local git only, branch `main`, no remote. | The owner's rule: the repo goes public only at submission. |
| 2026-11-16 | The private plan is at `plans/rehearsal-implementation-plan.md` with `plans/review-findings.json`, and `plans/` is in `.git/info/exclude`. | The specs point to that path. The plan revision says to keep `plans/` out of git. |
| 2026-11-16 | The three EXAMPLE rows of `docs/kiro-log.md` are deleted. | The template says to delete them before the first real row. |
| 2026-11-16 | Spec review runs (prompt B) apply the review findings for that spec (prompt R-1 split by spec), instead of one run over all 61 findings. | Smaller runs are easier to check, and each spec is reviewed before its own tasks. |
| 2026-11-16 | Run order across specs: scenario-editor-and-replay 1 to 14, 16, 17; then paired-comparison-and-release 1 to 9; then scenario-editor-and-replay 18 and 19; then paired-comparison-and-release 14 to 16; then scenario-editor-and-replay 20. Last, only if there is time: scenario-editor-and-replay 15 and paired-comparison-and-release 10 to 13. | The spec 2 review added tasks 18 to 20 (Compare screen, JSON open and save, storyboard scripts). 18 and 19 need the comparison code of spec 3, and the Compare screen is the R-C gate ("before and after on one clock"). |
| 2026-11-17 | Task 11, follow-release test: seek the clock to shortly before `doors#0000` exits (756,887 ms) and then play, instead of playing 12 minutes at 16x. If the timeline cannot seek in the test, raise only that test's timeout to 90 s. The assertion stays exact. | Kiro found the test needs about 47 s of real time against a 30 s timeout. Neither choice weakens the check. |
| 2026-11-17 | Task 11, Find attendee count: scope the locator to the Find attendee listbox. | The page-wide count also counted the options of other selects; the check meant the listbox. |
| 2026-11-17 | Task 8, E or X on a blocked cell: one combined reducer action that unblocks and places, so one undo entry. | The requirements define a committed edit as one action with one undo entry. |
| 2026-11-17 | Task 11, renderer-fallback Retry test: after Retry, seek the replay clock to 60,000 ms (past the first arrival at 12,208 ms) and then poll until `spritesDrawn` > 0. The assertion stays. | The test read sprites at about 115 ms, before anyone has arrived; Kiro found no product defect. The test's intent is "Retry draws the trace". |
| 2026-11-17 | Task 13, shared keyboard journey: make the first Space step reduced-motion aware. With reduced motion the results load paused (requirement 9.4), so Space starts playback and the check expects `Pause`; a second Space returns to `Play`. Without reduced motion the journey is unchanged. | Requirement 9.4 is right; the journey was written for normal motion only. Both states are still checked. |
| 2026-11-17 | scenario-editor-and-replay: do task 16 before finishing task 14, then 14, then 17. | Task 14's checkpoint runs the whole e2e suite, which already holds task 16's round-trip tests. Doing 16 first lets 14 check everything with no test skipped. |

## Licence (17 Nov, 9:05 AM)

Pick: MIT, holder Adrian Ferguson (he enters as himself). Why: the rules ask for an open source licence file; MIT is OSI approved, short, and fits every dependency (SheetJS is Apache-2.0). `package.json` gets `"license": "MIT"`. Not picked: Apache-2.0 (longer, adds a NOTICE duty; no gain here).
