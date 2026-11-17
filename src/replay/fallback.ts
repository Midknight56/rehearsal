// The game view without a canvas (requirement 6.8): the failure result carries a sampler-only handle, so the scrubber, the
// step controls, the person timeline and the queue inspector keep working from the sampler and no result is cleared.
import type { ReplayCore } from './core';
import type { CreateGameViewResult, SamplerOnly } from './gameView';

export function samplerOnly(core: ReplayCore): SamplerOnly {
  return { load: core.load, seek: core.seek, step: core.step, sampleNow: core.sampleNow, onClock: core.onClock };
}

export function failed(core: ReplayCore, reason: 'init-failed' | 'no-context' | 'forced', message: string): CreateGameViewResult {
  return { ok: false, reason, message, sampler: samplerOnly(core) };
}
