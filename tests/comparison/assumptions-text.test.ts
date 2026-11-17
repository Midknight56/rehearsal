import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASSUMPTIONS, FORBIDDEN_BADGE_WORDS, LIMITS_TEXT, NOT_A_FORECAST, modelVersionLine } from '../../src/exports/assumptions-text';
import { escapeHtml } from '../../src/exports/html-escape';
import { ASSUMPTIONS as PANEL_ASSUMPTIONS, LIMITS_TEXT as PANEL_LIMITS_TEXT } from '../../src/ui/plan/AssumptionsPanel';

describe('fixed assumption text (requirement 8.8)', () => {
  it('has the eight lines of the assumptions panel, in order', () => {
    expect(ASSUMPTIONS).toHaveLength(8);
    expect([...ASSUMPTIONS]).toEqual([...PANEL_ASSUMPTIONS]);
  });

  it('has the limits sentence of the panel and of requirement 8.8, verbatim', () => {
    expect(LIMITS_TEXT).toBe(PANEL_LIMITS_TEXT);
    const requirements = readFileSync('.kiro/specs/paired-comparison-and-release/requirements.md', 'utf8');
    const quoted = /`(Limits: at most 5,000 attendees[^`]*)`/.exec(requirements);
    expect(quoted).not.toBeNull();
    expect(LIMITS_TEXT).toBe(quoted![1]);
  });

  it('has the forecast phrase and the six badge words of requirement 8.4', () => {
    expect(NOT_A_FORECAST).toBe('Scenario results, not a forecast.');
    expect([...FORBIDDEN_BADGE_WORDS]).toEqual(['optimized', 'optimised', 'optimal', 'safe', 'certified', 'recommended']);
  });

  it('writes the model version line', () => {
    expect(modelVersionLine()).toBe('Model version 0.1.0');
    expect(modelVersionLine('0.2.0')).toBe('Model version 0.2.0');
  });
});

describe('escapeHtml', () => {
  it('escapes the five characters', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
    expect(escapeHtml('plain text')).toBe('plain text');
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });
});
