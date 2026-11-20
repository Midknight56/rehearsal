# Kiro IDE session, 20 November 2026

Kiro IDE opened on this repository, on the side display, with a small spec of its own (`.kiro/specs/engine-contract-note/`: a failing test first, then a doc comment above `simulate` in `src/simulation/simulate.ts`, then the log row). The IDE ran the three tasks from the `Start task` links in `tasks.md`. Facts below were read from the screen, from the IDE's own log (`Kiro Logs.log` in `%APPDATA%\Kiro\logs`) and from a process list taken once every half second while it ran.

| Step | What was seen | File |
| --- | --- | --- |
| Window on the side display | The launcher guard started the IDE at 2:38:49 PM. A window list taken at the end shows `tasks.md - rehearsal - Kiro left=-1998 top=40 right=-96 bottom=1091`, which is the side display. No Kiro window was on the main display. The guard did not need to move the window (the IDE reopened at the place the last session left it), so `window-guard.log` holds only the start line. | `window-guard.log` |
| Restricted Mode | The folder opened in Restricted Mode. The Workspace Trust dialog lists what is off. Trusting the folder turned on tasks and workspace settings. | none |
| Hooks start switched off | The Agent Hooks panel listed `model-tests-on-save (PostFileSave)` and `verify-on-stop (Stop)`, both labelled `(disabled)`. The eye icon beside `model-tests-on-save` wrote `"enabled": true` into `.kiro/hooks/model-tests-on-save.json`. The label stayed until `Developer: Reload Window`, after which neither hook carried it. | `01-hooks-loaded-and-start-task-links.jpg` |
| Spec tasks | Task 1 (tests first): the agent wrote `tests/model/engine-contract-note.test.ts` and ran it. 5 tests failed, only because the comment did not exist. Task 2: the agent added the doc comment above `simulate`; `npx vitest run tests/model/engine-contract-note.test.ts` 5 passed, `npm run test:model` 303 passed and 1 skipped. Task 3: `npm run verify` exit 0, one row added to `docs/kiro-log.md`. Credits the IDE showed: 1.67 for task 1 and 1.54 for task 2; not read for task 3. | `02-task-1-done-stop-hook-output.jpg`, `03-task-2-comment-added.jpg`, `07-all-three-tasks-done.jpg` |
| Approvals | The IDE asked for approval before each shell command the agent ran (`Allow`, `Always allow`, `Deny`). Every approval was given one at a time; one file edit was denied because the chat had garbled the text of the request. | none |
| Stop hook | At the end of each agent turn the chat showed a row `Run Command Hook verify-on-stop`. The IDE log has an entry `ContextualHookInvoked` at 2:41:52, 2:44:14, 2:45:23, 2:46:53, 2:47:36, 2:49:19, 2:50:48 and 2:54:37 PM, which are the turn ends. | `ide-log-hook-lines.txt`, `04-stop-hook-after-task-2.jpg` |
| Hook output that did not reproduce | After tasks 1 and 2 and in a later session, the agent reported that the hook's test run printed 40 failed suites, each with `TypeError: Cannot read properties of undefined (reading 'config')`. The same suites passed when run by hand (`npm run test:model` after the comment existed) and when the IDE agent ran `npm run verify` itself (exit 0, task 3). The cause was not found. | `02-task-1-done-stop-hook-output.jpg`, `06-hook-output-in-new-session.jpg` |
| Save hook `model-tests-on-save` | No `npm run test:model` run that came from it was seen. Saves of an engine file: the spec sub-agent in `simulate.ts` (about 2:43 PM), the agent in `path-cache.ts` (2:45:13 and 2:46:59 PM), and two saves made by hand in the editor with Ctrl+S (2:48:18 and 2:49:29 PM). The matcher then was `^src/(simulation|spatial)/`. The IDE log says `hooks load at session start`. After the matcher was changed to `src.(simulation|spatial).`, a new chat session was opened, and its agent saved `path-cache.ts` at 2:50:28 PM. The chat showed `1 hook triggered` and the IDE log has one extra `ContextualHookInvoked` at 2:50:34 PM, six seconds after the save. The IDE does not name the hook there, and the process list shows no test run in this repository at that time. So it is not claimed that `model-tests-on-save` ran. | `05-new-session-1-hook-triggered.jpg`, `ide-log-hook-lines.txt` |

## What changed in the repository because of this session

- `.kiro/hooks/model-tests-on-save.json`: `"enabled": true` and the matcher `src.(simulation|spatial).` (the dots match a slash or a backslash, and there is no anchor, because the IDE may give a full path). The change was made by the IDE agent on request.
- `src/simulation/simulate.ts`: a doc comment above `simulate`. `src/spatial/path-cache.ts`: a doc comment above `createPathCache`. No code changed.
- `tests/model/engine-contract-note.test.ts` keeps the `simulate` comment in place.

## How the IDE differed from the CLI

- The IDE asks for approval on each shell command the agent runs. The headless CLI runs with `--trust-all-tools` and asks nothing.
- The IDE runs a spec task in a sub-agent called `spec-task-execution` and ticks the box in `tasks.md` itself, with a `tasks.meta.json` file that records each execution.
- Hooks show in the chat as `Run Command Hook <name>` rows. In the CLI the hook output came back to the session as text.
- Hooks start switched off in the IDE and load when a chat session starts, so a change to a hook file needs a new session. The CLI read the same files with no such step.
- The IDE opens a folder in Restricted Mode until the folder is trusted.
- The IDE shows the credits of each task in the chat.
