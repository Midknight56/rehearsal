# Rehearsal hooks

Two standalone hook files in the `kiro/FORMAT.md` shape, kept in `.kiro/hooks/` of the Rehearsal repository. Kiro does all the work in this repository (revision of 16 November 2026) and keeps these files and this README current. Command actions only: an agent action injects a prompt and costs credits. Whether a command hook costs credits is *verify*: read the Kiro usage display before and after the observation run and log the measured difference, never an assumed `none`. The hooks implement sections 11.2 and 11.3 of `plans/rehearsal-implementation-plan.md` (revision 2, 2026-11-03) and verification-matrix row 31. Browser journeys (`npm run test:e2e`) are not hooked: they are run before a UI task is declared done.

Every hook file carries `version`, `hooks`, `name`, `trigger`, `matcher`, `action` and `timeout`.

| File | Entry: fires on | Matcher | Command | Timeout | When observed |
| --- | --- | --- | --- | --- | --- |
| `verify-on-stop.json` | `verify-on-stop`: trigger `Stop` (agent stop) | `.*` (a stop has no path; the field is present because every hook file has one, *verify* that the IDE accepts it) | `npm run verify` = `typecheck` + `test:model` (Vitest over `tests/model` and `tests/comparison`) + `build` | 600 | later, in the Kiro IDE |
| `model-tests-on-save.json` | `model-tests-on-save`: trigger `PostFileSave` (file save) | `^src/(simulation\|spatial)/` (any file under `src/simulation/` or `src/spatial/`) | `npm run test:model` | 300 | later, in the Kiro IDE |

When `scenario-editor-and-replay` task 1 adds the `test:ui` script, `npm run verify` also runs it (a refinement to record in plan section 4 and section 13); the 600 s timeout is meant to cover it.

The stop hook has been seen firing in Kiro CLI 3.x runs started with `--trust-workspace`, its output reaching Kiro; the save hook is observed in the Kiro IDE. Neither is cited anywhere until a `Setup: hook observation (matrix row 31)` row in `docs/kiro-log.md` quotes its output, and no task in any spec depends on a hook firing: each task's own `Verify:` line is its acceptance.

Name note. Plan section 11.2 lists `typecheck-on-save.json` (matcher `^src/.*\.tsx?$`, `npm run typecheck`, 120 s). This repository ships `model-tests-on-save.json`, scoped to the two engine folders, in its place: the stop hook already typechecks everything through `npm run verify`, and a save under `src/simulation/` or `src/spatial/` is what can break a hand-calculated fixture. Plan section 11.2 also lists `model-rules.md`, `ownership.md` and `ui-rules.md`; the steering files shipped here are `claims-policy.md`, `units-and-determinism.md`, `model-limits.md`, `accessibility.md` and `revision-2026-11-16.md`, all `inclusion: always`. `ownership.md` is not shipped: plan section 10 is the ownership text, and the revision of 16 November 2026 replaces its agent roles. Do not add a typecheck save hook beside the shipped one unless both were observed and the save-time cost of running both was measured and logged.

Package manager note. The plan fixes npm with a committed `package-lock.json` (sections 4 and 16), so both commands are `npm run …`; the `kiro/FORMAT.md` example and the other entries' `pnpm verify` do not apply here. If task 0 of `simulation-contract` ever changes the package manager, change the two command strings in both files before the observation run and log the change.

## Fields marked *verify*

The shape was checked against Kiro documentation summaries dated November 3, 2026, not against the installed Kiro IDE. JSON carries no comments, so the marks live here. Confirm each item in the IDE, write the observed value into the file, and record it in `docs/kiro-log.md`:

- `trigger` values `Stop` and `PostFileSave` are correct for the current Kiro IDE and CLI (revision of 16 November 2026) and are not guessed again. No other trigger (spec lifecycle, pre-tool, prompt submit) is used by this package.
- `version: "v1"`: *verify* the schema version string. It is a hook-file format tag, not a product version.
- `matcher`: *verify* whether it is a regular expression (as in the `kiro/FORMAT.md` example) or a glob, and whether it is matched against a workspace-relative path (the pattern assumes it). The glob forms of the same rule are `src/simulation/**` and `src/spatial/**`; if the IDE takes one glob per entry, split the file into two entries with the same command.
- `timeout`: *verify* that the field exists and that its unit is seconds.
- `action.type: "command"` and `action.command`: *verify* the field names, and that the command runs from the root of the checkout the session is open in (where `package.json` is).
- Whether the Kiro IDE reads standalone `.kiro/hooks/*.json` files at all, or only hooks created in its own panel: *verify*. If it reads only its own panel, log that and cite no hook.

## Observation before citation

A hook is cited in the repository `README.md`, the write-up, the video, the blog post or `docs/kiro-log.md` only after it has been observed firing and the observation is logged (plan section 11.2, matrix row 31). Procedure, done in a Kiro IDE session opened at the repository root:

1. `npm run verify` passes from a terminal on `main` (the scaffold of `simulation-contract` task 0, even with no tests). The save hook needs a file to match: `src/simulation/` and `src/spatial/` receive their stub modules (`src/simulation/heap.ts`, `src/spatial/grid.ts`, …) from `simulation-contract` task 1. While tasks of that spec are unfinished, `npm run test:model` fails on `not implemented` by design; record that state in the row, and repeat the save observation once after the spec's last task so that one passing run is logged as well.
2. Read the Kiro usage display and note the credit figure.
3. Save `src/simulation/heap.ts` (or any file under `src/simulation/` or `src/spatial/`) with a whitespace-only change and confirm that `model-tests-on-save` fires. Then ask the agent for a one-line answer and let the turn end, to observe `verify-on-stop`.
4. Save `src/domain/scenario.ts` with a whitespace-only change as well and confirm that `model-tests-on-save` does not fire for it; this settles the path-relative matcher semantics. Revert both whitespace changes afterwards.
5. For each hook, record whether it fired, the configured trigger name, the first and last lines of the command output, the duration, and a screenshot of the hook output saved as `docs/acceptance/img/<yyyy-mm-dd>-hook-stop.png` or `docs/acceptance/img/<yyyy-mm-dd>-hook-save.png`. Read the usage display again and record the difference.
6. Append one `docs/kiro-log.md` row per hook: the date; `Kiro IDE <version as shown>` and the model shown in the session; `Setup: hook observation (matrix row 31)`; the hook file and screenshot path; the command and its result as the hook ran it; the measured credit difference; `none` under "what changed because of a failure", or the change made (for example a corrected matcher).
7. If a hook does not fire: check the matcher semantics and the field names against the IDE's hook reference, change the value, repeat steps 3–6 once, and log both attempts. Never guess a third time.
8. Keep only observed hook files in `.kiro/hooks/`; delete an unobserved one rather than keeping it as decoration, and remove its row from the table above.

Rules while the hooks run: a task whose last `npm run verify` did not pass is not finished, except on a spec branch where later tasks' tests are red by design (the first task of every spec scaffolds failing tests); there the task's own `Verify:` line is its acceptance and the stop hook's failures are expected until the spec's last task. A failing hook run on `main` is a defect to log and fix, never a reason to disable the hook, raise its timeout, skip a test, widen a tolerance or weaken `npm run verify`. `npm run test:model` runs `tests/model` (target 60 s, `simulation-contract` Requirement 10.10) and `tests/comparison` (target 45 s), so a save under `src/simulation/` or `src/spatial/` costs up to about 105 s once both suites exist. The IDE observation records the measured save-hook duration; if it makes editing intolerable, remove the save hook and keep the stop hook rather than loosening `npm run test:model`. `npm run verify` must finish inside the 600 s timeout on the builder's named laptop; shorten the suite rather than raising the timeout.
