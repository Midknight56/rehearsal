# Model test: the same spec task on four models

Date: 2026-11-20. Kiro CLI 3.5.0, harness V3, headless. The task is the "short spec" prompt of `docs/acceptance/vibe-vs-spec/` (`prompt-spec.txt`): build "share a plan as a link" from a short spec, tests first. The first row is the build that was kept; the other three ran after it, each on a named model, each in its own copy of the repository at the same commit (`ea820c5`), all three started at 2:34:16 PM and ran at the same time beside other Kiro runs.

The models and the credit weights are from `kiro-cli chat --list-models` on the same day: auto 1.00x, claude-haiku-5.5 0.06x, claude-sonnet-5.5 1.30x, gpt-5.6-terra 2.20x.

Credits and minutes come from the Kiro session files (`docs/acceptance/session_credits.py`), one session per build.

| Model | Minutes | Credits | Test cases it wrote | New and edited source files | `npm run verify` | Acceptance check (5 checks) |
| --- | --- | --- | --- | --- | --- | --- |
| auto (kept) | 8.2 | 13.10 | 26 | 5 new, 3 edited | exit 0, 543 UI tests | 5 passed |
| claude-haiku-5.5 | 20.9 | 11.95 | 41 | 5 new, 3 edited | exit 0, 553 UI tests | 5 passed |
| claude-sonnet-5.5 | 14.1 | 26.28 | 51 | 5 new, 3 edited | exit 0, 561 UI tests | 5 passed |
| gpt-5.6-terra | 7.5 | 32.29 | 9 | 2 new, 4 edited | exit 0, 525 UI tests | 2 passed, 3 failed |

## What the one failing build did

The terra build opens a share link into the same review dialog as `Open JSON` ("Review the scenario file", with `Open` and `Cancel`) every time, and the plan opens only after `Open` is pressed. The feature text said the plan should load "as if it had been opened from a JSON file, with the usual dialog or message for a plan that has warnings". The acceptance check reads that as: no warnings, no dialog. So the round trip check, the edit check and the no other address check fail on it at the step where they wait for the Plan screen. The damaged link check and the too large check pass. The build is a valid reading of an unclear sentence; the check is the stricter one. The other three builds, and the kept one, open the plan at once when there are no warnings.

## What this does and does not show

- All four builds passed `npm run verify`. Three of four passed the acceptance check.
- Credits did not follow the weights in the model list: the cheapest weight (haiku) used 11.95 credits, about the same as auto at 13.10, and took 2.5 times as long. The most expensive weight (terra) used the most credits and was the fastest, and it wrote the fewest tests.
- One run per model, one task, other Kiro runs on the same account at the same time. It is a measurement of this task on this day, not a ranking of the models.
- The acceptance check is the one in `docs/acceptance/vibe-vs-spec/`. It was corrected twice before these runs (see that page).
- The kept build is the auto build. It was chosen and merged before the acceptance check had run on the terra build, because it passed every check, had its own browser test and cost 13.10 credits; the haiku and sonnet builds had already passed the check, and terra's result did not change the choice. The three model builds were deleted after this record was written.
