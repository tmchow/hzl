import type Database from 'libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../db/test-utils.js';
import { HookDrainService } from './hook-drain-service.js';

function insertOutboxRow(
  db: Database.Database,
  row: {
    status?: 'queued' | 'processing' | 'delivered' | 'failed';
    hook_name?: string;
    url?: string;
    headers?: string;
    payload?: string;
    attempts?: number;
    next_attempt_at: string;
    created_at?: string;
    lock_token?: string | null;
    locked_by?: string | null;
    lock_expires_at?: string | null;
  }
): number {
  const result = db.prepare(`
    INSERT INTO hook_outbox (
      hook_name,
      status,
      url,
      headers,
      payload,
      attempts,
      next_attempt_at,
      created_at,
      lock_token,
      locked_by,
      lock_expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.hook_name ?? 'on_done',
    row.status ?? 'queued',
    row.url ?? 'https://example.com/hooks/done',
    row.headers ?? '{"Authorization":"Bearer test"}',
    row.payload ?? '{"task_id":"TASK-1","status":"done"}',
    row.attempts ?? 0,
    row.next_attempt_at,
    row.created_at ?? '2026-02-27T11:00:00.000Z',
    row.lock_token ?? null,
    row.locked_by ?? null,
    row.lock_expires_at ?? null
  ) as { lastInsertRowid: number };

  return result.lastInsertRowid;
}

describe('HookDrainService', () => {
  let db: Database.Database;
  let now: Date;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    db = createTestDb();
    now = new Date('2026-02-27T12:00:00.000Z');
    fetchMock = vi.fn();
  });

  afterEach(() => {
    db.close();
  });

  it('drains due queued hooks and marks deliveries as delivered', async () => {
    insertOutboxRow(db, {
      next_attempt_at: '2026-02-27T11:59:00.000Z',
      created_at: '2026-02-27T11:00:00.000Z',
    });

    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));

    const service = new HookDrainService(db, {
      now: () => now,
      random: () => 0.5,
      fetchFn: fetchMock as unknown as typeof fetch,
      workerId: 'worker-success',
    });

    const result = await service.drain();

    expect(result.claimed).toBe(1);
    expect(result.delivered).toBe(1);
    expect(result.retried).toBe(0);
    expect(result.failed).toBe(0);

    const row = db.prepare(`
      SELECT status, delivered_at, attempts, lock_token, lock_expires_at
      FROM hook_outbox
      ORDER BY id ASC
      LIMIT 1
    `).get() as {
      status: string;
      delivered_at: string | null;
      attempts: number;
      lock_token: string | null;
      lock_expires_at: string | null;
    };

    expect(row.status).toBe('delivered');
    expect(row.delivered_at).toBe('2026-02-27T12:00:00.000Z');
    expect(row.attempts).toBe(0);
    expect(row.lock_token).toBeNull();
    expect(row.lock_expires_at).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/hooks/done',
      expect.objectContaining({
        method: 'POST',
        body: '{"task_id":"TASK-1","status":"done"}',
      })
    );
  });

  it('schedules retries with exponential backoff when delivery fails', async () => {
    insertOutboxRow(db, {
      next_attempt_at: '2026-02-27T11:59:00.000Z',
      created_at: '2026-02-27T11:00:00.000Z',
    });

    fetchMock.mockRejectedValue(new Error('connection refused'));

    const service = new HookDrainService(db, {
      now: () => now,
      random: () => 0.5,
      fetchFn: fetchMock as unknown as typeof fetch,
      workerId: 'worker-retry',
      backoffBaseMs: 1_000,
      backoffMaxMs: 60_000,
      jitterRatio: 0.2,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    const result = await service.drain();

    expect(result.claimed).toBe(1);
    expect(result.delivered).toBe(0);
    expect(result.retried).toBe(1);
    expect(result.failed).toBe(0);

    const row = db.prepare(`
      SELECT status, attempts, next_attempt_at, last_error
      FROM hook_outbox
      ORDER BY id ASC
      LIMIT 1
    `).get() as {
      status: string;
      attempts: number;
      next_attempt_at: string;
      last_error: string | null;
    };

    expect(row.status).toBe('queued');
    expect(row.attempts).toBe(1);
    expect(row.next_attempt_at).toBe('2026-02-27T12:00:01.000Z');
    expect(row.last_error).toContain('network error');
  });

  it('marks records as failed once max attempts are exhausted', async () => {
    insertOutboxRow(db, {
      attempts: 4,
      next_attempt_at: '2026-02-27T11:59:00.000Z',
      created_at: '2026-02-27T11:00:00.000Z',
    });

    fetchMock.mockResolvedValue(new Response('upstream failed', { status: 500 }));

    const service = new HookDrainService(db, {
      now: () => now,
      random: () => 0.5,
      fetchFn: fetchMock as unknown as typeof fetch,
      workerId: 'worker-fail',
      maxAttempts: 5,
      backoffBaseMs: 1_000,
      backoffMaxMs: 60_000,
      jitterRatio: 0.2,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    const result = await service.drain();

    expect(result.claimed).toBe(1);
    expect(result.retried).toBe(0);
    expect(result.failed).toBe(1);

    const row = db.prepare(`
      SELECT status, attempts, failed_at, last_error
      FROM hook_outbox
      ORDER BY id ASC
      LIMIT 1
    `).get() as {
      status: string;
      attempts: number;
      failed_at: string | null;
      last_error: string | null;
    };

    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(5);
    expect(row.failed_at).toBe('2026-02-27T12:00:00.000Z');
    expect(row.last_error).toContain('HTTP 500');
  });

  it('reclaims stale processing locks and redrives delivery', async () => {
    insertOutboxRow(db, {
      status: 'processing',
      lock_token: 'stale-token',
      locked_by: 'stale-worker',
      lock_expires_at: '2026-02-27T11:59:00.000Z',
      next_attempt_at: '2026-02-27T11:35:00.000Z',
      created_at: '2026-02-27T11:00:00.000Z',
    });

    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));

    const service = new HookDrainService(db, {
      now: () => now,
      random: () => 0.5,
      fetchFn: fetchMock as unknown as typeof fetch,
      workerId: 'worker-reclaim',
      lockTimeoutMs: 60_000,
    });

    const result = await service.drain();

    expect(result.reclaimed).toBe(1);
    expect(result.claimed).toBe(1);
    expect(result.delivered).toBe(1);

    const row = db.prepare(`
      SELECT status, lock_token, lock_expires_at, delivered_at
      FROM hook_outbox
      ORDER BY id ASC
      LIMIT 1
    `).get() as {
      status: string;
      lock_token: string | null;
      lock_expires_at: string | null;
      delivered_at: string | null;
    };

    expect(row.status).toBe('delivered');
    expect(row.lock_token).toBeNull();
    expect(row.lock_expires_at).toBeNull();
    expect(row.delivered_at).toBe('2026-02-27T12:00:00.000Z');
  });
});
