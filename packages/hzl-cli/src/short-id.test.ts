// packages/hzl-cli/src/short-id.test.ts
import { describe, it, expect } from 'vitest';
import { createShortId } from './short-id.js';

describe('createShortId', () => {
  it('returns 8-char prefix for a single ID', () => {
    const shortId = createShortId(['01ABCDEFGHIJKLMNOPQRSTUVWX']);
    expect(shortId('01ABCDEFGHIJKLMNOPQRSTUVWX')).toBe('01ABCDEF');
  });

  it('returns 8-char prefix for empty array', () => {
    const shortId = createShortId([]);
    expect(shortId('01ABCDEFGHIJKLMNOPQRSTUVWX')).toBe('01ABCDEF');
  });

  it('returns 8-char prefix when IDs differ early', () => {
    const shortId = createShortId([
      '01AAAAAAAAAAAAAAAAAAAAAAAA',
      '01BBBBBBBBBBBBBBBBBBBBBBBB',
    ]);
    // Differ at char 2 → common prefix len = 2 → need 3, but floor is 8
    expect(shortId('01AAAAAAAAAAAAAAAAAAAAAAAA')).toBe('01AAAAAA');
    expect(shortId('01BBBBBBBBBBBBBBBBBBBBBBBB')).toBe('01BBBBBB');
  });

  it('extends beyond 8 chars when needed for uniqueness', () => {
    const shortId = createShortId([
      '01KGKX5GAAAAAAAAAAAAAAAAAA',
      '01KGKX5GBBBBBBBBBBBBBBBBBB',
    ]);
    // Common prefix is '01KGKX5G' (8 chars), differ at char 8
    // Need 9 chars to disambiguate
    expect(shortId('01KGKX5GAAAAAAAAAAAAAAAAAA')).toBe('01KGKX5GA');
    expect(shortId('01KGKX5GBBBBBBBBBBBBBBBBBB')).toBe('01KGKX5GB');
  });

  it('handles the ULID timestamp collision case', () => {
    // Simulates tasks created in the same millisecond sharing first 10 chars
    const shortId = createShortId([
      '01KGKX5HABCDEFGHIJKLMNOPQR',
      '01KGKX5HXYZDEFGHIJKLMNOPQR',
      '01KGKX5HMNBDEFGHIJKLMNOPQR',
    ]);
    // Common prefix for all three: '01KGKX5H' (8 chars)
    // But first two differ at char 8 (A vs X vs M)
    // Actually sorted: ...ABC, ...MNB, ...XYZ — adjacent common prefix max is 8
    // Need 9 chars
    const id1 = shortId('01KGKX5HABCDEFGHIJKLMNOPQR');
    const id2 = shortId('01KGKX5HXYZDEFGHIJKLMNOPQR');
    const id3 = shortId('01KGKX5HMNBDEFGHIJKLMNOPQR');

    // All unique
    const ids = new Set([id1, id2, id3]);
    expect(ids.size).toBe(3);
  });

  it('produces copy-pasteable IDs that work with prefix resolution', () => {
    // The key UX requirement: displayed IDs are unique in the set
    const ids = [
      '01KGKX5G1111111111111111AA',
      '01KGKX5G2222222222222222BB',
      '01KGKX5H3333333333333333CC',
    ];
    const shortId = createShortId(ids);

    const displayed = ids.map(id => shortId(id));

    // All displayed IDs should be unique
    expect(new Set(displayed).size).toBe(3);

    // Each displayed ID should be a prefix of exactly one full ID
    for (let i = 0; i < ids.length; i++) {
      const matching = ids.filter(id => id.startsWith(displayed[i]));
      expect(matching).toHaveLength(1);
      expect(matching[0]).toBe(ids[i]);
    }
  });
});
