import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FOLDERS = ['src/ui', 'src/replay', 'src/imports', 'src/storage'];
const FORBIDDEN = ['dangerouslySetInnerHTML', 'innerHTML', 'insertAdjacentHTML', 'outerHTML', 'document.write'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}

describe('9.5 every label, ID and message is a text node', () => {
  it('finds source files to scan', () => {
    expect(FOLDERS.flatMap(files).length).toBeGreaterThan(10);
  });

  it.each(FORBIDDEN)('no file under src/ui, src/replay, src/imports or src/storage uses %s', (api) => {
    const hits = FOLDERS.flatMap(files).filter((file) => readFileSync(file, 'utf8').includes(api));
    expect(hits).toEqual([]);
  });
});
