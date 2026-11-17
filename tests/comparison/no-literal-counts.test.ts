import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPLETE_TEXT } from '../../src/comparison/labels';

const LITERAL_COUNT = /\b\d+\s*(of|\/)\s*30\s+runs\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : /\.(ts|tsx)$/.test(entry.name) ? [join(dir, entry.name)] : [],
  );
}

describe('no literal run counts (requirement 2.4)', () => {
  it('finds no "<n> of 30 runs" literal under src/comparison or src/exports', () => {
    const files = [...sourceFiles('src/comparison'), ...sourceFiles('src/exports')];
    expect(files.length).toBeGreaterThan(10);
    const hits = files.filter((file) => LITERAL_COUNT.test(readFileSync(file, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('composes COMPLETE_TEXT from REPLICATIONS', () => {
    expect(COMPLETE_TEXT).toBe('30 of 30 paired runs complete');
    expect(LITERAL_COUNT.test(COMPLETE_TEXT)).toBe(false);
    expect(readFileSync('src/comparison/labels.ts', 'utf8')).toContain('${REPLICATIONS} of ${REPLICATIONS}');
  });
});
