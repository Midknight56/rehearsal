# Third-party notices

| Package | Version | Licence | Source | Used for |
| --- | --- | --- | --- | --- |
| SheetJS Community Edition (`xlsx`) | 0.20.3 | Apache-2.0 (as named in `src/imports/workbookReader.ts`) | `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (SheetJS's own CDN tarball, as pinned in `package.json`) | reading and writing the workbook files, only inside `src/imports/workbookReader.ts` and `scripts/make-fixtures.ts` |
| jsdom | 31.0.1 | MIT (recorded in the log row of scenario-editor-and-replay task 1) | npm | component tests |
| @testing-library/react, @testing-library/dom | 16.3.3, 10.4.2 | MIT (same log row) | npm | component tests |