import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const TOKENS = readFileSync('src/ui/styles/tokens.css', 'utf8');

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi as number) + 0.05) / ((lo as number) + 0.05);
}

function value(name: string): string {
  const match = new RegExp(`${name}\\s*:\\s*([^;]+);`, 'i').exec(TOKENS);
  if (match === null) throw new Error(`tokens.css has no ${name}`);
  return (match[1] as string).trim().toUpperCase();
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe('blackboard tokens', () => {
  it.each([
    ['--board', '#233B33'],
    ['--board-deep', '#1B2E28'],
    ['--raised', '#2D4A40'],
    ['--card', '#2D4A40'],
    ['--line', '#5E7A6E'],
    ['--ink', '#F2EFE6'],
    ['--ink-muted', '#B9C7BE'],
    ['--pumpkin', '#FF9A3D'],
    ['--sage', '#9FD8B4'],
    ['--straw', '#F2D377'],
    ['--ember', '#FF7F61'],
    ['--paper', '#FFFFFF'],
    ['--print-ink', '#1A1F1C'],
    ['--card-highlight', '#34503F'],
  ])('%s is %s', (name, hex) => {
    expect(value(name)).toBe(hex);
  });

  it('keeps the token names the other tests read', () => {
    for (const name of ['--board', '--card', '--ink', '--ink-muted', '--candidate', '--baseline', '--focus', '--line', '--danger']) {
      expect(TOKENS, name).toMatch(new RegExp(`${name}\\s*:`));
    }
  });

  it('defines the wait ramp from sage through straw and pumpkin to ember', () => {
    const ramp = value('--wait-ramp');
    expect(ramp).toBe('LINEAR-GRADIENT(90DEG, #9FD8B4, #F2D377, #FF9A3D, #FF7F61)');
  });

  it('picks the three role colours from the palette, each at least 3:1 on the board', () => {
    const palette = ['#9FD8B4', '#F2D377', '#FF9A3D', '#FF7F61', '#F2EFE6', '#B9C7BE'];
    for (const role of ['--candidate', '--baseline', '--focus']) {
      const hex = value(role);
      expect(palette, role).toContain(hex);
      expect(contrast(hex, value('--board')), role).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps ink and muted ink at least 4.5:1 on the board and the card', () => {
    for (const fg of ['--ink', '--ink-muted']) {
      for (const bg of ['--board', '--card']) expect(contrast(value(fg), value(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the dashed baseline outline', () => {
    expect(TOKENS).toMatch(/dashed\s+var\(--baseline\)/);
  });
});

describe('no external font', () => {
  it('no file under src and not index.html names a font host or any http URL in a stylesheet', () => {
    const sources = [...files('src'), 'index.html'];
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toContain('fonts.googleapis');
      expect(text, file).not.toContain('fonts.gstatic');
      if (file.endsWith('.css') || file === 'index.html') expect(text, file).not.toMatch(/https?:\/\//);
    }
  });

  it('loads the three families from pinned @fontsource packages, only the weights in use', () => {
    const main = readFileSync('src/main.tsx', 'utf8');
    const imports = [...main.matchAll(/import '(@fontsource\/[^']+)'/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(
      [
        '@fontsource/dm-mono/latin-400.css',
        '@fontsource/dm-mono/latin-500.css',
        '@fontsource/schibsted-grotesk/latin-400.css',
        '@fontsource/schibsted-grotesk/latin-500.css',
        '@fontsource/schibsted-grotesk/latin-600.css',
        '@fontsource/schibsted-grotesk/latin-700.css',
        '@fontsource/zilla-slab/latin-600.css',
        '@fontsource/zilla-slab/latin-700.css',
      ].sort(),
    );
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@fontsource/zilla-slab']).toBe('5.3.0');
    expect(pkg.dependencies['@fontsource/schibsted-grotesk']).toBe('5.3.0');
    expect(pkg.dependencies['@fontsource/dm-mono']).toBe('5.3.0');
  });
});
