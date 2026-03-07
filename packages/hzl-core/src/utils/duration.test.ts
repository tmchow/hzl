import { describe, expect, it } from 'vitest';
import { parseDurationToMinutes, normalizeDurationLabel } from './duration.js';

describe('parseDurationToMinutes', () => {
  it('parses bare numbers as minutes', () => {
    expect(parseDurationToMinutes('30')).toBe(30);
    expect(parseDurationToMinutes('0')).toBe(0);
  });

  it('parses minutes suffix', () => {
    expect(parseDurationToMinutes('30m')).toBe(30);
    expect(parseDurationToMinutes('0m')).toBe(0);
  });

  it('parses hours suffix', () => {
    expect(parseDurationToMinutes('2h')).toBe(120);
    expect(parseDurationToMinutes('1h')).toBe(60);
  });

  it('parses days suffix', () => {
    expect(parseDurationToMinutes('7d')).toBe(7 * 24 * 60);
    expect(parseDurationToMinutes('1d')).toBe(24 * 60);
  });

  it('returns null for invalid input', () => {
    expect(parseDurationToMinutes('')).toBeNull();
    expect(parseDurationToMinutes('abc')).toBeNull();
    expect(parseDurationToMinutes('10x')).toBeNull();
    expect(parseDurationToMinutes('-5m')).toBeNull();
    expect(parseDurationToMinutes('1.5h')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(parseDurationToMinutes(' 30m ')).toBe(30);
  });
});

describe('normalizeDurationLabel', () => {
  it('returns suffixed input as-is', () => {
    expect(normalizeDurationLabel('30m')).toBe('30m');
    expect(normalizeDurationLabel('2h')).toBe('2h');
    expect(normalizeDurationLabel('7d')).toBe('7d');
  });

  it('appends m to bare numbers', () => {
    expect(normalizeDurationLabel('30')).toBe('30m');
    expect(normalizeDurationLabel('0')).toBe('0m');
  });

  it('returns null for invalid input', () => {
    expect(normalizeDurationLabel('')).toBeNull();
    expect(normalizeDurationLabel('abc')).toBeNull();
    expect(normalizeDurationLabel('10x')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(normalizeDurationLabel(' 24h ')).toBe('24h');
  });
});
