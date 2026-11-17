import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const ENGINE_DIRS = ['src/domain', 'src/simulation', 'src/spatial'];
const IMPORT_DIRS = [...ENGINE_DIRS, 'src/workers'];
const FORBIDDEN_TOKENS = [/Math\.random/, /Date\.now/, /performance\.now/, /new Date\(/];
const FORBIDDEN_FOLDERS = ['src/replay', 'src/ui', 'src/imports', 'src/storage', 'src/comparison', 'src/exports'];

function files(dir: string): string[] {
  const full = join(ROOT, dir);
  return readdirSync(full).flatMap((name) => {
    const path = join(full, name);
    return statSync(path).isDirectory() ? files(relative(ROOT, path)) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

function specifiers(source: string): string[] {
  return [...source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map((match) => match[1] as string);
}

function forbiddenImport(file: string, specifier: string): boolean {
  if (specifier === 'pixi.js' || specifier.startsWith('pixi.js/')) return true;
  if (specifier === 'react' || specifier.startsWith('react/') || specifier === 'react-dom' || specifier.startsWith('react-dom/')) return true;
  const target = specifier.startsWith('.') ? relative(ROOT, resolve(file, '..', specifier)).replaceAll('\\', '/') : specifier;
  return FORBIDDEN_FOLDERS.some((folder) => target === folder || target.startsWith(`${folder}/`));
}

describe('rows 3.2 and 8.6: engine purity', () => {
  it('scans at least one file in each engine folder', () => {
    for (const dir of IMPORT_DIRS) expect(files(dir).length, dir).toBeGreaterThan(0);
  });

  it('src/domain, src/simulation and src/spatial use no wall clock and no unseeded random', () => {
    const hits = ENGINE_DIRS.flatMap(files).flatMap((file) =>
      FORBIDDEN_TOKENS.filter((token) => token.test(readFileSync(file, 'utf8'))).map((token) => `${relative(ROOT, file)}: ${token}`),
    );
    expect(hits).toEqual([]);
  });

  it('the engine and the worker import no UI, rendering, import, storage, comparison or export module', () => {
    const hits = IMPORT_DIRS.flatMap(files).flatMap((file) =>
      specifiers(readFileSync(file, 'utf8')).filter((specifier) => forbiddenImport(file, specifier)).map((specifier) => `${relative(ROOT, file)}: ${specifier}`),
    );
    expect(hits).toEqual([]);
  });
});