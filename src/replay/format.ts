// Trace timestamps: 'mm:ss.mmm' from integer milliseconds. Used for trace times only; metric values go through formatMetricValue.

export function formatTimestamp(ms: number): string {
  const whole = Math.max(0, Math.round(ms));
  const minutes = Math.floor(whole / 60_000);
  const seconds = Math.floor((whole % 60_000) / 1000);
  const millis = whole % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/** 'mm:ss' (whole seconds, rounded down) for the readout, the queue inspector and the follow announcements. */
export function formatMinutesSeconds(ms: number): string {
  const whole = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}
