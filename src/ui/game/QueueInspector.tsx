// Queue inspector (requirement 7.5): a table captioned `<label> at mm:ss`, read from the sampler at the clock time,
// never from the sprites, so it works with the canvas stopped or unavailable.
import type { ReactElement } from 'react';
import { formatMinutesSeconds } from '../../replay/format';
import type { StationSample } from '../../replay/sampler';

export function QueueInspector(props: { stationLabel: string | null; clockMs: number; sample: StationSample | null }): ReactElement {
  if (props.stationLabel === null || props.sample === null) {
    return <p className="muted">Select a station marker or use Inspect in the stations table to read its queue.</p>;
  }
  const s = props.sample;
  const lines = [
    `Waiting: ${s.waiting}`,
    `In service: ${s.inService} of ${s.servers} servers`,
    `Next service ends at ${s.nextServiceEndMs === null ? 'n/a' : formatMinutesSeconds(s.nextServiceEndMs)}`,
    `Longest current wait: ${formatMinutesSeconds(s.longestWaitMs)}`,
  ];
  return (
    <div className="table-scroll">
      <table>
        <caption>{`${props.stationLabel} at ${formatMinutesSeconds(props.clockMs)}`}</caption>
        <thead>
          <tr>
            <th scope="col">Queue at this time</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line}>
              <td>{line}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}