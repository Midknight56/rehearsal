// The manifest of the storyboard clips (requirement 13.3): one entry per segment in storyboard order, the commit hash of the
// build that was recorded and the address it was recorded from. Pure; the spec writes the file.
export const SEGMENTS = ['import', 'game-view', 'extra-staff', 'floor-plan', 'variation-and-print'] as const;
export type Segment = (typeof SEGMENTS)[number];

export type ClipPart = { segment: Segment; file: string; durationMs: number };
export type Manifest = { commit: string; baseUrl: string; segments: ClipPart[] };

export function buildManifest(parts: ClipPart[], source: { commit: string; baseUrl: string }): Manifest {
  const segments = SEGMENTS.map((segment) => {
    const part = parts.find((p) => p.segment === segment);
    if (part === undefined) throw new Error(`missing segment: ${segment}`);
    return { segment, file: part.file, durationMs: part.durationMs };
  });
  return { commit: source.commit, baseUrl: source.baseUrl, segments };
}
