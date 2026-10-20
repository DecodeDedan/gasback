import { describe, expect, test } from 'bun:test';
import { formatGwei, parseGweiInput } from './format';
import { splitDigits } from '../components/Meter';

describe('parseGweiInput', () => {
  test('converts whole and decimal gwei to wei', () => {
    expect(parseGweiInput('70')).toBe(70_000_000_000n);
    expect(parseGweiInput(' 23.5 ')).toBe(23_500_000_000n);
  });

  test('rejects text a person might type by mistake instead of throwing', () => {
    expect(parseGweiInput('')).toBeNull();
    expect(parseGweiInput('70 gwei')).toBeNull();
    expect(parseGweiInput('-1')).toBeNull();
    expect(parseGweiInput('1e9')).toBeNull();
  });
});

describe('formatGwei', () => {
  test('shows two decimals at most', () => {
    expect(formatGwei(69_496_970_000n)).toBe('69.49');
    expect(formatGwei(70_000_000_000n)).toBe('70');
  });
});

describe('splitDigits (pump meter)', () => {
  test('dims leading zeros of a sub-cent amount', () => {
    expect(splitDigits('$0.001240')).toEqual({ lead: '$0.00', core: '124', tail: '0' });
  });

  test('dims trailing padding of a whole amount', () => {
    expect(splitDigits('$5.000000')).toEqual({ lead: '$', core: '5.', tail: '000000' });
  });

  test('keeps one lit zero for an all-zero amount', () => {
    expect(splitDigits('$0.000000')).toEqual({ lead: '$0.00000', core: '0', tail: '' });
  });
});
