import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Reads simulate.ts as text: a comment is not part of the compiled module.
const source = readFileSync(resolve(process.cwd(), 'src/simulation/simulate.ts'), 'utf8');

/** The `/** ... *\/` block that ends directly above `export function simulate`, or '' when absent. */
function contractBlock(text: string): string {
  const at = text.indexOf('export function simulate');
  if (at < 0) return '';
  const before = text.slice(0, at);
  const match = /\/\*\*(?:(?!\*\/)[\s\S])*\*\/[ \t]*\r?\n$/.exec(before);
  return match ? match[0] : '';
}

const block = contractBlock(source);

describe('engine contract note above simulate', () => {
  it('has a doc comment directly above export function simulate', () => {
    expect(block).not.toBe('');
  });

  it.each(['milliseconds', 'byte for byte', 'wall clock', 'ScenarioInvalidError'])(
    'the comment contains "%s"',
    (phrase) => {
      expect(block).toContain(phrase);
    },
  );
});
