# Third-party notices

Generated 2026-11-17 by `node tests/comparison/tools/third-party-notices.mjs`. Licenses were read from the `license` field of each installed package under `node_modules/`, not from the registry. The shipped table lists every package reachable from `dependencies` in `package-lock.json`; the development table lists the direct `devDependencies`, which are not shipped in the built app.

## Shipped (reachable from `dependencies`)

| Package | Version | License | Source | Used for |
| --- | --- | --- | --- | --- |
| @fontsource/dm-mono | 5.3.0 | OFL-1.1 | npm |  |
| @fontsource/schibsted-grotesk | 5.3.0 | OFL-1.1 | npm |  |
| @fontsource/zilla-slab | 5.3.0 | OFL-1.1 | npm |  |
| @pixi/colord | 2.9.6 | MIT | npm |  |
| @types/earcut | 3.0.0 | MIT | npm |  |
| @webgpu/types | 0.1.74 | BSD-3-Clause | npm |  |
| @xmldom/xmldom | 0.8.15 | MIT | npm |  |
| earcut | 3.2.4 | ISC | npm |  |
| eventemitter3 | 5.0.4 | MIT | npm |  |
| gifuct-js | 2.1.2 | MIT | npm |  |
| ismobilejs | 1.1.1 | MIT | npm |  |
| js-binary-schema-parser | 2.0.3 | MIT | npm |  |
| papaparse | 5.7.0 | MIT | npm |  |
| parse-svg-path | 0.2.0 | MIT | npm |  |
| pixi.js | 8.22.0 | MIT | npm |  |
| react | 19.3.1 | MIT | npm |  |
| react-dom | 19.3.1 | MIT | npm |  |
| scheduler | 0.28.0 | MIT | npm |  |
| seedrandom | 3.0.5 | MIT | npm |  |
| tiny-lru | 11.4.7 | BSD-3-Clause | npm |  |
| SheetJS Community Edition (`xlsx`) | 0.20.3 | Apache-2.0 | `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` | reading and writing the workbook files, only inside `src/imports/workbookReader.ts` and `scripts/make-fixtures.ts` |
| zod | 4.6.7 | MIT | npm |  |

## Development (direct `devDependencies`)

| Package | Version | License | Source | Used for |
| --- | --- | --- | --- | --- |
| @playwright/test | 1.64.1 | Apache-2.0 | npm |  |
| @testing-library/dom | 10.4.2 | MIT | npm | component tests |
| @testing-library/react | 16.3.3 | MIT | npm | component tests |
| @types/node | 26.6.6 | MIT | npm |  |
| @types/papaparse | 5.5.2 | MIT | npm |  |
| @types/react | 19.3.0 | MIT | npm |  |
| @types/react-dom | 19.3.0 | MIT | npm |  |
| @types/seedrandom | 3.0.8 | MIT | npm |  |
| @vitejs/plugin-react | 6.3.0 | MIT | npm |  |
| fast-check | 4.10.2 | MIT | npm |  |
| jsdom | 31.0.1 | MIT | npm | component tests |
| typescript | 7.0.2 | Apache-2.0 | npm |  |
| vite | 8.3.5 | MIT | npm |  |
| vitest | 5.0.5 | MIT | npm |  |
