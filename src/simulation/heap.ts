function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}
function notImplementedValue<T extends object>(name: string): T {
  return new Proxy({} as T, {
    get: () => notImplemented(name),
    has: () => notImplemented(name),
    ownKeys: () => notImplemented(name),
  });
}
export type EventKind = 'service-complete' | 'movement-arrival' | 'external-arrival';
export const KIND_PRIORITY: Record<EventKind, 0 | 1 | 2> = notImplementedValue<Record<EventKind, 0 | 1 | 2>>('KIND_PRIORITY');
export type NodeRef = { kind: 'entrance' } | { kind: 'exit' } | { kind: 'station'; id: string };
export type SimEvent = {
  timeMs: number; kind: EventKind; attendeeId: string; sequence: number;
  stationId?: string; server?: number; // service-complete
  node?: NodeRef; pathId?: number; // movement-arrival
};

export function compareEvents(a: SimEvent, b: SimEvent): number {
  return notImplemented('compareEvents');
}

export class EventHeap {
  constructor() {
    notImplemented('EventHeap');
  }
  push(event: Omit<SimEvent, 'sequence'>): void {
    return notImplemented('EventHeap.push');
  }
  pop(): SimEvent | undefined {
    return notImplemented('EventHeap.pop');
  }
  peek(): SimEvent | undefined {
    return notImplemented('EventHeap.peek');
  }
  size(): number {
    return notImplemented('EventHeap.size');
  }
}