# Rehearsal power

A Kiro power in the Agent Plugins format. It gives Kiro two things:

- One skill, `simulation-rules`. It holds the rules of the Rehearsal queue simulation: the units, seeded and repeatable runs, the model limits as the app words them, and what may be claimed about a result. It ends with a short recipe for running the app and reading a paired comparison.
- One MCP server, `playwright`, started the same way as the one in `.kiro/settings/mcp.json` of this repository. It is a headless browser that Kiro uses to open the app.

The power carries no server code of its own and no path of your machine.

## What it needs

- Node 22.12 or later.
- The network, because `npx` fetches `@playwright/mcp@0.0.85` the first time the server starts.
- The Rehearsal app running at an address you can give Kiro, for example the Vite dev server of this repository.
- On Windows the server starts through `cmd /c`, as in `.kiro/settings/mcp.json`.

## Install

From the root of this repository:

```powershell
kiro-cli powers install power/rehearsal
```

The next Kiro CLI session loads the power. The Kiro IDE lists a power that the CLI installed in its Powers panel. The power activates when you talk about queue simulation, event staffing, a check in line, a paired comparison or a what if question.

## Use

Start the app, then ask in plain words, for example: `Open the app at http://localhost:4275, try the community fair, run it and compare the baseline with the extra check in staff plan. Give me the headline and the run counts.` Kiro follows the recipe in the skill with the Playwright tools. Tool calls from a power ask for approval unless you trust them in the session.

Ask Kiro to report the headline and the run counts as the app words them, with units.

## Uninstall

```powershell
kiro-cli powers uninstall rehearsal
```

Uninstall it when you are done. An installed power is loaded into later sessions on the machine.

## Limits

- Every number the app shows is a scenario result under stated assumptions, for one seed and one replication or for 30 paired runs. It is not a forecast, a prediction, a crowd density model, a safety finding or a capacity recommendation.
- The Harbor Hall Community Fair example is fictional and illustrative.
- The recipe names buttons and regions of the current app. If a label changes, the recipe needs the same change.
- The browser server runs on your machine with your user's access. Review it before you install.
