import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { badgeWords } from './helpers/render';

const LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

/** The string literals of a source file, with comments removed first. */
function literalsOf(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => (line.trim().startsWith('//') ? '' : line.replace(/\s\/\/\s.*$/, '')))
    .join('\n');
  return code.match(LITERAL) ?? [];
}

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : /\.(ts|tsx)$/.test(entry.name) ? [join(dir, entry.name)] : [],
  );
}

describe('no approval vocabulary in source literals (requirement 8.4)', () => {
  const scanned = [...files('src/exports').filter((f) => !f.endsWith('assumptions-text.ts')), 'src/comparison/labels.ts'];

  it('scans the export sources and labels.ts', () => {
    expect(scanned.length).toBeGreaterThanOrEqual(7);
  });

  it('finds none of the six words in any string literal', () => {
    const hits = scanned.flatMap((file) => literalsOf(readFileSync(file, 'utf8')).filter((literal) => badgeWords.test(literal)).map((literal) => `${file}: ${literal}`));
    expect(hits).toEqual([]);
  });

  it('would catch a literal that uses one of the words', () => {
    expect(literalsOf("const a = 'the optimal layout'; // safe\n").some((l) => badgeWords.test(l))).toBe(true);
    expect(literalsOf("const a = 'ok'; // the optimal comment\n").some((l) => badgeWords.test(l))).toBe(false);
    expect(badgeWords.test('unsafe')).toBe(false);
  });
});
