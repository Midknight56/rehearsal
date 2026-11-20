# Proof: the rehearsal power in one headless Kiro session

Date: 2026-11-20. Tool: Kiro CLI 3.5.0 (`kiro-cli --version` printed `kiro-cli 3.5.0`), model `auto`, harness V3 (`--v3`). The power is `power/rehearsal/`. Files here: `session-output.txt` (the output of the session) and this page.

## Commands, in the order they ran

From the repository root, in PowerShell. Before it, `~/.kiro/powers/installed.json` listed no power.

```powershell
kiro-cli powers install power/rehearsal
```

Output: `Installed power "rehearsal"`. Then, from an empty folder:

```powershell
kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools="kiro_powers,@rehearsal" "Open the app at https://rehearsal.midknight-ent-llc.workers.dev, try the community fair, run it, and compare the baseline with the extra check in staff plan. Give me the headline and the run counts, and tell me what unit the engine counts time in and whether it may read the wall clock."
```

The prompt names no tool and no skill. Exit code 0, 57 seconds (2:19:10 PM to 2:20:07 PM).

```powershell
kiro-cli powers uninstall rehearsal
```

The first uninstall attempt failed with `EBUSY: resource busy or locked, rm '...\.kiro\powers\installed\rehearsal'` (the cause was not determined). The next attempt, about 30 seconds later, printed `Uninstalled power "rehearsal"`. After it, `installed.json` listed `"installedPowers": []` and the `installed` folder held no `rehearsal` entry. The power is not loaded into later sessions on this machine.

## Tool calls seen

Counts of the lines of `session-output.txt` that name a tool: `Kiro Powers` 1, `Tool Load` 5, `@rehearsal/playwright/browser_click` 6, `@rehearsal/playwright/browser_snapshot` 5, `@rehearsal/playwright/browser_wait_for` 2, `@rehearsal/playwright/browser_close` 1. `@rehearsal/playwright/...` is a tool of the `playwright` server that the power's `mcp.json` declares. One `Read File` and two `Run Command` calls appear too: the `Read File` failed and both `Run Command` calls were denied, because the run trusted only `kiro_powers` and `@rehearsal`.

## What the session answered

It opened the live app, clicked Try the community fair, ran the baseline, opened Compare and read: "Mean queue wait drops by 297.4 s.", "Lower in 30 of 30 runs.", the change "Station "Check-in desk": servers 1 → 2", and the text "30 of 30 paired runs complete". Mean queue wait 305.3 s for the baseline and 7.9 s for the candidate. It said the engine counts time in integer milliseconds and never reads the wall clock, which are two sentences of the power's skill `simulation-rules`. It ended with "These are scenario results under the app's assumptions, not a forecast" and recommended no staffing level.

The 297.4 s figure matches `README.md` and the 30 paired runs of the Crew app (`https://github.com/Midknight56/rehearsal-crew`).

## What did not work

The session asked the browser tool to save one snapshot to a file and could not read it back. It said so in its answer and asked for the workspace to be checked. The run folder held only `session-output.txt` afterwards.
