import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// 5.6 and 6.3: the UI never runs the simulation. Only these values may be imported from the engine folders.
const ALLOWED: Record<string, string[]> = {
  'src/domain/validate.ts': ['validateScenario', 'MESSAGES'],
  'src/domain/hash.ts': ['scenarioHash'],
  'src/domain/limits.ts': ['LIMITS'],
  'src/simulation/version.ts': ['MODEL_VERSION'],
  'src/simulation/metrics.ts': ['formatMetricValue'],
  'src/spatial/path-cache.ts': ['createPathCache', 'describeNode'],
  'src/workers/client.ts': ['createSimulationClient'],
};
const ENGINE = ['src/simulation', 'src/workers', 'src/domain', 'src/spatial'];
const SCANNED = ['src/ui', 'src/replay', 'src/imports', 'src/storage'];
const NO_VALUE_IMPORTS = ['src/replay/clock.ts', 'src/replay/camera.ts'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}

type ValueImport = { file: string; target: string; names: string[] };

function valueImports(file: string): ValueImport[] {
  const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const found: ValueImport[] = [];
  for (const match of source.matchAll(/^\s*(import|export)\s+(type\s+)?([^;]*?)\s+from\s+['"]([^'"]+)['"]/gms)) {
    if (match[2] !== undefined) continue;
    const spec = match[4] as string;
    if (!spec.startsWith('.')) continue;
    const resolved = normalize(join(dirname(file), spec)).split(sep).join('/');
    if (!ENGINE.some((e) => resolved === e || resolved.startsWith(`${e}/`))) continue;
    const braces = /\{([^}]*)\}/.exec(match[3] as string);
    const names = (braces?.[1] ?? '').split(',').map((n) => n.trim()).filter((n) => n !== '' && !n.startsWith('type '));
    const namespace = /\*\s+as\s+\w+/.test(match[3] as string) || (braces === null && !/^\s*\{/.test(match[3] as string));
    found.push({ file, target: `${resolved}.ts`, names: namespace ? ['*'] : names });
  }
  return found;
}

describe('5.6 and 6.3 value imports from the engine folders', () => {
  const all = SCANNED.flatMap(files);

  it('scans the UI, replay, import and storage sources', () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it('imports only the allowed values (everything else must be import type)', () => {
    const violations = all.flatMap(valueImports).flatMap((imp) => {
      const allowed = ALLOWED[imp.target] ?? [];
      return imp.names.filter((n) => !allowed.includes(n)).map((n) => `${imp.file} imports ${n} from ${imp.target}`);
    });
    expect(violations).toEqual([]);
  });

  it.each(NO_VALUE_IMPORTS)('%s imports no value from the engine folders at all (I6)', (file) => {
    expect(valueImports(file)).toEqual([]);
  });

  it('the checker sees a value import', () => {
    const source = "import { simulate } from '../../src/simulation/simulate';";
    const match = /^\s*(import|export)\s+(type\s+)?([^;]*?)\s+from\s+['"]([^'"]+)['"]/ms.exec(source);
    expect(match?.[2]).toBeUndefined();
    expect(match?.[3]).toContain('simulate');
  });
});
