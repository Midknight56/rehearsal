function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}
export type LineEntry = { attendeeId: string; queueJoinMs: number };

export class Line {
  constructor() {
    notImplemented('Line');
  }
  insert(entry: LineEntry): number {
    return notImplemented('Line.insert');
  }
  shift(): LineEntry | undefined {
    return notImplemented('Line.shift');
  }
  get length(): number {
    return notImplemented('Line.length');
  }
  entries(): readonly LineEntry[] {
    return notImplemented('Line.entries');
  }
}