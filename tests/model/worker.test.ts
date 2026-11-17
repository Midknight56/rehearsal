import { resolve } from 'node:path';
import { build } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { createSimulationClient, type RunOutcome } from '../../src/workers/client';
import type { FromWorker } from '../../src/workers/protocol';
import { createWorkerHandler } from '../../src/workers/simulation.worker';
import { FakeWorkerEnv } from './helpers/fake-worker';
import { scenario } from './helpers/build-scenario';
import { row1Scenario } from './fixtures/rows';

const REPLICATIONS = Array.from({ length: 30 }, (_, i) => i);

function setup() {
  const env = new FakeWorkerEnv();
  const client = createSimulationClient(env.clientDeps);
  return { env, client };
}

describe('row 17 (worker side)', () => {
  it('30 replications post 30 results, and progress messages are at least 200 ms apart', async () => {
    const { env, client } = setup();
    env.yieldStepMs = 100;
    const onResult = vi.fn();
    const outcome = await client.run(row1Scenario, REPLICATIONS, { trace: false, onResult }).done;
    expect(outcome.status).toBe('complete');
    expect(env.posted.filter((p) => p.message.type === 'result')).toHaveLength(30);
    expect(onResult).toHaveBeenCalledTimes(30);
    const progress = env.posted.filter((p) => p.message.type === 'progress').map((p) => p.atMs);
    expect(progress.length).toBeGreaterThan(0);
    for (let i = 1; i < progress.length; i += 1) expect((progress[i] as number) - (progress[i - 1] as number)).toBeGreaterThanOrEqual(200);
  });

  it('a cancel between replications yields cancelled and no later result', async () => {
    const { env, client } = setup();
    const onResult = vi.fn();
    env.onYield = (count) => {
      if (count === 3) client.cancel();
    };
    const outcome = await client.run(row1Scenario, REPLICATIONS, { trace: false, onResult }).done;
    expect(outcome).toEqual({ status: 'cancelled', message: 'Simulation cancelled.' });
    const posted = env.posted.map((p) => p.message.type);
    expect(posted.slice(posted.indexOf('cancelled') + 1)).not.toContain('result');
    expect(onResult.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('a held result released after a new run is discarded', async () => {
    const { env, client } = setup();
    const staleResult = vi.fn();
    env.policy = (direction, message) => (direction === 'fromWorker' && (message as { type: string }).type === 'result' ? 'hold' : 'deliver');
    client.run(row1Scenario, [0], { trace: false, onResult: staleResult });
    await env.settle();
    expect(env.held).toHaveLength(1);
    env.policy = () => 'deliver';
    const fresh = client.run(row1Scenario, [0], { trace: false });
    expect((await fresh.done).status).toBe('complete');
    env.release('fromWorker');
    expect(client.discardedMessages).toBe(1);
    expect(staleResult).not.toHaveBeenCalled();
  });

  it('a dropped cancel terminates the worker at 250 ms and starts a new one', async () => {
    const { env, client } = setup();
    env.policy = (direction, message) => {
      const type = (message as { type: string }).type;
      return direction === 'toWorker' && type === 'run' ? 'hold' : direction === 'toWorker' && type === 'cancel' ? 'drop' : 'deliver';
    };
    const handle = client.run(row1Scenario, REPLICATIONS, { trace: false });
    const first = env.lastWorker;
    client.cancel();
    env.advanceTimers(249);
    expect(first.terminated).toBe(false);
    env.advanceTimers(1);
    expect(first.terminated).toBe(true);
    expect(env.workers).toHaveLength(2);
    expect(await handle.done).toEqual({
      status: 'cancelled',
      message: 'Simulation cancelled. The simulation worker did not respond within 250 ms and was restarted.',
    });
  });

  it('an invalid scenario yields an error and the next run succeeds', async () => {
    const { client } = setup();
    const outcome = await client.run(scenario({ walkSpeedMps: 0 }), [0], { trace: false }).done;
    expect(outcome).toEqual({ status: 'error', message: 'Walking speed must be a positive number of meters per second; got 0.' });
    expect((await client.run(row1Scenario, [0], { trace: false }).done).status).toBe('complete');
  });

  it('error { runId: 0 } resolves the pending run as Malformed worker message and no later result is delivered', async () => {
    const { env, client } = setup();
    const onResult = vi.fn();
    env.policy = (direction) => (direction === 'toWorker' ? 'hold' : 'deliver');
    const handle = client.run(row1Scenario, [0], { trace: false, onResult });
    env.lastWorker.emit({ type: 'error', runId: 0, message: 'Malformed worker message.' });
    expect(await handle.done).toEqual({ status: 'error', message: 'Malformed worker message.' });
    env.policy = () => 'deliver';
    env.release('toWorker');
    await env.settle();
    expect(onResult).not.toHaveBeenCalled();
  });

  it('onerror resolves the pending run, terminates the worker, bumps currentRunId and the next run works', async () => {
    const { env, client } = setup();
    env.policy = (direction) => (direction === 'toWorker' ? 'hold' : 'deliver');
    const handle = client.run(row1Scenario, [0], { trace: false });
    const before = client.currentRunId;
    const dead = env.lastWorker;
    dead.fireError('boom');
    expect(await handle.done).toEqual({ status: 'error', message: 'The simulation worker stopped unexpectedly: boom.' });
    expect(dead.terminated).toBe(true);
    expect(client.currentRunId).toBe(before + 1);
    env.policy = () => 'deliver';
    const next: RunOutcome = await client.run(row1Scenario, [0], { trace: false }).done;
    expect(next.status).toBe('complete');
    expect(env.workers).toHaveLength(2);
  });

  it('onmessageerror resolves with "message could not be delivered"', async () => {
    const { env, client } = setup();
    env.policy = (direction) => (direction === 'toWorker' ? 'hold' : 'deliver');
    const handle = client.run(row1Scenario, [0], { trace: false });
    env.lastWorker.fireMessageError();
    expect(await handle.done).toEqual({ status: 'error', message: 'The simulation worker stopped unexpectedly: message could not be delivered.' });
  });

  it('run(scenario, []) completes at once without posting', async () => {
    const { env, client } = setup();
    const before = client.currentRunId;
    expect(await client.run(row1Scenario, [], { trace: false }).done).toEqual({ status: 'complete', results: [] });
    expect(env.workers.flatMap((w) => w.sent)).toEqual([]);
    expect(client.currentRunId).toBe(before);
  });

  it('a cancel for run 1, a run 3 and a cancel for run 3 delivered before run 1 resumes yield cancelled for both', async () => {
    const { env, client } = setup();
    env.closeGate();
    const run1 = client.run(row1Scenario, [0, 1, 2], { trace: false });
    await env.untilBlockedYields(1);
    client.cancel();
    const run3 = client.run(row1Scenario, [0, 1, 2], { trace: false });
    expect([run1.runId, run3.runId]).toEqual([1, 3]);
    client.cancel();
    env.openGate();
    const [outcome1, outcome3] = await Promise.all([run1.done, run3.done]);
    expect(outcome1.status).toBe('cancelled');
    expect(outcome3.status).toBe('cancelled');
  });

  it('a Vite build of an entry that imports the client contains a chunk for simulation.worker.ts', async () => {
    const output = await build({
      configFile: false,
      logLevel: 'silent',
      root: resolve(import.meta.dirname, '../..'),
      worker: { format: 'es' },
      build: { write: false, rollupOptions: { input: resolve(import.meta.dirname, 'helpers/client-entry.ts') } },
    });
    const outputs = (Array.isArray(output) ? output : [output]).flatMap((entry) => ('output' in entry ? entry.output : []));
    expect(outputs.map((item) => item.fileName).some((name) => name.includes('simulation.worker'))).toBe(true);
  }, 60_000);
});

describe('createWorkerHandler (handler, without the adapter)', () => {
  function harness(yieldStepMs = 0) {
    const posted: { message: FromWorker; atMs: number }[] = [];
    let clock = 0;
    const gates: (() => void)[] = [];
    let holdYields = false;
    const handler = createWorkerHandler((message) => posted.push({ message, atMs: clock }), {
      now: () => clock,
      yieldToLoop: async () => {
        clock += yieldStepMs;
        if (holdYields) await new Promise<void>((resolve) => gates.push(resolve));
      },
    });
    return {
      posted,
      handler,
      types: () => posted.map((p) => p.message.type),
      hold: () => { holdYields = true; },
      release: () => { holdYields = false; gates.splice(0).forEach((open) => open()); },
    };
  }
  const tenAttendees = scenario({ ...row1Scenario, cohorts: [{ id: 'a', startMs: 0, endMs: 100, count: 10, arrivals: 'even', route: ['s'] }] });

  it('handler: 30 replications of a 10-attendee scenario post 30 results and progress at least 200 ms apart', async () => {
    const h = harness(100);
    await h.handler({ type: 'run', runId: 1, scenario: tenAttendees, replications: REPLICATIONS, trace: false });
    expect(h.types().filter((type) => type === 'result')).toHaveLength(30);
    const progress = h.posted.filter((p) => p.message.type === 'progress').map((p) => p.atMs);
    expect(progress.length).toBeGreaterThan(0);
    for (let i = 1; i < progress.length; i += 1) expect(progress[i]! - progress[i - 1]!).toBeGreaterThanOrEqual(200);
    const hashes = new Set(h.posted.flatMap((p) => (p.message.type === 'result' ? [p.message.result.scenarioHash] : [])));
    expect(hashes.size).toBe(1);
  });

  it('handler: a cancel for the active run between replications posts cancelled and nothing after it', async () => {
    const h = harness();
    h.hold();
    const running = h.handler({ type: 'run', runId: 1, scenario: tenAttendees, replications: REPLICATIONS, trace: false });
    for (let i = 0; i < 50 && !h.types().includes('result'); i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    await h.handler({ type: 'cancel', runId: 1 });
    h.release();
    await running;
    const types = h.types();
    expect(types.filter((type) => type === 'cancelled')).toHaveLength(1);
    expect(types.slice(types.indexOf('cancelled') + 1)).toEqual([]);
    expect(types.filter((type) => type === 'result').length).toBeLessThan(30);
  });

  it('handler: an invalid scenario posts the first issue and the next valid run is served', async () => {
    const h = harness();
    await h.handler({ type: 'run', runId: 1, scenario: scenario({ walkSpeedMps: 0 }), replications: [0], trace: false });
    expect(h.posted[0]?.message).toEqual({ type: 'error', runId: 1, message: 'Walking speed must be a positive number of meters per second; got 0.' });
    await h.handler({ type: 'run', runId: 2, scenario: row1Scenario, replications: [0], trace: false });
    expect(h.types()).toContain('result');
  });

  it('handler: a message without a numeric runId posts error runId 0', async () => {
    const h = harness();
    await h.handler({ type: 'run', scenario: row1Scenario });
    await h.handler('nonsense');
    expect(h.posted.map((p) => p.message)).toEqual([
      { type: 'error', runId: 0, message: 'Malformed worker message.' },
      { type: 'error', runId: 0, message: 'Malformed worker message.' },
    ]);
  });

  it('handler: a cancel for run 1, a run 3 and a cancel for run 3 before run 1 resumes acknowledge both', async () => {
    const h = harness();
    h.hold();
    const run1 = h.handler({ type: 'run', runId: 1, scenario: row1Scenario, replications: [0, 1, 2], trace: false });
    for (let i = 0; i < 50 && !h.types().includes('result'); i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    await h.handler({ type: 'cancel', runId: 1 });
    const run3 = h.handler({ type: 'run', runId: 3, scenario: row1Scenario, replications: [0, 1, 2], trace: false });
    await h.handler({ type: 'cancel', runId: 3 });
    h.release();
    await Promise.all([run1, run3]);
    const cancelled = h.posted.flatMap((p) => (p.message.type === 'cancelled' ? [p.message.runId] : []));
    expect(cancelled.sort()).toEqual([1, 3]);
    const lastCancel = h.types().lastIndexOf('cancelled');
    expect(h.types().slice(lastCancel + 1)).toEqual([]);
    expect(h.posted.filter((p) => p.message.type === 'result' && p.message.runId === 3)).toEqual([]);
  });
});
