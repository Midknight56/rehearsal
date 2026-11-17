import { describe, expect, it } from 'vitest';
import {
  COMPLETE_TEXT, PER_PERSON_OFF, RANGE_LABEL, REPLAY_NOTE, SAVE_REASONS, STALE_TEXT, changesHeader, countSentence,
  loadingReplicationText, progressText, replayLabel, restoredSummaryText, saveErrorText, timingText,
} from '../../src/comparison/labels';
import { REPLICATIONS, REPLICATION_INDICES } from '../../src/comparison/paired';

describe('labels', () => {
  it('has the fixed strings', () => {
    expect(RANGE_LABEL).toBe('variation across these simulated runs');
    expect(REPLAY_NOTE).toBe('This replay is one example run; the comparison numbers come from all 30.');
    expect(STALE_TEXT).toBe('Stale, rerun');
    expect(PER_PERSON_OFF).toBe('Per-person comparison is off because the attendee populations differ.');
    expect(COMPLETE_TEXT).toBe('30 of 30 paired runs complete');
    expect(REPLICATIONS).toBe(30);
    expect(REPLICATION_INDICES).toHaveLength(30);
    expect(REPLICATION_INDICES[29]).toBe(29);
  });

  it('renders each template exactly', () => {
    expect(replayLabel(0)).toBe('Replay of replication 0, one example run');
    expect(replayLabel(7)).toBe('Replay of replication 7, one example run');
    expect(progressText(12, 62)).toBe('Running paired replications: 12 of 62');
    expect(loadingReplicationText(7)).toBe('Loading replication 7…');
    expect(timingText(1234)).toBe('30 paired runs took 1.2 s on this device');
    expect(restoredSummaryText('2026-11-20T12:00:00.000Z')).toBe('Saved summary from 2026-11-20; rerun to see replications and the replay');
  });

  it('renders the save errors', () => {
    expect(saveErrorText('quota')).toBe('Could not save: storage quota exceeded.');
    expect(saveErrorText('unavailable')).toBe('Could not save: storage is unavailable in this browser.');
    expect(saveErrorText('limit')).toBe('Could not save: 10 saved scenarios already; delete one first.');
    expect(Object.keys(SAVE_REASONS)).toEqual(['quota', 'unavailable', 'limit']);
  });

  it('renders the change header for the three kinds', () => {
    expect(changesHeader('none', 0)).toBe('No assumption differs between these scenarios.');
    expect(changesHeader('single', 1)).toBe('1 change');
    expect(changesHeader('combined', 2)).toBe('2 changes');
  });

  it('renders the count sentence in the three modes', () => {
    const base = { metricLabel: 'mean queue wait', improved: 27, n: 30, baselineCount: 120, candidateCount: 120 };
    expect(countSentence({ ...base, direction: 'lower', languageMode: 'person-for-person' })).toBe(
      'Candidate had lower mean queue wait in 27 of 30 runs; the same simulated attendees and random draws were used in both.',
    );
    expect(countSentence({ ...base, direction: 'higher', candidateCount: 130, languageMode: 'population' })).toBe(
      'Candidate had higher mean queue wait in 27 of 30 runs; the attendee populations differ (120 vs 130 people), so this compares groups, not the same people.',
    );
    expect(countSentence({ ...base, metricLabel: 'staff-hours', direction: 'none', improved: null, languageMode: 'person-for-person' })).toBe(
      'No better direction is defined for staff-hours; read the values.',
    );
  });
});
