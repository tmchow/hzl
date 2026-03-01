import { describe, expect, it } from 'vitest';
import type Database from 'libsql';
import { withWriteTransaction } from '../transaction.js';

function createBusyError(message = 'SQLITE_BUSY: database is locked'): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = 'SQLITE_BUSY';
  return error;
}

function createMockDb(
  behavior: (fn: () => unknown) => unknown
): Database.Database {
  return {
    transaction(fn: () => unknown) {
      return {
        immediate() {
          return behavior(fn);
        },
      };
    },
  } as unknown as Database.Database;
}

describe('withWriteTransaction', () => {
  it('returns callback result on first attempt', () => {
    let attempts = 0;
    const db = createMockDb((fn) => {
      attempts += 1;
      return fn();
    });

    const result = withWriteTransaction(db, () => 'ok');

    expect(result).toBe('ok');
    expect(attempts).toBe(1);
  });

  it('retries SQLITE_BUSY errors with backoff delay before succeeding', () => {
    let attempts = 0;
    const db = createMockDb((fn) => {
      attempts += 1;
      if (attempts <= 2) {
        throw createBusyError();
      }
      return fn();
    });

    const start = Date.now();
    const result = withWriteTransaction(db, () => 42, { retries: 5, busySleepMs: 20 });
    const elapsed = Date.now() - start;

    expect(result).toBe(42);
    expect(attempts).toBe(3);
    // Retries 1 and 2 should sleep for at least 20ms + 40ms.
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });

  it('does not retry non-busy errors', () => {
    let attempts = 0;
    const expected = new Error('boom');
    const db = createMockDb(() => {
      attempts += 1;
      throw expected;
    });

    expect(() => withWriteTransaction(db, () => 'ok')).toThrow(expected);
    expect(attempts).toBe(1);
  });

  it('throws SQLITE_BUSY after exhausting retries', () => {
    let attempts = 0;
    const db = createMockDb(() => {
      attempts += 1;
      throw createBusyError();
    });

    expect(() => withWriteTransaction(db, () => 'ok', { retries: 2, busySleepMs: 1 })).toThrow(
      /SQLITE_BUSY/
    );
    expect(attempts).toBe(3);
  });
});
