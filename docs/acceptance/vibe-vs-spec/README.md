# Spec against vibe: one feature built twice

Date: 2026-11-20. Kiro CLI 3.5.0, model Auto, harness V3, headless. The feature is "share a plan as a link" (`feature-description.txt`). It was on the list of what comes next in the write up.

## How it was run

- Two copies of the repository at the same commit (`ea820c5`), each in its own git worktree with its own `node_modules`. Same steering files in both.
- Both runs got the same description of the feature (`feature-description.txt`) and the same plain rules (no new package, headless browser tests only, `npm run verify` at the end). The loose prompt (`prompt-loose.txt`) is the description and the rules. The spec prompt (`prompt-spec.txt`) adds one paragraph: write a short spec first (`requirements.md`, `design.md`, `tasks.md`), then build task by task with the tests first, tick each task and add a log row.
- Both started at 2:14:22 PM and ran at the same time, beside other Kiro runs on the same account.
- Credits and minutes come from the Kiro session files (`docs/acceptance/session_credits.py` reads the `usage` and `elapsedTime` of each prompt turn), not from the shared pool counter.
- An acceptance check that neither build had seen, `share-link-accept.spec.ts`, was written by Kiro from the feature description and run against both builds afterwards. It has six checks: round trip, an edit survives, a damaged link, a plan too large for a link, no request to another address, and one check that is skipped by design (covered by the damaged link check).

## Result

| | Loose prompt | Short spec |
| --- | --- | --- |
| Minutes | 2.9 (172.6 s) | 8.2 (492.8 s) |
| Credits | 3.49 | 13.10 |
| Files written for the feature | 3 new source files, 3 edited | 5 new source files, 3 edited, 3 spec files |
| Test cases it wrote (counted in its test files) | 9 | 26, including 1 browser test file |
| `npm run verify` at the end | exit 0 | exit 0, 543 UI tests |
| Acceptance check | 5 passed, 1 skipped by design | 5 passed, 1 skipped by design |
| Share link format | `#plan=` and the compressed scenario | `#plan=v1.` and the compressed scenario, so a later format can be told apart |

The acceptance check found no fault in either build. So the measured difference is cost and time (about 3.8 times the credits and 2.8 times the minutes for the spec build) and what was left behind: a spec, 17 more test cases, a browser test and a versioned link format. The loose build also covers a refused clipboard and the decompression limit, as the spec build does.

## What went wrong along the way (facts)

- Two checks of the acceptance file were wrong and were corrected before the final runs of every build: the bundled 5000 attendee file is only 3 KB, so it fits in a link (the "too large" check now builds a plan with a 80 by 80 floor and 3000 blocked cells), and a made-up hash without the `#plan=` format part is not a damaged link (the check now keeps the format part and adds junk). A first version of the new check had a random number loop that never ended; it was fixed and the run repeated. Both builds were run with the final file.
- The spec build tried to run its own browser test while my acceptance runs held ports 4273 and 4274, so that test did not run in its session. It was run afterwards, with the acceptance check, and passed.
- The kept build is the spec build (merged as commit `7af8c24`). The loose build and the three model builds were deleted after this record was written.

## Limits of this comparison

One feature, one run of each, models chosen by Auto (the server picks), other Kiro runs at the same time, and an acceptance check written by Kiro for this purpose. It says nothing about other features or other days.
