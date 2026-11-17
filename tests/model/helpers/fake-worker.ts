import { createWorkerHandler } from '../../../src/workers/simulation.worker';
import type { FromWorker } from '../../../src/workers/protocol';
import type { ClientDeps, WorkerLike } from '../../../src/workers/client';

export type Direction = 'toWorker' | 'fromWorker';
export type Policy = 'deliver' | 'hold' | 'drop';
export type Held = { direction: Direction; message: unknown; worker: FakeWorker };

function messageType(message: unknown): string {
  return typeof message === 'object' && message !== null && 'type' in message ? String((message as { type: unknown }).type) : '';
}

/** Shared state for every FakeWorker a client creates: policies, a manual clock, a manual timer queue and a yield gate. */
export class FakeWorkerEnv {
  clock = 1_000;
  /** Milliseconds added to the injected clock at every yieldToLoop. */
  yieldStepMs = 0;
  workers: FakeWorker[] = [];
  held: Held[] = [];
  /** Every message the worker handler posted, with the injected time it was posted at. */
  posted: { message: FromWorker; atMs: number }[] = [];
  policy: (direction: Direction, message: unknown) => Policy = () => 'deliver';
  /** Called after each yield with the number of yields so far; may call client.cancel(). */
  onYield: ((count: number) => void) | null = null;
  yieldCount = 0;
  private gate: { promise: Promise<void>; open: () => void } | null = null;
  blockedYields = 0;
  private timers: { id: number; atMs: number; fn: () => void }[] = [];
  private nextTimerId = 1;
  timerNow = 0;

  readonly deps = {
    now: () => this.clock,
    yieldToLoop: async (): Promise<void> => {
      this.clock += this.yieldStepMs;
      this.yieldCount += 1;
      this.onYield?.(this.yieldCount);
      if (this.gate) {
        this.blockedYields += 1;
        await this.gate.promise;
      } else {
        await Promise.resolve();
      }
    },
  };

  /** Pass to createSimulationClient: workers, setTimeout and clearTimeout are all under the test's control. */
  readonly clientDeps: ClientDeps = {
    createWorker: () => {
      const worker = new FakeWorker(this);
      this.workers.push(worker);
      return worker;
    },
    setTimeout: ((fn: () => void, ms?: number) => {
      const id = this.nextTimerId++;
      this.timers.push({ id, atMs: this.timerNow + (ms ?? 0), fn });
      return id;
    }) as unknown as typeof globalThis.setTimeout,
    clearTimeout: ((id: number) => {
      this.timers = this.timers.filter((timer) => timer.id !== id);
    }) as unknown as typeof globalThis.clearTimeout,
  };

  advanceTimers(ms: number): void {
    this.timerNow += ms;
    const due = this.timers.filter((timer) => timer.atMs <= this.timerNow);
    this.timers = this.timers.filter((timer) => timer.atMs > this.timerNow);
    for (const timer of due) timer.fn();
  }

  closeGate(): void {
    if (this.gate) return;
    let open!: () => void;
    const promise = new Promise<void>((resolve) => {
      open = resolve;
    });
    this.gate = { promise, open };
  }

  openGate(): void {
    this.gate?.open();
    this.gate = null;
    this.blockedYields = 0;
  }

  async untilBlockedYields(count: number): Promise<void> {
    for (let i = 0; i < 1_000 && this.blockedYields < count; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    if (this.blockedYields < count) throw new Error(`worker never blocked ${count} yield(s)`);
  }

  /** Deliver held messages (all of them, or only those of one direction), in the order they were held. */
  release(direction?: Direction): void {
    const batch = this.held.filter((entry) => direction === undefined || entry.direction === direction);
    this.held = this.held.filter((entry) => !batch.includes(entry));
    for (const entry of batch) entry.worker.deliver(entry.direction, entry.message);
  }

  async settle(): Promise<void> {
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.all(this.workers.map((worker) => worker.idle()));
  }

  get lastWorker(): FakeWorker {
    const worker = this.workers[this.workers.length - 1];
    if (!worker) throw new Error('no worker was created');
    return worker;
  }
}

/** A WorkerLike wired to createWorkerHandler. Messages in both directions are cloned, like postMessage does. */
export class FakeWorker implements WorkerLike {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;
  onmessageerror: ((event: unknown) => void) | null = null;
  terminated = false;
  readonly sent: unknown[] = [];
  private readonly handler: (data: unknown) => Promise<void>;
  private running: Promise<void>[] = [];

  constructor(private readonly env: FakeWorkerEnv) {
    this.handler = createWorkerHandler((message) => this.fromWorker(message), env.deps);
  }

  postMessage(message: unknown): void {
    this.sent.push(message);
    this.route('toWorker', structuredClone(message));
  }

  terminate(): void {
    this.terminated = true;
  }

  fireError(message: string): void {
    this.onerror?.({ message });
  }

  fireMessageError(): void {
    this.onmessageerror?.({});
  }

  /** Put a message into the client as if the worker had posted it, bypassing the policy. */
  emit(message: unknown): void {
    this.onmessage?.({ data: structuredClone(message) });
  }

  async idle(): Promise<void> {
    await Promise.all(this.running);
  }

  deliver(direction: Direction, message: unknown): void {
    if (this.terminated) return;
    if (direction === 'toWorker') this.running.push(this.handler(message));
    else this.onmessage?.({ data: message });
  }

  private fromWorker(message: FromWorker): void {
    this.env.posted.push({ message, atMs: this.env.clock });
    this.route('fromWorker', structuredClone(message));
  }

  private route(direction: Direction, message: unknown): void {
    const policy = this.env.policy(direction, message);
    if (policy === 'drop') return;
    if (policy === 'hold') {
      this.env.held.push({ direction, message, worker: this });
      return;
    }
    this.deliver(direction, message);
  }
}

export { messageType };