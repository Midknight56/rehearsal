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
export type Limits = {
  readonly maxAttendees: number; readonly maxStations: number; readonly maxRouteVisits: number;
  readonly maxCols: number; readonly maxRows: number; readonly maxHorizonMs: number;
  readonly minServers: number; readonly maxServers: number; readonly maxServiceSeconds: number;
  readonly maxIdLength: number; readonly maxSeedLength: number;
};
export const LIMITS: Limits = notImplementedValue<Limits>('LIMITS');
export const DRAIN_CAP_MS = 7_200_000;