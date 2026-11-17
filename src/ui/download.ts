// Browser downloads from text the generators produced. Nothing is uploaded: the text becomes a Blob URL that the anchor
// click saves and that is revoked straight away.

/** `<title-slug>-<hash8>.<extension>`: lowercase ASCII words joined by hyphens, then the first 8 hex of the scenario hash. */
export function exportFileName(title: string, hash: string, extension: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'scenario';
  return `${slug}-${hash.slice(0, 8)}.${extension}`;
}

export function downloadText(fileName: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}