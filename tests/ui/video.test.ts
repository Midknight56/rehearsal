import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SEGMENTS, buildManifest } from '../video/manifest';

// Task 20, requirement 13: the capture scripts, their own config and the manifest. The scripts themselves need a browser and
// a build; this file checks everything that does not.
describe('13 storyboard capture setup', () => {
  it('names the five segments of the storyboard, in order', () => {
    expect([...SEGMENTS]).toEqual(['import', 'game-view', 'extra-staff', 'floor-plan', 'variation-and-print']);
  });

  it('npm run test:video uses the video config and nothing else', () => {
    const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['test:video']).toBe('playwright test --config playwright.video.config.ts');
  });

  it('the video config records at 1,280 x 720, headless, with BASE_URL as the target and a local server only without it', () => {
    const config = readFileSync('playwright.video.config.ts', 'utf8');
    expect(existsSync('playwright.video.config.ts')).toBe(true);
    expect(config).toMatch(/testDir:\s*'tests\/video'/);
    expect(config).toMatch(/headless:\s*true/);
    expect(config).toMatch(/viewport:\s*{\s*width:\s*1280,\s*height:\s*720\s*}/);
    expect(config).toMatch(/video:\s*{\s*mode:\s*'on',\s*size:\s*{\s*width:\s*1280,\s*height:\s*720\s*}\s*}/);
    expect(config).toContain('process.env.BASE_URL');
    for (const port of ['4173', '4174', '4373', '4374', '4473', '4474']) expect(config).not.toContain(port);
  });

  it('keeps the captured clips out of the repository', () => {
    expect(readFileSync('.gitignore', 'utf8').split(/\r?\n/)).toContain('tests/video/out/');
  });

  it('writes no narration, overlay or number of its own into the page', () => {
    const spec = readFileSync('tests/video/storyboard.spec.ts', 'utf8');
    expect(spec).not.toMatch(/addStyleTag|addScriptTag|insertAdjacentHTML|innerHTML|document\.createElement/);
  });
});

describe('buildManifest', () => {
  const parts = SEGMENTS.map((segment, i) => ({ segment, file: `${segment}.webm`, durationMs: 1000 * (i + 1) }));

  it('lists each segment with its file, duration and the commit hash', () => {
    const manifest = buildManifest(parts, { commit: 'abc1234', baseUrl: 'https://example.invalid/' });
    expect(manifest.commit).toBe('abc1234');
    expect(manifest.baseUrl).toBe('https://example.invalid/');
    expect(manifest.segments.map((s) => s.segment)).toEqual([...SEGMENTS]);
    expect(manifest.segments[2]).toEqual({ segment: 'extra-staff', file: 'extra-staff.webm', durationMs: 3000 });
  });

  it('orders by the storyboard whatever order the parts arrive in and refuses a missing segment', () => {
    const shuffled = [...parts].reverse();
    expect(buildManifest(shuffled, { commit: 'c', baseUrl: 'u' }).segments.map((s) => s.segment)).toEqual([...SEGMENTS]);
    expect(() => buildManifest(parts.slice(1), { commit: 'c', baseUrl: 'u' })).toThrow('missing segment: import');
  });
});
