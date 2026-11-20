# Kiro extensions: design

## Files
- `power/rehearsal/plugin.json`, `mcp.json`, `README.md`, `skills/simulation-rules/SKILL.md`. The format is the one in the saved Kiro docs `powers_create.md`: a manifest, an optional `mcp.json`, skills in their own folders.
- `tests/kiro/extensions.test.ts`, added to the `include` list of `vite.config.ts` so `npm run test:model` runs it.

## Choices
- The MCP server is the one `.kiro/settings/mcp.json` starts, copied as is. It needs no environment variable and no path, so the installed copy runs anywhere Node and `npx` run.
- The skill is the only skill. It packs the rules from the four steering files and `docs/model-contract.md` in under 120 lines. Its limit sentences are copied from the code that renders them, and the test compares them to that code.
- The recipe names the real UI: `Try the community fair` (Landing), `Simulate` (RunPanel), the `Compare` tab (ScreenTabs), the toggles `Baseline: <title>` and `Candidate: <title>` (PickScenarios), `Run comparison` and the `Headline` region (CompareScreen). Picks are done one call at a time, because two parallel picks once left both sides on the same scenario (log row of 2026-11-17, task 14).

## Test sources
- Limit sentences: `ASSUMPTIONS` and `LIMITS_TEXT` of `src/ui/plan/AssumptionsPanel.tsx`, `LEGEND` of `src/ui/game/GameViewPanel.tsx`, `RANGE_LABEL` of `src/comparison/labels.ts`. `ASSUMPTIONS`, `LIMITS_TEXT` and `RANGE_LABEL` are imported; `LEGEND` is read as source text so the test loads no canvas code.
- Playwright tool names: the README of the installed `@playwright/mcp` in the npx cache, when one at version 0.0.85 is found. Otherwise the tool names in `docs/kiro-log.md` for the Playwright session of 2026-11-17 and in `docs/acceptance/paired-comparison-and-release.md`. The test says which source it used.

## Out of scope
No install, no Kiro session, no browser, no change to `.kiro/settings/`, `src/`, `public/` or the root README.
