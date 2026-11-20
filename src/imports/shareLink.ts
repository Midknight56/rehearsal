// Share link reader (spec share-link, requirements 2.1 and 3). Decodes the hash part, inflates it with a 2 MiB cap and hands
// the text to parseScenarioExport, so validation, warnings and messages are the ones Open JSON has. It never throws and
// never makes a request.
import { scenarioHash } from '../domain/hash';
import { SHARE_LINK_MAX_CHARS, streamOf } from '../exports/share-link';
import { EXPORT_MAX_BYTES, parseScenarioExport } from '../exports/scenario-json';
import type { OpenJsonResult } from './scenarioJson';

export type ReadShareLinkResult = OpenJsonResult | { ok: false; code: 'DAMAGED' | 'WRONG_VERSION'; message: string };

const START = '#plan=';
const DAMAGED: ReadShareLinkResult = { ok: false, code: 'DAMAGED', message: 'This share link is damaged, so no plan was opened. Ask for a new link, or open a JSON file.' };
const WRONG_VERSION: ReadShareLinkResult = { ok: false, code: 'WRONG_VERSION', message: 'This share link was made by a different version of Rehearsal, so no plan was opened.' };

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Inflates raw deflate bytes; returns null when the stream is invalid or yields more than EXPORT_MAX_BYTES. */
async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const reader = streamOf(bytes).pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > EXPORT_MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  } catch {
    return null;
  }
}

/** `null` when the hash is not a plan link, so other hashes are left alone. */
export async function readShareLink(hash: string): Promise<ReadShareLinkResult | null> {
  if (!hash.startsWith(START)) return null;
  if (hash.length > SHARE_LINK_MAX_CHARS) return DAMAGED;
  const rest = hash.slice(START.length);
  const dot = rest.indexOf('.');
  if (dot < 0) return DAMAGED;
  if (rest.slice(0, dot) !== 'v1') return WRONG_VERSION;
  const payload = rest.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || payload.length % 4 === 1) return DAMAGED;
  let text: string;
  try {
    const inflated = await inflateRaw(fromBase64Url(payload));
    if (inflated === null) return DAMAGED;
    text = new TextDecoder('utf-8', { fatal: true }).decode(inflated);
  } catch {
    return DAMAGED;
  }
  const parsed = await parseScenarioExport(text);
  if (!parsed.ok) return { ...parsed, message: `This share link holds a plan Rehearsal cannot open: ${parsed.message}` };
  return { ...parsed, hash: await scenarioHash(parsed.scenario) };
}
