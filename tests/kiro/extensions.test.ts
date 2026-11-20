import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RANGE_LABEL } from '../../src/comparison/labels';
import { ASSUMPTIONS, LIMITS_TEXT } from '../../src/ui/plan/AssumptionsPanel';

// Requirements of .kiro/specs/kiro-extensions. Reads files only: no Kiro session, no browser, no install.

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(REPO, ...parts), 'utf8');
const json = <T>(...parts: string[]): T => JSON.parse(read(...parts)) as T;

const POWER = ['power', 'rehearsal'];
const SKILL = [...POWER, 'skills', 'simulation-rules', 'SKILL.md'];
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DASH_BETWEEN_WORDS = /[ \t][-\u2013\u2014][ \t]|[\u2013\u2014]/;
const OTHER_PROJECTS = /hauntmap|kiroween|prize|budget|hackathon/i;

type McpFile = { mcpServers: Record<string, { command: string; args?: string[] }> };

/** The LEGEND sentence of src/ui/game/GameViewPanel.tsx, read as text so the test imports no canvas code. */
function legend(): string {
  const match = /export const LEGEND = '([^']+)';/.exec(read('src', 'ui', 'game', 'GameViewPanel.tsx'));
  expect(match, 'LEGEND in src/ui/game/GameViewPanel.tsx').not.toBeNull();
  return match?.[1] as string;
}

/** Playwright tool names that @playwright/mcp 0.0.85 offers, and which source they came from. */
function playwrightTools(): { names: Set<string>; source: string } {
  const roots = [join(REPO, 'node_modules', '@playwright', 'mcp')];
  const caches = [process.env.LOCALAPPDATA === undefined ? '' : join(process.env.LOCALAPPDATA, 'npm-cache'), join(homedir(), '.npm')].filter((p) => p !== '');
  for (const cache of caches) {
    const npx = join(cache, '_npx');
    if (existsSync(npx)) for (const dir of readdirSync(npx)) roots.push(join(npx, dir, 'node_modules', '@playwright', 'mcp'));
  }
  for (const root of roots) {
    const pkg = join(root, 'package.json');
    if (!existsSync(pkg) || !existsSync(join(root, 'README.md'))) continue;
    if ((JSON.parse(readFileSync(pkg, 'utf8')) as { version: string }).version !== '0.0.85') continue;
    const names = [...readFileSync(join(root, 'README.md'), 'utf8').matchAll(/^\s*- \*\*(browser_[a-z_]+)\*\*/gm)].map((m) => m[1] as string);
    if (names.length > 0) return { names: new Set(names), source: 'README of the installed @playwright/mcp 0.0.85' };
  }
  const record = read('docs', 'kiro-log.md') + read('docs', 'acceptance', 'paired-comparison-and-release.md');
  return { names: new Set([...record.matchAll(/\b(browser_[a-z_]+)\b/g)].map((m) => m[1] as string)), source: 'agent session record of 2026-11-17 in docs/' };
}

describe('1 plugin.json', () => {
  const plugin = (): Record<string, unknown> => json<Record<string, unknown>>(...POWER, 'plugin.json');

  it('1.1 has the required fields', () => {
    const p = plugin();
    expect(p.$schema).toBe('https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
    expect(p.name).toBe('rehearsal');
    expect(p.version).toBe('0.1.0');
    expect(typeof p.description).toBe('string');
    expect((p.description as string).length).toBeGreaterThan(20);
    expect((p.author as { name?: unknown }).name).toBe('Rehearsal');
    const keywords = p.keywords as string[];
    expect(Array.isArray(keywords)).toBe(true);
    expect(keywords.length).toBeGreaterThanOrEqual(6);
    for (const word of keywords) expect(word.trim()).not.toBe('');
  });

  it('1.2 has a kebab case name and a version below 1.0.0', () => {
    const p = plugin();
    expect(p.name as string).toMatch(NAME);
    expect(p.version as string).toMatch(/^0\.\d+\.\d+$/);
  });

  it('1.3 names no other project, prize or budget, and has no dash between words', () => {
    for (const file of [read(...POWER, 'plugin.json'), read(...POWER, 'mcp.json'), read(...POWER, 'README.md'), read(...SKILL)]) {
      expect(file).not.toMatch(OTHER_PROJECTS);
    }
    expect(String(plugin().description)).not.toMatch(DASH_BETWEEN_WORDS);
  });
});

describe('2 mcp.json', () => {
  const mcp = (): McpFile => json<McpFile>(...POWER, 'mcp.json');
  const workspace = (): McpFile => json<McpFile>('.kiro', 'settings', 'mcp.json');

  it('2.1 holds the playwright server exactly as .kiro/settings/mcp.json starts it', () => {
    const own = mcp().mcpServers.playwright;
    const theirs = workspace().mcpServers.playwright;
    expect(own).toBeDefined();
    expect(own?.command).toBe(theirs?.command);
    expect(own?.args).toEqual(theirs?.args);
    expect(own?.args).toEqual(['/c', 'npx', '-y', '@playwright/mcp@0.0.85', '--headless', '--isolated']);
  });

  it('2.2 holds no drive path and no user name', () => {
    const raw = read(...POWER, 'mcp.json');
    expect(raw).not.toMatch(/(^|[^A-Za-z])[A-Za-z]:[\\/]/);
    expect(raw).not.toMatch(/adria/i);
    expect(raw).not.toContain(homedir());
  });
});

describe('3 the skill simulation-rules', () => {
  const body = (): string => read(...SKILL);

  it('3.1 has front matter with name and description, and at most 120 lines', () => {
    const front = /^---\n([\s\S]*?)\n---\n/.exec(body());
    expect(front).not.toBeNull();
    expect(front?.[1]).toMatch(/^name: simulation-rules$/m);
    expect(front?.[1]).toMatch(/^description: .{20,}/m);
    expect(body().split('\n').length).toBeLessThanOrEqual(120);
  });

  // The sentences live in src/ui/plan/AssumptionsPanel.tsx (ASSUMPTIONS, LIMITS_TEXT), src/ui/game/GameViewPanel.tsx (LEGEND)
  // and src/comparison/labels.ts (RANGE_LABEL).
  it('3.2 states every model limit sentence exactly as the app shows it', () => {
    expect(ASSUMPTIONS.length).toBe(8);
    for (const line of ASSUMPTIONS) expect(body(), line).toContain(line);
    expect(body()).toContain(LIMITS_TEXT);
    expect(body()).toContain(legend());
    expect(body()).toContain(RANGE_LABEL);
    expect(body()).toContain('Stale, rerun');
  });

  it('3.3 covers units, determinism and the claims policy', () => {
    const text = body();
    expect(text).toMatch(/millisecond/i);
    expect(text).toMatch(/seconds/i);
    expect(text).toMatch(/same seed/i);
    expect(text).toMatch(/Math\.random|wall clock/i);
    expect(text).toMatch(/draws/i);
    expect(text).toMatch(/not a forecast/i);
    expect(text).toMatch(/fictional/i);
    expect(text).toMatch(/recommend/i);
  });

  it('3.4 names the real buttons and regions of the app in its recipe', () => {
    const text = body();
    const sources = read('src', 'ui', 'landing', 'Landing.tsx') + read('src', 'ui', 'run', 'RunPanel.tsx') + read('src', 'ui', 'ScreenTabs.tsx') + read('src', 'ui', 'compare', 'PickScenarios.tsx') + read('src', 'ui', 'compare', 'CompareScreen.tsx');
    for (const label of ['Try the community fair', 'Simulate', 'Compare', 'Run comparison', 'Headline']) {
      expect(sources, `${label} in src/ui`).toContain(label);
      expect(text, label).toContain(label);
    }
    // The pick buttons read `Use as <side>: <title>` until chosen and `<Side>: <title>` after. Read the template, then require the
    // recipe to name the label the button has when it is clicked. On first opening Compare the current tab (the baseline plan) is the
    // candidate and the first other tab (extra check-in staff) is the baseline, so neither wanted pick is chosen yet.
    const pick = read('src', 'ui', 'compare', 'PickScenarios.tsx');
    const labelOf = (side: 'baseline' | 'candidate', chosen: boolean, title: string): string => {
      const m = pick.match(new RegExp('aria-label=\\{`\\$\\{' + side + 'Key === key \\? \'([^\']+)\' : \'([^\']+)\'\\}: \\$\\{scenario\\.title\\}`\\}'));
      expect(m, `aria-label template of the ${side} pick button`).not.toBeNull();
      return `${chosen ? (m as RegExpMatchArray)[1] : (m as RegExpMatchArray)[2]}: ${title}`;
    };
    const baselineTitle = 'Harbor Hall Community Fair: baseline';
    const candidateTitle = 'Harbor Hall Community Fair: extra check-in staff';
    const baselineLabel = labelOf('baseline', false, baselineTitle);
    const candidateLabel = labelOf('candidate', false, candidateTitle);
    expect(baselineLabel).toBe(`Use as baseline: ${baselineTitle}`);
    expect(candidateLabel).toBe(`Use as candidate: ${candidateTitle}`);
    expect(text).toContain('`' + baselineLabel + '`');
    expect(text).toContain('`' + candidateLabel + '`');
    expect(text).not.toContain('`Baseline: ' + baselineTitle + '`');
    expect(text).not.toContain('`Candidate: ' + candidateTitle + '`');    for (const title of ['baseline', 'extra check-in staff']) {
      expect(read('public', 'examples', 'harbor-hall', title === 'baseline' ? 'baseline.json' : 'plus-one-checkin.json')).toContain(`Harbor Hall Community Fair: ${title}`);
    }
  });

  it('3.5 uses only Playwright tool names that @playwright/mcp 0.0.85 offers', () => {
    const used = [...new Set([...body().matchAll(/`(browser_[a-z_]+)`/g)].map((m) => m[1] as string))];
    const { names, source } = playwrightTools();
    expect(names.size, `tool names from: ${source}`).toBeGreaterThan(5);
    expect(used.length).toBeGreaterThanOrEqual(4);
    for (const name of used) expect(names.has(name), `${name} (checked against: ${source})`).toBe(true);
  });

  it('3.6 has no dash between words', () => {
    expect(body()).not.toMatch(DASH_BETWEEN_WORDS);
  });
});

describe('4 the README of the power', () => {
  const readme = (): string => read(...POWER, 'README.md');

  it('4.1 names the install and uninstall commands', () => {
    expect(readme()).toContain('kiro-cli powers install power/rehearsal');
    expect(readme()).toContain('kiro-cli powers uninstall rehearsal');
  });

  it('4.2 names what it needs, how to use it and its limits', () => {
    expect(readme()).toMatch(/Node 22\.12 or later/);
    expect(readme()).toMatch(/network/i);
    expect(readme()).toMatch(/npx/);
    expect(readme()).toMatch(/^## Use$/m);
    expect(readme()).toMatch(/^## Limits$/m);
    expect(readme()).toMatch(/not a forecast/i);
  });

  it('4.3 has no dash between words', () => {
    expect(readme()).not.toMatch(DASH_BETWEEN_WORDS);
  });
});

describe('5 the custom agent rehearsal-playwright', () => {
  type Agent = { name: string; tools: string[]; allowedTools?: string[]; permissions?: { rules?: { capability: string; match?: string[]; effect: string }[] } };
  const agent = (): Agent => json<Agent>('.kiro', 'agents', 'rehearsal-playwright.json');

  it('5.1 parses and names only the @playwright server in tools and allowedTools', () => {
    const a = agent();
    expect(a.name).toBe('rehearsal-playwright');
    expect(a.tools).toEqual(['@playwright']);
    expect(a.allowedTools).toEqual(['@playwright']);
  });

  it('5.2 uses a server that exists in .kiro/settings/mcp.json', () => {
    expect(Object.keys(json<McpFile>('.kiro', 'settings', 'mcp.json').mcpServers)).toContain('playwright');
  });

  it('5.3 has no write, edit or shell tool or permission', () => {
    const a = agent();
    const bad = /^(write|fs_write|fs_append|edit|str_replace|shell|bash|execute_bash|execute_pwsh|execute|delete|code|\*|@\*|@builtin)$/i;
    for (const tool of [...a.tools, ...(a.allowedTools ?? [])]) expect(tool, tool).not.toMatch(bad);
    for (const rule of a.permissions?.rules ?? []) {
      expect(['mcp', 'fs_read'], `capability ${rule.capability}`).toContain(rule.capability);
      for (const m of rule.match ?? []) expect(m, 'match').not.toMatch(/^\*$/);
    }
  });
});
