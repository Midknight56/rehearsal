import { describe, expect, it } from 'vitest';
import { validateScenario } from '../../src/domain/validate';
import { attendeeId, compileAttendees, evenArrivalMs, uniformArrivalMs } from '../../src/simulation/arrivals';
import { scenario } from './helpers/build-scenario';

const doors = (arrivals: 'even' | 'uniform') => ({ id: 'doors', startMs: 0, endMs: 1_200_000, count: 120, arrivals, route: [] });

describe('row 8: arrival compilation', () => {
  it('even arrivals fall at (j + 0.5) * 10,000 ms with ids doors#0000 to doors#0119', () => {
    const attendees = compileAttendees(scenario({ horizonMs: 1_200_000, cohorts: [doors('even')] }), 0);
    expect(attendees).toHaveLength(120);
    attendees.forEach((a, j) => expect(a.arrivalMs).toBe((j + 0.5) * 10_000));
    expect(attendees[0]?.arrivalMs).toBe(5_000);
    expect(attendees[119]?.arrivalMs).toBe(1_195_000);
    expect(attendees[0]?.id).toBe('doors#0000');
    expect(attendees[119]?.id).toBe('doors#0119');
    expect(attendeeId('doors', 7)).toBe('doors#0007');
  });

  it('a single attendee in [0, 1) arrives at 0', () => {
    expect(evenArrivalMs(0, 1, 1, 0)).toBe(0);
  });

  it('uniform arrivals with draws 0 and 0.999999 stay inside the band', () => {
    expect(uniformArrivalMs(1_000, 2_000, 0)).toBe(1_000);
    expect(uniformArrivalMs(1_000, 2_000, 0.999999)).toBe(1_999);
  });

  it('two overlapping cohorts validate', () => {
    const result = validateScenario(
      scenario({
        horizonMs: 1_200_000,
        cohorts: [
          { id: 'early', startMs: 0, endMs: 600_000, count: 10, arrivals: 'even', route: [] },
          { id: 'late', startMs: 300_000, endMs: 900_000, count: 10, arrivals: 'uniform', route: [] },
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });
});