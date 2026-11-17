# Decisions

Picks made while building without the owner. Each line says what was picked and why.

| Date | Decision | Why |
| --- | --- | --- |
| 2026-11-16 | Local git only, branch `main`, no remote. | The owner's rule: the repo goes public only at submission. |
| 2026-11-16 | The private plan is at `plans/rehearsal-implementation-plan.md` with `plans/review-findings.json`, and `plans/` is in `.git/info/exclude`. | The specs point to that path. The plan revision says to keep `plans/` out of git. |
| 2026-11-16 | The three EXAMPLE rows of `docs/kiro-log.md` are deleted. | The template says to delete them before the first real row. |
| 2026-11-16 | Spec review runs (prompt B) apply the review findings for that spec (prompt R-1 split by spec), instead of one run over all 61 findings. | Smaller runs are easier to check, and each spec is reviewed before its own tasks. |
| 2026-11-16 | Run order across specs: scenario-editor-and-replay 1 to 14, 16, 17; then paired-comparison-and-release 1 to 9; then scenario-editor-and-replay 18 and 19; then paired-comparison-and-release 14 to 16; then scenario-editor-and-replay 20. Last, only if there is time: scenario-editor-and-replay 15 and paired-comparison-and-release 10 to 13. | The spec 2 review added tasks 18 to 20 (Compare screen, JSON open and save, storyboard scripts). 18 and 19 need the comparison code of spec 3, and the Compare screen is the R-C gate ("before and after on one clock"). |
