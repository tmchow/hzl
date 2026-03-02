import { describe, it, expect } from 'vitest';
import { formatDuration } from './format';

describe('formatDuration', () => {
  it('returns zeroLabel for negative values', () => {
    expect(formatDuration(-1)).toBe('just now');
    expect(formatDuration(-1000)).toBe('just now');
  });

  it('returns zeroLabel for zero', () => {
    expect(formatDuration(0)).toBe('just now');
  });

  it('returns zeroLabel for sub-minute values', () => {
    expect(formatDuration(30_000)).toBe('just now');
    expect(formatDuration(59_999)).toBe('just now');
  });

  it('returns minutes for values under 1 hour', () => {
    expect(formatDuration(60_000)).toBe('1m');
    expect(formatDuration(300_000)).toBe('5m');
    expect(formatDuration(3_540_000)).toBe('59m');
  });

  it('returns hours only when minutes are zero', () => {
    expect(formatDuration(3_600_000)).toBe('1h');
    expect(formatDuration(7_200_000)).toBe('2h');
  });

  it('returns hours and minutes', () => {
    expect(formatDuration(3_660_000)).toBe('1h 1m');
    expect(formatDuration(7_260_000)).toBe('2h 1m');
  });

  it('supports custom zeroLabel', () => {
    expect(formatDuration(-1, '<1m')).toBe('<1m');
    expect(formatDuration(0, '<1m')).toBe('<1m');
    expect(formatDuration(30_000, 'n/a')).toBe('n/a');
  });
});
