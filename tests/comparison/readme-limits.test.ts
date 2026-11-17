import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASSUMPTIONS, LIMITS_TEXT, NOT_A_FORECAST, modelVersionLine } from '../../src/exports/assumptions-text';

// Requirement 11.2: the README's `## Model limits` section carries the fixed strings verbatim, and `## Privacy`
// exists only while a release report in docs/acceptance/ holds the line `network-inspection: pass`.
const readme = readFileSync('README.md', 'utf8');

function section(heading: string): string | null {
  const start = readme.indexOf(`\n${heading}\n`);
  if (start < 0) return null;
  const body = readme.slice(start + heading.length + 2);
  const next = body.search(/\n## /);
  return next < 0 ? body : body.slice(0, next);
}

function networkInspectionPassed(): boolean {
  const dir = 'docs/acceptance';
  if (!existsSync(dir)) return false;
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .some((name) => /^network-inspection: pass$/m.test(readFileSync(`${dir}/${name}`, 'utf8')));
}

describe('README model limits (requirement 11.2)', () => {
  const limits = section('## Model limits');

  it('has a Model limits section', () => {
    expect(limits).not.toBeNull();
  });

  it('carries every ASSUMPTIONS line verbatim', () => {
    expect(ASSUMPTIONS).toHaveLength(8);
    for (const line of ASSUMPTIONS) expect(limits).toContain(line);
  });

  it('carries LIMITS_TEXT, the model version line and NOT_A_FORECAST verbatim', () => {
    expect(limits).toContain(LIMITS_TEXT);
    expect(limits).toContain(modelVersionLine());
    expect(limits).toContain(NOT_A_FORECAST);
  });

  it('says results are scenario results and not a forecast, outside the section too', () => {
    expect(readme).toContain(NOT_A_FORECAST);
  });

  it('says the app was not tested with users, since no walkthrough is logged', () => {
    expect(readme).toMatch(/not tested with users/);
  });

  it('lists the three commands', () => {
    for (const command of ['npm ci', 'npm run verify', 'npm run test:e2e']) expect(readme).toContain(command);
  });

  it('has the criteria block under the description, the five criteria in the rules order', () => {
    const at = readme.indexOf('\n## Judging criteria at a glance\n');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(readme.indexOf('\n## Commands\n'));
    const names = ['Potential Impact', 'Technological Implementation', 'Design', 'Innovation/Idea', 'Presentation'];
    const positions = names.map((n) => readme.indexOf(`\n**${n}.**`));
    expect(positions.every((p) => p > at)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe('README privacy statement (requirement 11.2)', () => {
  it('has a Privacy section only when a release report records network-inspection: pass', () => {
    expect(section('## Privacy') !== null).toBe(networkInspectionPassed());
  });

  it('never claims the longer privacy sentence without that report', () => {
    if (!networkInspectionPassed()) expect(readme).not.toMatch(/no account and nothing uploaded/);
  });
});
