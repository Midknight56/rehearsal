import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const TOKENS = 'src/ui/styles/tokens.css';

function token(css: string, name: string): string {
  const match = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\\b`).exec(css);
  if (match === null) throw new Error(`${TOKENS} has no hex value for ${name}`);
  return match[1] as string;
}

function luminance(hex: string): number {
  const full = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi as number) + 0.05) / ((lo as number) + 0.05);
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? cssFiles(path) : path.endsWith('.css') ? [path] : [];
  });
}

describe('9.6 contrast computed from tokens.css (WCAG relative luminance)', () => {
  const ratios: string[] = [];
  const check = (fg: string, bg: string, min: number): void => {
    const css = readFileSync(TOKENS, 'utf8');
    const ratio = contrast(token(css, fg), token(css, bg));
    ratios.push(`${fg} on ${bg}: ${ratio.toFixed(2)}:1 (needs ${min}:1)`);
    console.log(ratios[ratios.length - 1]);
    expect(ratio).toBeGreaterThanOrEqual(min);
  };

  it.each([['--ink', '--board'], ['--ink', '--card'], ['--ink-muted', '--board'], ['--ink-muted', '--card']])('%s on %s is at least 4.5:1', (fg, bg) => check(fg, bg, 4.5));
  it.each([['--candidate'], ['--baseline'], ['--focus']])('%s on --board is at least 3:1', (fg) => check(fg as string, '--board', 3));
});

describe('9.6 colour is never the only cue, and focus is always visible', () => {
  it('the baseline layer carries a dashed outline rule', () => {
    expect(readFileSync(TOKENS, 'utf8')).toMatch(/dashed\s+var\(--baseline\)/);
  });

  it('no stylesheet under src removes the outline', () => {
    const files = cssFiles('src');
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/outline\s*:\s*(none|0)\b|outline-style\s*:\s*none/);
    }
  });

  it('draws a 3 px focus ring on :focus-visible', () => {
    expect(readFileSync(TOKENS, 'utf8')).toMatch(/:focus-visible\s*{[^}]*outline\s*:\s*3px\s+solid\s+var\(--focus\)/);
  });
});

describe('9.4 reduced motion', () => {
  it('stops transitions and animations for every element', () => {
    const css = readFileSync(TOKENS, 'utf8');
    const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{([\s\S]*?)\n}/.exec(css);
    expect(block).not.toBeNull();
    expect(block?.[1]).toMatch(/transition\s*:\s*none/);
    expect(block?.[1]).toMatch(/animation\s*:\s*none/);
    expect(css).toMatch(/\.reduce-motion[^{]*{[^}]*transition\s*:\s*none[^}]*animation\s*:\s*none|\[data-motion="reduce"\][^{]*{[^}]*transition\s*:\s*none/);
  });
});

describe('9.8 no horizontal page scroll', () => {
  it('app.css stacks the panels at 640 px and below and never sets a wider min-width on the page', () => {
    const css = readFileSync('src/ui/styles/app.css', 'utf8');
    expect(css).toMatch(/@media\s*\(max-width:\s*(640|700|720)px\)/);
    expect(css).not.toMatch(/body\s*{[^}]*min-width\s*:\s*\d{4,}px/);
  });
});
