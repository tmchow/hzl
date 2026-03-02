import { describe, it, expect } from 'vitest';
import { formatDuration, formatTimeAgo } from './format-duration.js';

describe('formatDuration', () => {
  it('returns "just now" for < 1 minute', () => {
    expect(formatDuration(30_000)).toBe('just now');
  });

  it('returns minutes', () => {
    expect(formatDuration(5 * 60_000)).toBe('5m');
  });

  it('returns hours and minutes', () => {
    expect(formatDuration(90 * 60_000)).toBe('1h 30m');
  });

  it('returns hours only when even', () => {
    expect(formatDuration(2 * 60 * 60_000)).toBe('2h');
  });
});

describe('formatTimeAgo', () => {
  it('formats ISO timestamp as relative duration', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatTimeAgo(fiveMinAgo)).toBe('5m');
  });
});
