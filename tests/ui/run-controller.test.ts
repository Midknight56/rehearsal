import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scenarioHash } from '../../src/domain/hash';
import type { Scenario } from '../../src/domain/scenario';
import { simulate } from '../../src/simulation/simulate';
import { createPathCache, describeNode } from '../../src/spatial/path-cache';
import { createRunController } from '../../src/ui/run/controller';
import type { EditorAction } from '../../src/ui/state/types';
import { createFakePort } from './fakePort';
import { harborHall } from './generators';

const setup = () => {
  const port = createFakePort();
  const actions: EditorAction[] = [];
  const controller = createRunController(port, (a) => actions.push(a), { pathCache: createPathCache, describe: describeNode });
  return { port, actions, controller, of: (type: string) => actions.filter((a) => a.type === type) };
};
const resultOf = async (scenario: Scenario) => simulate(scenario, 0, { trace: false, scenarioHash: await scenarioHash(scenario) });
const ring = () => JSON.parse(readFileSync('tests/imports/fixtures/layout-ring-30-4.json', 'utf8')) as Scenario['layout'];
const walled = (id: string): Scenario => {
  const { baseline } = harborHall();
  return { ...baseline, layout: ring(), stations: baseline.stations.map((s) => (s.id === id ? { ...s, cell: [30, 4] as [number, number] } : s)) };
};

describe('5.1 start', () => {
  it('calls run(snapshot, [0], { trace: true }) once and dispatches run/started with the handle runId', () => {
    const { port, actions, controller } = setup();
    const { baseline } = harborHall();
    const runId = controller.start(baseline, 'h1', 0);
    expect(port.runs).toHaveLength(1);
    expect(port.last().scenario).toBe(baseline);
    expect(port.last().replications).toEqual([0]);
    expect(port.last().options.trace).toBe(true);
    expect(runId).toBe(port.last().handle.runId);
    expect(actions).toContainEqual({ type: 'run/started', runId, tabIndex: 0 });
    expect(controller.activeRunId()).toBe(runId);
  });

  it('dispatches progress and a matching result of the active handle, then finished', async () => {
    const { port, of, controller } = setup();
    const { baseline } = harborHall();
    const hash = await scenarioHash(baseline);
    const runId = controller.start(baseline, hash, 2) as number;
    port.last().emitProgress(0, 1);
    port.last().emitResult(await resultOf(baseline));
    port.last().resolve({ status: 'complete', results: [] });
    await port.last().handle.done;
    expect(of('run/progress')).toEqual([{ type: 'run/progress', runId, done: 0, total: 1 }]);
    expect(of('run/result')).toHaveLength(1);
    expect(of('run/result')[0]).toMatchObject({ runId, tabIndex: 2, hash, snapshot: baseline });
    expect(of('run/finished')).toEqual([{ type: 'run/finished', runId, outcome: 'complete' }]);
    expect(controller.activeRunId()).toBeNull();
  });
});

describe('5.3 cancel', () => {
  it.each(['Simulation cancelled.', 'Simulation cancelled. The simulation worker did not respond within 250 ms and was restarted.'])(
    'shows the adapter message verbatim: %s',
    async (message) => {
      const { port, of, controller } = setup();
      const runId = controller.start(harborHall().baseline, 'h', 0) as number;
      controller.cancel();
      expect(port.cancelCalls).toBe(1);
      expect(of('run/cancelling')).toEqual([{ type: 'run/cancelling', runId }]);
      port.runs[0]?.resolve({ status: 'cancelled', message });
      await port.runs[0]?.handle.done;
      expect(of('run/finished')).toEqual([{ type: 'run/finished', runId, outcome: { cancelled: message } }]);
    },
  );

  it('does nothing when no run is active and keeps no timer', () => {
    const { port, actions, controller } = setup();
    controller.cancel();
    expect(port.cancelCalls).toBe(0);
    expect(actions).toEqual([]);
  });
});

describe('5.4 late callbacks (matrix row 17, UI side; I5, P8)', () => {
  it('drops a late onResult, onProgress and done from run 1 while run 2 completes normally', async () => {
    const { port, of, controller } = setup();
    const { baseline } = harborHall();
    const hash = await scenarioHash(baseline);
    controller.start(baseline, hash, 0);
    controller.cancel();
    port.runs[0]?.resolve({ status: 'cancelled', message: 'Simulation cancelled.' });
    await port.runs[0]?.handle.done;
    const run2 = controller.start(baseline, hash, 0) as number;
    const before = actions(of);
    port.runs[0]?.emitResult(await resultOf(baseline));
    port.runs[0]?.emitProgress(1, 1);
    port.runs[0]?.resolve({ status: 'complete', results: [] });
    expect(actions(of)).toEqual(before);
    port.runs[1]?.emitResult(await resultOf(baseline));
    port.runs[1]?.resolve({ status: 'complete', results: [] });
    await port.runs[1]?.handle.done;
    expect(of('run/result')).toHaveLength(1);
    expect(of('run/result')[0]).toMatchObject({ runId: run2 });
    expect(of('run/finished').filter((a) => (a as { runId: number }).runId === run2)).toHaveLength(1);
  });

  it('drops an onResult whose scenarioHash differs from the snapshot hash', async () => {
    const { port, of, controller } = setup();
    const { baseline, plusOne } = harborHall();
    controller.start(baseline, await scenarioHash(baseline), 0);
    port.last().emitResult(await resultOf(plusOne));
    expect(of('run/result')).toHaveLength(0);
  });
});

function actions(of: (type: string) => EditorAction[]): EditorAction[] {
  return ['run/result', 'run/progress', 'run/finished'].flatMap((t) => of(t));
}

describe('4.4 blocked routes', () => {
  it('requests nothing and reports the first segment in route order', () => {
    const { port, of, controller } = setup();
    expect(controller.start(walled('packs'), 'h', 0)).toBeNull();
    expect(port.runs).toHaveLength(0);
    expect(of('run/blocked')).toEqual([
      { type: 'run/blocked', message: 'Run blocked: no path from Check-in desk (checkin) to Welcome packs (packs). Clear a corridor on the floor plan or move a station.' },
    ]);
  });

  it('names the entrance for the first segment', () => {
    const { of, controller } = setup();
    controller.start(walled('checkin'), 'h', 0);
    expect(of('run/blocked')).toEqual([
      { type: 'run/blocked', message: 'Run blocked: no path from the entrance (0, 12) to Check-in desk (checkin). Clear a corridor on the floor plan or move a station.' },
    ]);
  });
});

describe('4.5 run errors', () => {
  it('reports an error outcome through run/finished with the adapter message', async () => {
    const { port, of, controller } = setup();
    const runId = controller.start(harborHall().baseline, 'h', 0) as number;
    port.last().resolve({ status: 'error', message: 'Simulation failed: boom' });
    await port.last().handle.done;
    expect(of('run/finished')).toEqual([{ type: 'run/finished', runId, outcome: { error: 'Simulation failed: boom' } }]);
  });
});
