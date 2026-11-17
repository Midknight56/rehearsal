import { describe, expect, it } from 'vitest';
import { parseDecimal, parseWhole } from '../../src/imports/numbers';

describe('parseDecimal (requirement 1.4)', () => {
  it.each([
    ['1.5', 1.5],
    [' 7 ', 7],
    ['+3', 3],
    ['.5', 0.5],
    ['-5', -5],
    ['10.', 10],
    ['0', 0],
  ])('accepts %j as %d', (text, value) => {
    expect(parseDecimal(text)).toEqual({ ok: true, value });
  });

  it.each(['1e3', '1,200', '10%', 'NaN', 'Infinity', '∞', '', '   ', '1 2', '--1', '0x10', '١٢'])('rejects %j', (text) => {
    expect(parseDecimal(text)).toEqual({ ok: false });
  });

  it('returns a finite number for every accepted text', () => {
    const huge = `1${'0'.repeat(400)}`;
    expect(parseDecimal(huge)).toEqual({ ok: false });
  });
});

describe('parseWhole (requirement 1.4)', () => {
  it.each(['1.5', '2.0001', '0.5'])('rejects the fraction %j', (text) => {
    expect(parseWhole(text)).toEqual({ ok: false });
  });

  it.each([
    ['120', 120],
    [' 3 ', 3],
    ['-5', -5],
    ['+2', 2],
  ])('accepts %j as %d', (text, value) => {
    expect(parseWhole(text)).toEqual({ ok: true, value });
  });

  it.each(['two', '', '1e3', 'NaN'])('rejects %j', (text) => {
    expect(parseWhole(text)).toEqual({ ok: false });
  });
});
