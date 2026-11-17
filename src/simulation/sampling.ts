import type { Scenario, Service } from '../domain/scenario';
function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}
export function triangular(u: number, a: number, c: number, b: number): number {
  return notImplemented('triangular');
}

export function serviceDurationMs(service: Service, draw: () => number): number {
  return notImplemented('serviceDurationMs');
}

export function compileServiceSampler(scenario: Scenario, replication: number): (attendeeId: string, stationId: string) => number {
  return notImplemented('compileServiceSampler');
}