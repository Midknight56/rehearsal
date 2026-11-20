# Kiro extensions: requirements

Rehearsal ships one Kiro power in the Agent Plugins format, in `power/rehearsal/`. It gives Kiro the rules of the simulation as a skill and the Playwright MCP server that drives the app. A test reads the files and checks them; it starts no Kiro session and no browser.

## 1. The manifest

**Story:** As a judge or a user, I want a valid manifest, so that Kiro installs the power and knows when to load it.

1. THE SYSTEM SHALL provide `power/rehearsal/plugin.json` with `$schema` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`, `name` `rehearsal`, `version` `0.1.0`, a `description`, `author.name` `Rehearsal` and at least 6 non empty `keywords`.
2. THE SYSTEM SHALL use a `name` in kebab case and a `version` below 1.0.0.
3. THE SYSTEM SHALL name no other project, no prize and no budget in any file of the power.

## 2. The MCP server

**Story:** As a user, I want the browser tools the repository already uses, so that Kiro can drive the app headless.

1. THE SYSTEM SHALL provide `power/rehearsal/mcp.json` that parses and holds a `playwright` server whose `command` and `args` equal those of `.kiro/settings/mcp.json`, including the `cmd /c` wrapper, `@playwright/mcp@0.0.85`, `--headless` and `--isolated`.
2. THE SYSTEM SHALL hold no drive path and no user name in `mcp.json`.

## 3. The skill

**Story:** As an agent, I want the rules of the model in one place, so that I report results in units and words the app itself uses.

1. THE SYSTEM SHALL provide `power/rehearsal/skills/simulation-rules/SKILL.md` with front matter `name` and `description`, in at most 120 lines.
2. THE SYSTEM SHALL state in it the units, the determinism rules, the claims policy and every model limit sentence of the Assumptions panel (`ASSUMPTIONS` and `LIMITS_TEXT` in `src/ui/plan/AssumptionsPanel.tsx`), the game view legend (`LEGEND` in `src/ui/game/GameViewPanel.tsx`) and the range label (`RANGE_LABEL` in `src/comparison/labels.ts`), each exactly as the app shows it.
3. THE SYSTEM SHALL give a recipe for the Playwright tools that uses the button and region names found in `src/ui`, and only tool names that `@playwright/mcp` 0.0.85 offers.
4. THE SYSTEM SHALL write no dash between words, and say that a result is a scenario result and not a forecast.

## 4. The README

**Story:** As a user, I want to install and remove the power without guessing.

1. THE SYSTEM SHALL provide `power/rehearsal/README.md` that names `kiro-cli powers install power/rehearsal` and `kiro-cli powers uninstall rehearsal`, Node 22.12 or later, the network for `npx`, how to use the power and its limits.

## 5. The custom agent

**Story:** As an owner, I want the Playwright agent to read the page and nothing else.

1. THE SYSTEM SHALL keep `.kiro/agents/rehearsal-playwright.json` parseable, with `tools` and `allowedTools` naming only `@playwright`, a server that exists in `.kiro/settings/mcp.json`, and no write, edit or shell tool or permission.

## 6. Evidence

1. THE SYSTEM SHALL record each finished task as one row in `docs/kiro-log.md`.
2. THE SYSTEM SHALL claim no install and no session until the lead has installed the power and recorded it. Until then the README of the repository is not changed.
