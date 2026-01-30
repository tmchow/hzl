import { describe, it, expect } from 'vitest';
import { generateId, isValidId } from './id.js';

describe('id generation', () => {
  it('generates a ULID', () => {
    const id = generateId();
    expect(id).toHaveLength(26);
    expect(id).toMatch(/^[0-9A-Z]{26}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('validates ULID format', () => {
    expect(isValidId('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
  });

  it('validates UUID format', () => {
    expect(isValidId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects invalid IDs', () => {
    expect(isValidId('')).toBe(false);
    expect(isValidId('too-short')).toBe(false);
  });
});
