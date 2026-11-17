// Writes docs/third-party-notices.md from package.json, package-lock.json and the installed packages.
// Plain Node ESM, no dependencies. Run: node tests/comparison/tools/third-party-notices.mjs
// Exit 1 when an installed package has no `license` field (the entry reads `UNKNOWN - check manually`).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const root = process.cwd();
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const pkg = readJson(`${root}/package.json`);
const lock = readJson(`${root}/package-lock.json`);
const packages = lock.packages ?? {};

// What the direct dependencies are used for (kept from the hand-written notices of scenario-editor-and-replay task 17).
const USED_FOR = {
  xlsx: 'reading and writing the workbook files, only inside `src/imports/workbookReader.ts` and `scripts/make-fixtures.ts`',
  jsdom: 'component tests',
  '@testing-library/react': 'component tests',
  '@testing-library/dom': 'component tests',
};

// Display names where the package name alone hides what it is.
const DISPLAY = { xlsx: 'SheetJS Community Edition (`xlsx`)' };

// A dependency of the package at `from` ("" is the root) resolves to the nearest node_modules/<name> going up.
function resolve(name, from) {
  let base = from;
  for (;;) {
    const candidate = `${base ? `${base}/` : ''}node_modules/${name}`;
    if (packages[candidate]) return candidate;
    if (!base) return null;
    const cut = base.lastIndexOf('/node_modules/');
    base = cut < 0 ? '' : base.slice(0, cut);
  }
}

function walk(startNames, from) {
  const seen = new Map();
  const queue = startNames.map((name) => resolve(name, from)).filter(Boolean);
  while (queue.length > 0) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.set(path, packages[path]);
    const entry = packages[path];
    const names = [...Object.keys(entry.dependencies ?? {}), ...Object.keys(entry.optionalDependencies ?? {})];
    for (const name of names) {
      const next = resolve(name, path);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

function licenseOf(path) {
  const file = `${root}/${path}/package.json`;
  if (!existsSync(file)) return null; // optional package not installed on this platform
  const json = readJson(file);
  const value = json.license ?? (Array.isArray(json.licenses) ? json.licenses.map((l) => l.type).join(' OR ') : null);
  if (typeof value === 'object' && value !== null) return value.type ?? null;
  return value || null;
}

const unknown = [];
function row(path, direct) {
  const entry = packages[path];
  const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const license = licenseOf(path);
  if (license === null && !existsSync(`${root}/${path}/package.json`)) return null;
  const specifier = direct ? { ...pkg.dependencies, ...pkg.devDependencies }[name] : undefined;
  const source = /^https?:\/\//.test(specifier ?? entry.resolved ?? '') && !/registry\.npmjs\.org/.test(specifier ?? entry.resolved ?? '')
    ? (specifier ?? entry.resolved)
    : 'npm';
  let shownLicense = license;
  if (shownLicense === null) {
    shownLicense = 'UNKNOWN - check manually';
    unknown.push(`${name}@${entry.version}`);
  }
  const usedFor = USED_FOR[name] ?? '';
  return { name, version: entry.version, license: shownLicense, source, usedFor };
}

const sortRows = (rows) => rows.filter(Boolean).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.version < b.version ? -1 : 1));
const cell = (text) => String(text).replaceAll('|', '\\|');
const table = (rows) =>
  [
    '| Package | Version | License | Source | Used for |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${cell(DISPLAY[r.name] ?? r.name)} | ${cell(r.version)} | ${cell(r.license)} | ${r.source === 'npm' ? 'npm' : `\`${cell(r.source)}\``} | ${cell(r.usedFor)} |`),
  ].join('\n');

const shippedPaths = walk(Object.keys(pkg.dependencies ?? {}), '');
const isTopLevel = (path) => path.indexOf('node_modules/', 1) < 0;
const shipped = sortRows([...shippedPaths.keys()].map((path) => row(path, isTopLevel(path) && pkg.dependencies?.[path.slice('node_modules/'.length)] !== undefined)));
const developmentPaths = Object.keys(pkg.devDependencies ?? {}).map((name) => resolve(name, '')).filter(Boolean);
const development = sortRows(developmentPaths.map((path) => row(path, true)));

const date = new Date().toISOString().slice(0, 10);
const text = [
  '# Third-party notices',
  '',
  `Generated ${date} by \`node tests/comparison/tools/third-party-notices.mjs\`. Licenses were read from the \`license\` field of each installed package under \`node_modules/\`, not from the registry. The shipped table lists every package reachable from \`dependencies\` in \`package-lock.json\`; the development table lists the direct \`devDependencies\`, which are not shipped in the built app.`,
  '',
  '## Shipped (reachable from `dependencies`)',
  '',
  table(shipped),
  '',
  '## Development (direct `devDependencies`)',
  '',
  table(development),
  '',
].join('\n');

writeFileSync(`${root}/docs/third-party-notices.md`, text, { encoding: 'utf8' });
console.log(`wrote docs/third-party-notices.md: ${shipped.length} shipped, ${development.length} development`);
for (const entry of unknown) console.log(`UNKNOWN - check manually: ${entry}`);
process.exit(unknown.length > 0 ? 1 : 0);
