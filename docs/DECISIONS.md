# Decisions

Picks made while building without the owner. Each line says what was picked and why.

| Date | Decision | Why |
| --- | --- | --- |
| 2026-11-16 | Local git only, branch `main`, no remote. | The owner's rule: the repo goes public only at submission. |
| 2026-11-16 | The private plan is at `plans/rehearsal-implementation-plan.md` with `plans/review-findings.json`, and `plans/` is in `.git/info/exclude`. | The specs point to that path. The plan revision says to keep `plans/` out of git. |
| 2026-11-16 | The three EXAMPLE rows of `docs/kiro-log.md` are deleted. | The template says to delete them before the first real row. |
| 2026-11-16 | Spec review runs (prompt B) apply the review findings for that spec (prompt R-1 split by spec), instead of one run over all 61 findings. | Smaller runs are easier to check, and each spec is reviewed before its own tasks. |
