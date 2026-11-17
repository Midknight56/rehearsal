import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FORBIDDEN_BADGE_WORDS } from '../../src/exports/assumptions-text';

// Words that must not appear as whole words in the source string literals of src/ui/print/** and src/ui/results/**
// (model-limits.md). The one list of the repository is FORBIDDEN_BADGE_WORDS of src/exports/assumptions-text.ts.
const WORDS = FORBIDDEN_BADGE_WORDS;
const FOLDERS = ['src/ui/print', 'src/ui/results'];

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}

function literals(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const found: string[] = [];
  const pattern = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1|>([^<>{}\n]+)</g;
  for (const match of code.matchAll(pattern)) found.push((match[2] ?? match[3] ?? '').toString());
  return found;
}

describe('8.2 vocabulary of the printed and result surfaces', () => {
  it('uses the one list of badge words, which holds exactly the six words of the steering file', () => {
    expect([...FORBIDDEN_BADGE_WORDS]).toEqual(['optimized', 'optimised', 'optimal', 'safe', 'certified', 'recommended']);
  });

  it('scans the result tables', () => {
    expect(files('src/ui/results').length).toBeGreaterThan(0);
  });

  it.each(WORDS)('%s is absent as a whole word from every string literal', (word) => {
    const pattern = new RegExp(`\\b${word}\\b`, 'i');
    const hits = FOLDERS.flatMap(files).flatMap((file) => literals(readFileSync(file, 'utf8')).filter((s) => pattern.test(s)).map((s) => `${file}: ${s}`));
    expect(hits).toEqual([]);
  });

  it('forecast appears only inside "not a forecast"', () => {
    const hits = FOLDERS.flatMap(files).flatMap((file) =>
      literals(readFileSync(file, 'utf8')).filter((s) => /forecast/i.test(s.replace(/not a forecast/gi, ''))).map((s) => `${file}: ${s}`),
    );
    expect(hits).toEqual([]);
  });

  it('the scanner itself catches a forbidden literal', () => {
    expect(literals('const a = "this is safe";').some((s) => /\bsafe\b/.test(s))).toBe(true);
    expect(literals('// safe in a comment\nconst b = "fine";')).toEqual(['fine']);
  });
});
