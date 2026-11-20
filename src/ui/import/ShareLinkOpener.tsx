// Opens a plan from a share link (spec share-link, requirements 2 and 3). Mounted once by App. It reads location.hash on mount
// and on hashchange, clears the hash before any async work (so a second mount under StrictMode finds nothing and a reload does
// not open the plan again), decodes in this browser, and then opens the plan, shows the review dialog Open JSON uses when the
// parser has warnings, or sets the status region. It makes no request.
import { useEffect, useState, type ReactElement } from 'react';
import { readShareLink } from '../../imports/shareLink';
import type { OpenJsonResult } from '../../imports/scenarioJson';
import type { EditorStore } from '../state/store';
import { ReviewDialog } from './ReviewDialog';

type Plan = Extract<OpenJsonResult, { ok: true }>;

export function ShareLinkOpener({ store }: { store: EditorStore }): ReactElement {
  const [pending, setPending] = useState<Plan | null>(null);

  useEffect(() => {
    const open = (plan: Plan): void => {
      store.dispatch({ type: 'scenario/open', scenario: plan.scenario });
      store.dispatch({ type: 'screen/set', screen: 'plan' });
      store.setStatus(`Opened "${plan.scenario.title}".`);
    };
    const check = (): void => {
      const { hash, pathname, search } = window.location;
      if (!hash.startsWith('#plan=')) return;
      window.history.replaceState(window.history.state, '', `${pathname}${search}`);
      void readShareLink(hash).then((read) => {
        if (read === null) return;
        if (!read.ok) store.setStatus(read.message);
        else if (read.warnings.length > 0) setPending(read);
        else open(read);
      }, () => store.setStatus('This share link is damaged, so no plan was opened. Ask for a new link, or open a JSON file.'));
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, [store]);

  const confirm = (): void => {
    if (pending === null) return;
    store.dispatch({ type: 'scenario/open', scenario: pending.scenario });
    store.dispatch({ type: 'screen/set', screen: 'plan' });
    store.setStatus(`Opened "${pending.scenario.title}".`);
    setPending(null);
  };

  return <ReviewDialog result={pending} heading="Review the shared plan" onOpen={confirm} onCancel={() => setPending(null)} />;
}
