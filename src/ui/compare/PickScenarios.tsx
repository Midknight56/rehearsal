// One baseline toggle and one candidate toggle per open tab (requirement 12.1). aria-pressed carries the state.
import type { ReactElement } from 'react';
import type { EditorStore } from '../state/store';
import { useEditorState } from '../state/useEditorState';

export function PickScenarios({ store }: { store: EditorStore }): ReactElement {
  const state = useEditorState(store);
  const { baselineKey, candidateKey } = state.compare;
  return (
    <div className="pick-scenarios" role="group" aria-label="Scenarios to compare">
      <table>
        <caption>Scenarios to compare</caption>
        <thead>
          <tr>
            <th scope="col">Scenario</th>
            <th scope="col">Baseline</th>
            <th scope="col">Candidate</th>
          </tr>
        </thead>
        <tbody>
          {state.scenarios.map((scenario, index) => {
            const key = state.tabKeys[index] ?? scenario.id;
            return (
              <tr key={key}>
                <th scope="row">{scenario.title}</th>
                <td>
                  <button type="button" data-testid={`pick-baseline-${key}`} aria-pressed={baselineKey === key} aria-label={`Baseline: ${scenario.title}`} onClick={() => store.dispatch({ type: 'compare/pick', side: 'baseline', key })}>
                    {baselineKey === key ? 'Baseline' : 'Use as baseline'}
                  </button>
                </td>
                <td>
                  <button type="button" data-testid={`pick-candidate-${key}`} aria-pressed={candidateKey === key} aria-label={`Candidate: ${scenario.title}`} onClick={() => store.dispatch({ type: 'compare/pick', side: 'candidate', key })}>
                    {candidateKey === key ? 'Candidate' : 'Use as candidate'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}