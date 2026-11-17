// The three example fetches of the community fair (requirement 10.2). They are the app's own files under examples/.
import type { Scenario } from '../../domain/scenario';
import { validateScenario } from '../../domain/validate';

export type LoadExampleResult = { ok: true; scenarios: Scenario[]; tabKeys: string[] } | { ok: false; message: string };

/** The example file stems, which are also the tab keys of the three Harbor Hall tabs. */
export const EXAMPLE_STEMS = ['baseline', 'plus-one-checkin', 'shorter-route'] as const;

export async function loadExample(fetchImpl: typeof fetch, baseUrl: string): Promise<LoadExampleResult> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const failure = (detail: string): LoadExampleResult => ({
    ok: false,
    message: `The community fair example could not be loaded (${detail}). Reload the page, or import a spreadsheet.`,
  });
  try {
    const responses = await Promise.all(EXAMPLE_STEMS.map((stem) => fetchImpl(`${base}examples/harbor-hall/${stem}.json`)));
    const bad = responses.find((r) => r.status !== 200);
    if (bad !== undefined) return failure(String(bad.status));
    const scenarios: Scenario[] = [];
    for (const response of responses) {
      const result = validateScenario(await response.json());
      if (!result.ok) return failure('ValidationError');
      scenarios.push(result.scenario);
    }
    return { ok: true, scenarios, tabKeys: [...EXAMPLE_STEMS] };
  } catch (error) {
    return failure(error instanceof Error ? error.name : 'Error');
  }
}
