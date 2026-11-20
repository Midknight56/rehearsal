// Share link codec (spec share-link, requirements 1.3, 1.4, 2.1, 3.1 to 3.3). Node environment, no network.
import { describe, expect, it } from 'vitest';
import { scenarioHash } from '../../src/domain/hash';
import type { Scenario } from '../../src/domain/scenario';
import { validateScenario } from '../../src/domain/validate';
import { SHARE_LINK_MAX_CHARS, SHARE_PREFIX, buildShareLink } from '../../src/exports/share-link';
import { readShareLink } from '../../src/imports/shareLink';
import { harborHall } from '../ui/generators';
import { bigScenario } from '../ui/shareFixtures';

const BASE = 'https://example.org/rehearsal/?lang=en';

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const base64url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');
async function fragmentOf(text: string): Promise<string> {
  return `${SHARE_PREFIX}${base64url(await deflateRaw(new TextEncoder().encode(text)))}`;
}
const hashPart = (url: string): string => url.slice(url.indexOf('#'));

describe('buildShareLink', () => {
  it('builds base + #plan=v1. + base64url text, within 6,000 characters, and reads back to the same scenario', async () => {
    const { baseline } = harborHall();
    const built = await buildShareLink(baseline, BASE);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    console.log(`Harbor Hall baseline share link: ${built.url.length} characters`);
    expect(built.url.startsWith(`${BASE}${SHARE_PREFIX}`)).toBe(true);
    expect(built.url.length).toBeLessThanOrEqual(SHARE_LINK_MAX_CHARS);
    expect(built.url.slice(`${BASE}${SHARE_PREFIX}`.length)).toMatch(/^[A-Za-z0-9_-]+$/);
    const read = await readShareLink(hashPart(built.url));
    expect(read).not.toBeNull();
    expect(read?.ok).toBe(true);
    if (read === null || !read.ok) return;
    expect(read.scenario).toEqual(baseline);
    expect(read.hash).toBe(await scenarioHash(baseline));
    expect(read.results).toEqual([]);
    expect(read.warnings).toEqual([]);
  });

  it('keeps markup, quotes and non Latin text verbatim', async () => {
    const baseline = harborHall().baseline;
    const first = baseline.stations[0]!;
    const edited: Scenario = { ...baseline, title: 'FÃªte <b>"plan"</b> æ—¥æœ¬', stations: [{ ...first, label: '<script>alert(1)</script>' }, ...baseline.stations.slice(1)] };
    const built = await buildShareLink(edited, BASE);
    if (!built.ok) throw new Error('expected a link');
    const read = await readShareLink(hashPart(built.url));
    if (read === null || !read.ok) throw new Error('expected a plan');
    expect(read.scenario.title).toBe('FÃªte <b>"plan"</b> æ—¥æœ¬');
    expect(read.scenario.stations[0]?.label).toBe('<script>alert(1)</script>');
  });

  it('refuses a plan whose link would be over 6,000 characters in all', async () => {
    const big = bigScenario();
    expect(validateScenario(big).ok).toBe(true);
    const built = await buildShareLink(big, BASE);
    expect(built).toEqual({ ok: false, code: 'TOO_LARGE' });
  });

  it('counts the app address in the 6,000 characters', async () => {
    const { baseline } = harborHall();
    const short = await buildShareLink(baseline, BASE);
    if (!short.ok) throw new Error('expected a link');
    const payloadLength = short.url.length - BASE.length;
    const longBase = `https://example.org/${'a'.repeat(SHARE_LINK_MAX_CHARS - payloadLength - 20 + 1)}`;
    expect(longBase.length + payloadLength).toBeGreaterThan(SHARE_LINK_MAX_CHARS);
    expect(await buildShareLink(baseline, longBase)).toEqual({ ok: false, code: 'TOO_LARGE' });
  });
});

describe('readShareLink', () => {
  it('ignores every hash that is not a plan link', async () => {
    for (const hash of ['', '#', '#top', '#plan', '#planet=v1.abc', '#/plan=v1.abc', '#other=#plan=v1.abc']) {
      expect(await readShareLink(hash), hash).toBeNull();
    }
  });

  it('calls damaged text damaged, and never throws', async () => {
    const { baseline } = harborHall();
    const built = await buildShareLink(baseline, BASE);
    if (!built.ok) throw new Error('expected a link');
    const good = hashPart(built.url);
    const cases = ['#plan=v1.', '#plan=v1.@@@@', '#plan=v1.AAAA', '#plan=nodot', good.slice(0, Math.floor(good.length / 2)), `${good}!`, `#plan=v1.${'A'.repeat(SHARE_LINK_MAX_CHARS)}`];
    for (const hash of cases) {
      const read = await readShareLink(hash);
      expect(read?.ok, hash.slice(0, 40)).toBe(false);
      if (read !== null && !read.ok) {
        expect(read.code, hash.slice(0, 40)).toBe('DAMAGED');
        expect(read.message).toBe('This share link is damaged, so no plan was opened. Ask for a new link, or open a JSON file.');
      }
    }
  });

  it('refuses text that inflates to more than 2 MiB while the link itself is short', async () => {
    const zeros = new Uint8Array(3 * 1_048_576);
    const fragment = `${SHARE_PREFIX}${base64url(await deflateRaw(zeros))}`;
    expect(fragment.length).toBeLessThan(SHARE_LINK_MAX_CHARS);
    const read = await readShareLink(fragment);
    expect(read).toMatchObject({ ok: false, code: 'DAMAGED' });
  });

  it('says a different version tag is a different version', async () => {
    const read = await readShareLink('#plan=v2.AAAA');
    expect(read).toEqual({ ok: false, code: 'WRONG_VERSION', message: 'This share link was made by a different version of Rehearsal, so no plan was opened.' });
  });

  it('passes the parser message through for content that is not a plan', async () => {
    const notJson = await readShareLink(await fragmentOf('hello'));
    expect(notJson).toMatchObject({ ok: false, code: 'NOT_JSON' });
    if (notJson !== null && !notJson.ok) expect(notJson.message).toBe('This share link holds a plan Rehearsal cannot open: This file is not valid JSON.');
    const notPlan = await readShareLink(await fragmentOf('{"a":1}'));
    expect(notPlan).toMatchObject({ ok: false, code: 'NOT_A_SCENARIO_EXPORT' });
    if (notPlan !== null && !notPlan.ok) expect(notPlan.message.startsWith('This share link holds a plan Rehearsal cannot open: ')).toBe(true);
    const invalid = await readShareLink(await fragmentOf(JSON.stringify({ ...harborHall().baseline, layout: { ...harborHall().baseline.layout, cols: 0 } })));
    expect(invalid).toMatchObject({ ok: false, code: 'SCENARIO_INVALID' });
  });

  it('keeps the parser warnings, such as a model version difference', async () => {
    const old = { ...harborHall().baseline, modelVersion: '0.0.1' };
    const read = await readShareLink(await fragmentOf(JSON.stringify(old)));
    expect(read?.ok).toBe(true);
    if (read !== null && read.ok) expect(read.warnings.map((w) => w.code)).toContain('MODEL_VERSION_MISMATCH');
  });
});
