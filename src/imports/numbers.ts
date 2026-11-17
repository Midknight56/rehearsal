// Decimal parsing (requirement 1.4). Text is trimmed, matched against the pattern, then converted with Number().
export type ParsedNumber = { ok: true; value: number } | { ok: false };

const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/** Accepts `1.5`, ` 7 `, `+3`, `.5`; rejects blank, `1e3`, `1,200`, `10%`, `NaN`, `Infinity` and anything not finite. */
export function parseDecimal(text: string): ParsedNumber {
  const trimmed = text.trim();
  if (!DECIMAL.test(trimmed)) return { ok: false };
  const value = Number(trimmed);
  return Number.isFinite(value) ? { ok: true, value } : { ok: false };
}

/** A decimal that is also a whole number (no fraction part). */
export function parseWhole(text: string): ParsedNumber {
  const parsed = parseDecimal(text);
  return parsed.ok && Number.isInteger(parsed.value) ? parsed : { ok: false };
}

/** True when min <= value <= max. */
export function parseRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}
