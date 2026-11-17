import { escapeHtml } from './html-escape';

/** The one inline stylesheet of both printable documents (design: Printable comparison and run sheet). */
export const PRINT_STYLE = [
  '@page { margin: 12mm }',
  'body { font: 10pt/1.3 system-ui, sans-serif; max-width: 180mm; margin: 0 auto }',
  'h1 { font-size: 16pt; margin: 0 0 2pt }',
  'h2 { font-size: 11pt; margin: 6pt 0 2pt }',
  'p { margin: 2pt 0 }',
  'ul, ol { margin: 2pt 0; padding-left: 14pt }',
  '#assumptions { font-size: 9pt }',
  'table { width: 100%; border-collapse: collapse }',
  'th, td { border: 1px solid #999; padding: 2pt 4pt; text-align: left }',
  'thead { display: table-header-group }',
  'tr, #stations { page-break-inside: avoid }',
  '.population { border: 2pt solid #000; font-weight: bold; padding: 4pt }',
  '.muted { color: #333 }',
  '@media print { a { color: inherit; text-decoration: none } }',
].join('\n');

/** A complete HTML document with one inline style. `title` is escaped here; `body` must already be escaped markup. */
export function htmlDocument(title: string, body: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>\n${PRINT_STYLE}\n</style>`,
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** `<tag>` around escaped text. */
export const el = (tag: string, text: string, attributes = ''): string => `<${tag}${attributes}>${escapeHtml(text)}</${tag}>`;
