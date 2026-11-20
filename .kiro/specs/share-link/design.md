# Share link: design

## Parts
- `src/exports/share-link.ts`: `buildShareLink(scenario, base)` returns `{ ok: true, url } | { ok: false, code: 'TOO_LARGE' }`. Also `SHARE_LINK_MAX_CHARS` (6,000), `SHARE_PREFIX` (`#plan=v1.`) and the fixed status texts. It writes `JSON.stringify(scenario)`, compresses it with `CompressionStream('deflate-raw')` and encodes it as base64url without padding. No package is added; both are browser and Node 22 built ins.
- `src/imports/shareLink.ts`: `readShareLink(hash)` returns `null` when the hash is not ours, else `{ ok: true, scenario, hash, warnings, results }` (the shape of `OpenJsonResult`) or `{ ok: false, code, message }`. It decodes base64url, inflates with `DecompressionStream('deflate-raw')` while counting bytes (stops at 2 MiB), then calls `parseScenarioExport` on the text, so the validation, warnings and messages are the ones `Open JSON` has. Codes: `DAMAGED`, `WRONG_VERSION`, `NOT_A_PLAN` (from the parser).
- `src/ui/import/ReviewDialog.tsx`: the modal dialog of `OpenJson`, extracted so both openers share it. `OpenJson` behaves as before.
- `src/ui/ShareLinkButton.tsx`: the `Copy share link` button; `copyShareLink(store, deps)` is the testable core (deps: clipboard writer and base address).
- `src/ui/import/ShareLinkOpener.tsx`: mounted once by `App`. On mount and on `hashchange` it reads `location.hash`, clears the hash with `history.replaceState` before any async work (so React StrictMode's second effect finds nothing), decodes, then opens, shows the dialog, or sets the status.
- `src/ui/plan/PlanScreen.tsx`: the button after `SaveBar`.

## Flow
Copy: current tab's scenario -> `buildShareLink` -> too large: status, stop -> `navigator.clipboard.writeText` -> status.
Open: hash -> `readShareLink` -> failure: status, stay -> warnings: dialog -> `scenario/open` and `screen/set plan` -> status `Opened "<title>".`.

## Why the bare scenario
`parseScenarioExport` accepts a bare scenario (`schemaVersion: 1`). The envelope adds the assumptions text and limits text, about 2 KB uncompressed, which would use the 6,000 character budget for nothing. The scenario itself is identical to the one the JSON save writes.

## Size
Character count includes the app address. The fixture test builds the link for Harbor Hall and records its length; the over limit case uses a scenario with many blocked cells so deflate cannot shrink it below 6,000 characters.

## Limits
A link is not private. It is a plain URL. The Plan screen says nothing about privacy beyond the existing text. The URL fragment is not sent to a server by browsers, but messaging apps and browser history may keep it; this is a note for the README, not a security claim.

## Tests
`tests/imports/share-link.test.ts` (codec: round trip, size, tampering, bomb, wrong version, wrong content), `tests/ui/share-link-copy.test.tsx`, `tests/ui/share-link-open.test.tsx`, `tests/e2e/share-link.spec.ts` (round trip in headless Chromium, requests same origin, damaged link on landing).
