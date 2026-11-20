# Proof: one real change made in Kiro Web

Date: 2026-11-20. Surface: Kiro Web (app.kiro.dev), model Auto, repository Midknight56/rehearsal on its main branch, collaborative mode, network access "Repository access only".

Request typed into the session (shortened): the production build prints a Rolldown warning `INEFFECTIVE_DYNAMIC_IMPORT` for `src/exports/run-sheet.ts` (imported dynamically by `src/ui/exportFiles.ts` and statically by `PrintScreen.tsx` and `RunSheetView.tsx`); fix the cause with the smallest change and open a pull request.

What Kiro Web did (session screenshot: `session-2026-11-20.jpg`):
- It changed one file, `src/ui/exportFiles.ts`: a static import of `renderRunSheet` at the top and the dynamic `import()` removed from `openRunSheetTab`. One line added, one removed.
- It opened pull request 1: https://github.com/Midknight56/rehearsal/pull/1 (branch `fix/run-sheet-static-import`, commit 8580b996, author shown as the Kiro agent).
- Its own words on what it could not do: `npm ci` failed in its sandbox with a 403 from the registry, so it could not run `npm run build` or `npm run verify`, and it asked for them to be run elsewhere. Estimated credits for the session: 0.41, elapsed time 28 s (both from the session page).

What was checked here afterwards, on this PC:
- Before the change `npm run build` printed the `INEFFECTIVE_DYNAMIC_IMPORT` warning (seen in the gate output of the same day). After the merge `npm run build` prints it 0 times and ends with `built in 350ms`.
- `tests/ui/exports.test.tsx` and `tests/ui/print.test.tsx`: 25 tests pass.
- The pull request branch was fetched (`git fetch origin pull/1/head`) and merged into the working branch with a merge commit.

How Kiro Web differed from the CLI in this task: it works in a cloud copy of the repository, not this checkout; it could not install packages because its network access was limited to the repository, so it could not run the build; it opens a pull request by itself, which the CLI runs here do not.
