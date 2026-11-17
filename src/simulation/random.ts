function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}
export type Generator = () => number; // uniform in [0, 1)

export function createGenerator(key: string): Generator {
  return notImplemented('createGenerator');
}

export function serviceKey(baseSeed: string, replication: number, attendeeId: string, stationId: string): string {
  return notImplemented('serviceKey');
}

export function arrivalKey(baseSeed: string, replication: number, attendeeId: string): string {
  return notImplemented('arrivalKey');
}