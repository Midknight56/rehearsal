// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameView, forceRendererFailure } from '../../src/replay/gameView';
import { loadTraceFixture } from './generators';

const options = { reducedMotion: false, test: true, dpr: 1 };
const input = () => {
  const f = loadTraceFixture('three-people');
  return { trace: f.trace, layout: f.layout, stations: f.stations, label: 'three people' };
};

// jsdom has no canvas implementation and prints a notice when getContext is called; the stub says what jsdom would answer.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  forceRendererFailure(false);
  vi.restoreAllMocks();
});

describe('fallback without a canvas (requirement 6.8)', () => {
  it('reports no-context where the document has no graphics context (jsdom), and the sampler-only handle works', async () => {
    const container = document.createElement('div');
    const result = await createGameView({ container, ...options });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(['no-context', 'init-failed']).toContain(result.reason);
    expect(result.message.length).toBeGreaterThan(0);
    expect(container.querySelector('canvas')).toBeNull();

    const clocks: [number, boolean][] = [];
    result.sampler.onClock((ms, playing) => clocks.push([ms, playing]));
    result.sampler.load(input());
    result.sampler.seek(3500);
    const sample = result.sampler.sampleNow();
    expect(sample.tMs).toBe(3500);
    expect(sample.attendees.find((a) => a.id === 'a#0001')?.phase).toBe('waiting');
    result.sampler.step(1000);
    expect(result.sampler.sampleNow().tMs).toBe(4500);
    result.sampler.step(-1000);
    expect(result.sampler.sampleNow().tMs).toBe(3500);
    expect(clocks[clocks.length - 1]).toEqual([3500, false]);
  });

  it('a forced failure reports reason forced and creates nothing', async () => {
    forceRendererFailure(true);
    const container = document.createElement('div');
    const result = await createGameView({ container, ...options });
    expect(result).toMatchObject({ ok: false, reason: 'forced' });
    expect(container.children).toHaveLength(0);
  });

  it('?renderer=off in the test build forces the same failure', async () => {
    window.history.replaceState(null, '', '/?renderer=off');
    const result = await createGameView({ container: document.createElement('div'), ...options });
    window.history.replaceState(null, '', '/');
    expect(result).toMatchObject({ ok: false, reason: 'forced' });
  });

  it('seeks and steps are clamped to the trace and the sampler holds no timer', async () => {
    forceRendererFailure(true);
    const result = await createGameView({ container: document.createElement('div'), ...options });
    if (result.ok) throw new Error('expected the fallback');
    const timers = vi.spyOn(globalThis, 'setInterval');
    result.sampler.load(input());
    result.sampler.seek(-5);
    expect(result.sampler.sampleNow().tMs).toBe(0);
    result.sampler.seek(999_999);
    expect(result.sampler.sampleNow().tMs).toBe(13_500);
    expect(timers).not.toHaveBeenCalled();
  });
});
