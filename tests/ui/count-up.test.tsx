// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COUNT_UP_MS, CountUpSentence, countUpText } from '../../src/ui/compare/CountUpSentence';
import { splitHeadlineNumber } from '../../src/ui/compare/headline';

const SENTENCE = 'Mean queue wait drops by 297.4 s.';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('splitting the headline around its number', () => {
  it('finds the number and keeps the words around it', () => {
    expect(splitHeadlineNumber(SENTENCE)).toEqual({ before: 'Mean queue wait drops by ', number: '297.4', after: ' s.' });
  });
  it('finds nothing in a sentence without a number', () => {
    expect(splitHeadlineNumber('Mean queue wait does not change.')).toBeNull();
  });
});

describe('the count up value (600 ms, ease-out)', () => {
  it('starts at 0.0 and ends on exactly the real value', () => {
    expect(COUNT_UP_MS).toBe(600);
    expect(countUpText('297.4', 0)).toBe('0.0');
    expect(countUpText('297.4', 600)).toBe('297.4');
    expect(countUpText('297.4', 9999)).toBe('297.4');
    expect(countUpText('12', 600)).toBe('12');
  });
  it('is past half way at half the time and never above the end value', () => {
    const half = Number(countUpText('297.4', 300));
    expect(half).toBeGreaterThan(297.4 / 2);
    expect(half).toBeLessThan(297.4);
  });
  it('keeps the decimals of the real value', () => {
    expect(countUpText('2.50', 0)).toBe('0.00');
    expect(countUpText('2.50', 600)).toBe('2.50');
  });
});

describe('the headline sentence on screen', () => {
  it('counts up in an aria-hidden element while the real sentence is the accessible text, then settles on the plain sentence', () => {
    const { container } = render(<CountUpSentence text={SENTENCE} reduced={false} className="headline-text" />);
    const p = container.querySelector('p') as HTMLElement;
    const moving = p.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(moving).not.toBeNull();
    expect(moving.textContent).toContain('0.0');
    // The only text a screen reader gets is the final sentence, at once.
    const readable = [...p.children].filter((c) => c.getAttribute('aria-hidden') !== 'true').map((c) => c.textContent).join('');
    expect(readable).toBe(SENTENCE);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    const midway = Number((p.querySelector('[aria-hidden="true"] .count') as HTMLElement).textContent);
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(297.4);
    expect(p.textContent).toContain(SENTENCE);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(p.querySelector('[aria-hidden]')).toBeNull();
    expect(p.textContent).toBe(SENTENCE);
  });

  it('under reduced motion shows the final sentence at once with no moving element and no timer', () => {
    const { container } = render(<CountUpSentence text={SENTENCE} reduced className="headline-text" />);
    const p = container.querySelector('p') as HTMLElement;
    expect(p.textContent).toBe(SENTENCE);
    expect(p.querySelector('[aria-hidden]')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows a sentence with no number as it is', () => {
    const { container } = render(<CountUpSentence text="Mean queue wait does not change." reduced={false} className="headline-text" />);
    expect(container.querySelector('p')?.textContent).toBe('Mean queue wait does not change.');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops its timer when it settles and when it unmounts', () => {
    const view = render(<CountUpSentence text={SENTENCE} reduced={false} className="headline-text" />);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(vi.getTimerCount()).toBe(0);
    const again = render(<CountUpSentence text="Mean queue wait rises by 12.3 s." reduced={false} className="headline-text" />);
    again.unmount();
    expect(vi.getTimerCount()).toBe(0);
    view.unmount();
  });

  it('restarts from zero when the value changes', () => {
    const view = render(<CountUpSentence text={SENTENCE} reduced={false} className="headline-text" />);
    act(() => {
      vi.advanceTimersByTime(700);
    });
    view.rerender(<CountUpSentence text="Mean queue wait drops by 12.0 s." reduced={false} className="headline-text" />);
    expect(view.container.querySelector('[aria-hidden="true"] .count')?.textContent).toBe('0.0');
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(view.container.querySelector('p')?.textContent).toBe('Mean queue wait drops by 12.0 s.');
  });
});
