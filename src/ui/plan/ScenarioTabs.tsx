// One tab per open scenario, labelled with its title. Switching tabs never touches another tab's results or history.
import type { ReactElement } from 'react';
import type { EditorStore } from '../state/store';
import { useEditorState } from '../state/useEditorState';

export function ScenarioTabs({ store }: { store: EditorStore }): ReactElement {
  const state = useEditorState(store);
  return (
    <nav aria-label="Scenarios">
      <ul className="tabs">
        {state.scenarios.map((scenario, index) => {
          const key = state.tabKeys[index] ?? scenario.id;
          return (
            <li key={key}>
              <button
                type="button"
                data-testid={`scenario-tab-${key}`}
                aria-current={index === state.currentIndex ? 'true' : undefined}
                onClick={() => store.dispatch({ type: 'scenario/select-tab', index })}
              >
                {scenario.title}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
