import crypto from 'node:crypto';
import type Database from 'libsql';
import { withWriteTransaction } from '../db/transaction.js';

const HOOK_OUTBOX_TABLE = 'hook_outbox';

const STATUS_QUEUED = 'queued';
const STATUS_PROCESSING = 'processing';
const STATUS_DELIVERED = 'delivered';
const STATUS_FAILED = 'failed';

export interface HookDrainConfig {
  batchSize?: number;
  maxAttempts?: number;
  ttlMs?: number;
  lockTimeoutMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  jitterRatio?: number;
  requestTimeoutMs?: number;
  workerId?: string;
  now?: () => Date;
  random?: () => number;
  fetchFn?: typeof fetch;
}

export interface HookDrainRunOptions {
  limit?: number;
}

export interface HookDrainResult {
  worker_id: string;
  claimed: number;
  attempted: number;
  delivered: number;
  retried: number;
  failed: number;
  reclaimed: number;
  reclaimed_failed: number;
  preflight_failed: number;
  duration_ms: number;
}

interface HookOutboxRecord {
  id: number;
  url: string;
  headers: string;
  payload: string;
  attempts: number;
  created_at: string;
  lock_token: string;
}

interface ClaimBatch {
  records: HookOutboxRecord[];
  reclaimed: number;
  reclaimedFailed: number;
  preflightFailed: number;
}

function toIsoString(value: Date): string {
  return value.toISOString();
}

function parseTimestampMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getChanges(result: unknown): number {
  if (result && typeof result === 'object' && 'changes' in result) {
    const maybe = (result as { changes?: unknown }).changes;
    if (typeof maybe === 'number') return maybe;
  }
  return 0;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function truncate(text: string, max = 280): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function parseHeaders(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') headers[key] = value;
    }
    return headers;
  } catch {
    return {};
  }
}

export class HookDrainService {
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly ttlMs: number;
  private readonly lockTimeoutMs: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly jitterRatio: number;
  private readonly requestTimeoutMs: number;
  private readonly workerId: string;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly fetchFn: typeof fetch;

  constructor(
    private readonly db: Database.Database,
    config: HookDrainConfig = {}
  ) {
    this.batchSize = config.batchSize ?? 50;
    this.maxAttempts = config.maxAttempts ?? 5;
    this.ttlMs = config.ttlMs ?? 24 * 60 * 60 * 1000;
    this.lockTimeoutMs = config.lockTimeoutMs ?? 5 * 60 * 1000;
    this.backoffBaseMs = config.backoffBaseMs ?? 30_000;
    this.backoffMaxMs = config.backoffMaxMs ?? 6 * 60 * 60 * 1000;
    this.jitterRatio = config.jitterRatio ?? 0.2;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 10_000;
    this.now = config.now ?? (() => new Date());
    this.random = config.random ?? Math.random;
    this.fetchFn = config.fetchFn ?? fetch;
    this.workerId = config.workerId ?? `hook-drain-${process.pid}-${crypto.randomUUID()}`;
  }

  async drain(options: HookDrainRunOptions = {}): Promise<HookDrainResult> {
    const startedAt = this.now();
    const nowIso = toIsoString(startedAt);
    const limit = Math.max(1, options.limit ?? this.batchSize);
    const claimBatch = this.claimDueRecords(limit, nowIso);

    const result: HookDrainResult = {
      worker_id: this.workerId,
      claimed: claimBatch.records.length,
      attempted: 0,
      delivered: 0,
      retried: 0,
      failed: claimBatch.preflightFailed + claimBatch.reclaimedFailed,
      reclaimed: claimBatch.reclaimed,
      reclaimed_failed: claimBatch.reclaimedFailed,
      preflight_failed: claimBatch.preflightFailed,
      duration_ms: 0,
    };

    for (const record of claimBatch.records) {
      result.attempted += 1;
      try {
        await this.deliver(record);
        if (this.markDelivered(record.id, record.lock_token) === 1) {
          result.delivered += 1;
        }
      } catch (error) {
        const disposition = this.markFailedAttempt(record, error);
        if (disposition === 'failed') {
          result.failed += 1;
        } else if (disposition === 'retried') {
          result.retried += 1;
        }
      }
    }

    result.duration_ms = Math.max(0, this.now().getTime() - startedAt.getTime());
    return result;
  }

  private claimDueRecords(limit: number, nowIso: string): ClaimBatch {
    return withWriteTransaction(this.db, () => {
      let preflightFailed = this.failTerminalQueuedRecords(nowIso);
      const reclaimResult = this.reclaimStaleProcessing(nowIso);
      const lockExpiresIso = toIsoString(new Date(this.now().getTime() + this.lockTimeoutMs));

      const dueRows = this.db.prepare(`
        SELECT
          id,
          url,
          headers,
          payload,
          attempts,
          created_at
        FROM ${HOOK_OUTBOX_TABLE}
        WHERE status = ?
          AND next_attempt_at <= ?
        ORDER BY next_attempt_at ASC, id ASC
        LIMIT ?
      `).all(
        STATUS_QUEUED,
        nowIso,
        limit
      ) as Array<{
        id: number;
        url: string;
        headers: string;
        payload: string;
        attempts: number;
        created_at: string;
      }>;

      const claimed: HookOutboxRecord[] = [];
      for (const row of dueRows) {
        if (this.isTerminal(row.attempts, row.created_at, nowIso)) {
          preflightFailed += this.failQueuedRecord(row.id, nowIso, 'hook delivery exhausted before claim');
          continue;
        }

        const lockToken = crypto.randomUUID();
        const updateResult = this.db.prepare(`
          UPDATE ${HOOK_OUTBOX_TABLE}
          SET
            status = ?,
            lock_token = ?,
            locked_by = ?,
            processing_started_at = ?,
            lock_expires_at = ?,
            updated_at = ?
          WHERE id = ?
            AND status = ?
            AND next_attempt_at <= ?
            AND attempts < ?
        `).run(
          STATUS_PROCESSING,
          lockToken,
          this.workerId,
          nowIso,
          lockExpiresIso,
          nowIso,
          row.id,
          STATUS_QUEUED,
          nowIso,
          this.maxAttempts
        );

        if (getChanges(updateResult) === 1) {
          claimed.push({
            ...row,
            lock_token: lockToken,
          });
        }
      }

      return {
        records: claimed,
        reclaimed: reclaimResult.reclaimed,
        reclaimedFailed: reclaimResult.reclaimedFailed,
        preflightFailed,
      };
    });
  }

  private failTerminalQueuedRecords(nowIso: string): number {
    const ttlCutoffIso = toIsoString(new Date(this.now().getTime() - this.ttlMs));
    const updateResult = this.db.prepare(`
      UPDATE ${HOOK_OUTBOX_TABLE}
      SET
        status = ?,
        failed_at = COALESCE(failed_at, ?),
        lock_token = NULL,
        locked_by = NULL,
        lock_expires_at = NULL,
        updated_at = ?,
        last_error = COALESCE(last_error, 'hook delivery exhausted before claim')
      WHERE status = ?
        AND (attempts >= ? OR created_at <= ?)
    `).run(
      STATUS_FAILED,
      nowIso,
      nowIso,
      STATUS_QUEUED,
      this.maxAttempts,
      ttlCutoffIso
    );

    return getChanges(updateResult);
  }

  private failQueuedRecord(id: number, nowIso: string, reason: string): number {
    const updateResult = this.db.prepare(`
      UPDATE ${HOOK_OUTBOX_TABLE}
      SET
        status = ?,
        failed_at = COALESCE(failed_at, ?),
        lock_token = NULL,
        locked_by = NULL,
        lock_expires_at = NULL,
        updated_at = ?,
        last_error = ?
      WHERE id = ?
        AND status = ?
    `).run(
      STATUS_FAILED,
      nowIso,
      nowIso,
      reason,
      id,
      STATUS_QUEUED
    );
    return getChanges(updateResult);
  }

  private reclaimStaleProcessing(nowIso: string): { reclaimed: number; reclaimedFailed: number } {
    const staleRows = this.db.prepare(`
      SELECT
        id,
        attempts,
        created_at
      FROM ${HOOK_OUTBOX_TABLE}
      WHERE status = ?
        AND lock_expires_at IS NOT NULL
        AND lock_expires_at <= ?
    `).all(
      STATUS_PROCESSING,
      nowIso
    ) as Array<{
      id: number;
      attempts: number;
      created_at: string;
    }>;

    let reclaimed = 0;
    let reclaimedFailed = 0;

    for (const row of staleRows) {
      if (this.isTerminal(row.attempts, row.created_at, nowIso)) {
        const failResult = this.db.prepare(`
          UPDATE ${HOOK_OUTBOX_TABLE}
          SET
            status = ?,
            failed_at = COALESCE(failed_at, ?),
            lock_token = NULL,
            locked_by = NULL,
            lock_expires_at = NULL,
            updated_at = ?,
            last_error = COALESCE(last_error, 'stale processing lock reclaimed after exhaustion')
          WHERE id = ?
            AND status = ?
        `).run(
          STATUS_FAILED,
          nowIso,
          nowIso,
          row.id,
          STATUS_PROCESSING
        );
        if (getChanges(failResult) === 1) reclaimedFailed += 1;
        continue;
      }

      const reclaimResult = this.db.prepare(`
        UPDATE ${HOOK_OUTBOX_TABLE}
        SET
          status = ?,
          lock_token = NULL,
          locked_by = NULL,
          lock_expires_at = NULL,
          updated_at = ?
        WHERE id = ?
          AND status = ?
      `).run(
        STATUS_QUEUED,
        nowIso,
        row.id,
        STATUS_PROCESSING
      );
      if (getChanges(reclaimResult) === 1) reclaimed += 1;
    }

    return { reclaimed, reclaimedFailed };
  }

  private async deliver(record: HookOutboxRecord): Promise<void> {
    const headers = parseHeaders(record.headers);
    if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
      headers['content-type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await this.fetchFn(record.url, {
        method: 'POST',
        headers,
        body: record.payload,
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      throw new Error(`network error: ${stringifyError(error)}`);
    }

    if (!response.ok) {
      let responseText = '';
      try {
        responseText = await response.text();
      } catch {
        // Ignore response parsing errors.
      }
      const statusMessage = responseText
        ? `HTTP ${response.status}: ${truncate(responseText)}`
        : `HTTP ${response.status}`;
      throw new Error(statusMessage);
    }
  }

  private markDelivered(id: number, lockToken: string): number {
    const nowIso = toIsoString(this.now());
    const result = withWriteTransaction(this.db, () =>
      this.db.prepare(`
        UPDATE ${HOOK_OUTBOX_TABLE}
        SET
          status = ?,
          delivered_at = ?,
          lock_token = NULL,
          locked_by = NULL,
          lock_expires_at = NULL,
          updated_at = ?,
          last_error = NULL
        WHERE id = ?
          AND status = ?
          AND lock_token = ?
      `).run(
        STATUS_DELIVERED,
        nowIso,
        nowIso,
        id,
        STATUS_PROCESSING,
        lockToken
      )
    );
    return getChanges(result);
  }

  private markFailedAttempt(
    record: HookOutboxRecord,
    error: unknown
  ): 'failed' | 'retried' | 'noop' {
    const now = this.now();
    const nowIso = toIsoString(now);
    const nextAttempts = record.attempts + 1;
    const errorMessage = truncate(stringifyError(error));
    const expirationMs = this.expiresAtMs(record.created_at);

    if (
      nextAttempts >= this.maxAttempts ||
      (expirationMs !== null && now.getTime() >= expirationMs)
    ) {
      const failResult = withWriteTransaction(this.db, () =>
        this.db.prepare(`
          UPDATE ${HOOK_OUTBOX_TABLE}
          SET
            status = ?,
            attempts = ?,
            failed_at = COALESCE(failed_at, ?),
            lock_token = NULL,
            locked_by = NULL,
            lock_expires_at = NULL,
            updated_at = ?,
            last_error = ?
          WHERE id = ?
            AND status = ?
            AND lock_token = ?
        `).run(
          STATUS_FAILED,
          nextAttempts,
          nowIso,
          nowIso,
          errorMessage,
          record.id,
          STATUS_PROCESSING,
          record.lock_token
        )
      );
      return getChanges(failResult) === 1 ? 'failed' : 'noop';
    }

    const delayMs = this.computeBackoffDelayMs(nextAttempts);
    const nextAttemptMs = now.getTime() + delayMs;

    if (expirationMs !== null && nextAttemptMs >= expirationMs) {
      const failResult = withWriteTransaction(this.db, () =>
        this.db.prepare(`
          UPDATE ${HOOK_OUTBOX_TABLE}
          SET
            status = ?,
            attempts = ?,
            failed_at = COALESCE(failed_at, ?),
            lock_token = NULL,
            locked_by = NULL,
            lock_expires_at = NULL,
            updated_at = ?,
            last_error = ?
          WHERE id = ?
            AND status = ?
            AND lock_token = ?
        `).run(
          STATUS_FAILED,
          nextAttempts,
          nowIso,
          nowIso,
          errorMessage,
          record.id,
          STATUS_PROCESSING,
          record.lock_token
        )
      );
      return getChanges(failResult) === 1 ? 'failed' : 'noop';
    }

    const retryResult = withWriteTransaction(this.db, () =>
      this.db.prepare(`
        UPDATE ${HOOK_OUTBOX_TABLE}
        SET
          status = ?,
          attempts = ?,
          next_attempt_at = ?,
          lock_token = NULL,
          locked_by = NULL,
          lock_expires_at = NULL,
          updated_at = ?,
          last_error = ?
        WHERE id = ?
          AND status = ?
          AND lock_token = ?
      `).run(
        STATUS_QUEUED,
        nextAttempts,
        toIsoString(new Date(nextAttemptMs)),
        nowIso,
        errorMessage,
        record.id,
        STATUS_PROCESSING,
        record.lock_token
      )
    );
    return getChanges(retryResult) === 1 ? 'retried' : 'noop';
  }

  private isTerminal(attempts: number, createdAt: string, nowIso: string): boolean {
    if (attempts >= this.maxAttempts) return true;
    const nowMs = parseTimestampMs(nowIso);
    const createdMs = parseTimestampMs(createdAt);
    if (nowMs === null || createdMs === null) return false;
    return nowMs >= createdMs + this.ttlMs;
  }

  private expiresAtMs(createdAt: string): number | null {
    const createdMs = parseTimestampMs(createdAt);
    if (createdMs === null) return null;
    return createdMs + this.ttlMs;
  }

  private computeBackoffDelayMs(nextAttemptCount: number): number {
    const exponent = Math.max(0, nextAttemptCount - 1);
    const uncapped = this.backoffBaseMs * Math.pow(2, exponent);
    const base = Math.min(this.backoffMaxMs, uncapped);
    const jitter = 1 + ((this.random() * 2) - 1) * this.jitterRatio;
    return Math.max(0, Math.round(base * jitter));
  }
}
