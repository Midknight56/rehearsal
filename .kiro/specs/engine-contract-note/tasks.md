# Tasks: engine contract note

Kiro does every task. Run them in order. Do not run git commit, git switch, git branch, git checkout, git stash or git reset.

- [x] 1. Tests first. Add `tests/model/engine-contract-note.test.ts`, which reads `src/simulation/simulate.ts` as text, takes the comment block directly above `export function simulate`, and checks that it contains the words `milliseconds`, `byte for byte`, `wall clock` and `ScenarioInvalidError`, one test per word plus one that the block exists. Edit no file under `src/`. _Requirements: 2.1 to 2.4_
  - Verify: `npx vitest run tests/model/engine-contract-note.test.ts` fails, and only because the comment is missing.

- [x] 2. The comment. Read `src/simulation/simulate.ts`, `.kiro/steering/units-and-determinism.md` and `docs/model-contract.md`, then add a doc comment directly above `export function simulate` that says in plain words that time inside the engine is whole milliseconds, that the same scenario, replication and options give the same result byte for byte, that the engine never reads the wall clock, and that it throws `ScenarioInvalidError` for a scenario the validator refuses. Change nothing else in that file. _Requirements: 1.1 to 1.6, 3.1, 3.2_
  - Verify: `npx vitest run tests/model/engine-contract-note.test.ts` passes and `npm run test:model` passes.

- [x] 3. The record. Run `Get-Date -Format yyyy-MM-dd` for the real date, add one row to `docs/kiro-log.md` for this spec with the surface "Kiro IDE", the files changed and the results of the Verify lines of tasks 1 and 2 as they ran, write "not recorded" for credits not read, then tick the three tasks in this file. _Requirements: 3.3, 4.1, 4.2_
  - Verify: `npm run verify` exits 0.
