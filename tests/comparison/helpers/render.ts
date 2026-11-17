import type { Scenario } from '../../../src/domain/scenario';
import { scenarioHash } from '../../../src/domain/hash';
import { FORBIDDEN_BADGE_WORDS } from '../../../src/exports/assumptions-text';

export const generatedAt = '2026-11-20T12:00:00.000Z';

export function hashOf(scenario: Scenario): Promise<string> {
  return scenarioHash(scenario);
}

export const forbiddenMarkup = /<script|<canvas|<iframe|<link|<img|<object|\son[a-z]+=|javascript:/i;
export const badgeWords = new RegExp(`\\b(${FORBIDDEN_BADGE_WORDS.join('|')})\\b`, 'i');
