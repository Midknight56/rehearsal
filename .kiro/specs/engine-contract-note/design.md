# Design: engine contract note

The change is a comment only. One doc comment goes directly above `export function simulate` in `src/simulation/simulate.ts`. No statement, import, type or export in that file changes, so the engine computes what it computed before, and `MODEL_VERSION` and `expected.json` stay as they are.

The comment states four points, each taken from the source files named in the requirements: time inside the engine is whole milliseconds; the same scenario, replication and options give the same result byte for byte; the engine never reads the wall clock; `simulate` throws `ScenarioInvalidError` for a scenario the validator refuses.

The test reads `src/simulation/simulate.ts` as text instead of importing it. A comment is not part of the compiled module, so no runtime check can see it. The test takes the text before `export function simulate`, requires that the last thing there is a `/** ... */` block, and matches the four phrases inside that block only, so a phrase elsewhere in the file cannot satisfy it.

The hook `model-tests-on-save` (`.kiro/hooks/model-tests-on-save.json`, trigger `PostFileSave`, matcher `^src/(simulation|spatial)/`) is expected to run `npm run test:model` when task 2 saves `src/simulation/simulate.ts`. If the hook output is absent, run that command by hand and say so in the log row.
