// Person timeline (requirement 7.4): one row per trace event of the selected attendee, from the sampler's timelineOf.
// The first column is the event, the second its time (mm:ss.mmm) or, for a walk, the walking duration in parentheses.
import type { KeyboardEvent, ReactElement } from 'react';
import type { TimelineRow } from '../../replay/sampler';

export function PersonTimeline(props: { attendeeId: string | null; rows: TimelineRow[]; onKeyDown?: (e: KeyboardEvent<HTMLTableElement>) => void }): ReactElement {
  if (props.attendeeId === null) {
    return <p className="muted">Choose an attendee in Find attendee, or click a sprite, to read the timeline.</p>;
  }
  return (
    <div className="table-scroll">
      <table tabIndex={props.onKeyDown === undefined ? undefined : -1} onKeyDown={props.onKeyDown} data-testid="person-timeline">
        <caption>{`Timeline of ${props.attendeeId}`}</caption>
        <thead>
          <tr>
            <th scope="col">Event</th>
            <th scope="col">Time or walking duration (mm:ss.mmm)</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, i) => (
            <tr key={`${row.tMs}-${i}`}>
              <td>{row.label}</td>
              <td>{row.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}