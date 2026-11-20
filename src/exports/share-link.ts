// Share link builder (spec share-link, requirements 1.3 and 1.4). The link is the app address, then `#plan=v1.`, then the
// base64url text of the deflate-raw compressed UTF-8 JSON of the scenario: the same scenario `Export JSON` writes, no results.
// Compression is the browser's own CompressionStream; nothing is sent anywhere.
import type { Scenario } from '../domain/scenario';

export const SHARE_LINK_MAX_CHARS = 6000;
export const SHARE_PREFIX = '#plan=v1.';
export const SHARE_COPIED_TEXT = 'Share link copied';
export const SHARE_TOO_LARGE_TEXT = 'This plan is too large to share as a link. Save it as a JSON file instead.';
export const SHARE_COPY_FAILED_TEXT = 'The share link could not be copied. Save the plan as a JSON file instead.';

export type ShareLinkResult = { ok: true; url: string } | { ok: false; code: 'TOO_LARGE' };

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A one chunk readable stream. Blob.stream() is not used because some test environments lack it. */
export function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array<ArrayBuffer>> {
  return new ReadableStream<Uint8Array<ArrayBuffer>>({ start(controller) { controller.enqueue(bytes as Uint8Array<ArrayBuffer>); controller.close(); } });
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = streamOf(bytes).pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** `base` is the app address without a hash (origin, path and query). The 6,000 characters count the whole link. */
export async function buildShareLink(scenario: Scenario, base: string): Promise<ShareLinkResult> {
  const compressed = await deflateRaw(new TextEncoder().encode(JSON.stringify(scenario)));
  const url = `${base}${SHARE_PREFIX}${toBase64Url(compressed)}`;
  return url.length > SHARE_LINK_MAX_CHARS ? { ok: false, code: 'TOO_LARGE' } : { ok: true, url };
}
