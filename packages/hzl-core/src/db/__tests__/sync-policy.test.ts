import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSyncPolicy } from '../sync-policy.js';
import type { SyncConfig } from '../types.js';

describe('SyncPolicy', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-31T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('manual policy', () => {
        it('never triggers sync automatically', () => {
            const policy = createSyncPolicy({ policy: 'manual' });

            expect(policy.shouldSyncBefore({ lastSyncAt: null, isDirty: true })).toBe(false);
            expect(policy.shouldSyncAfter({ isDirty: true })).toBe(false);
        });
    });

    describe('opportunistic policy', () => {
        const config: Partial<SyncConfig> = {
            policy: 'opportunistic',
            staleAfterMs: 60000,
            minIntervalMs: 15000,
            failureBackoffMs: 60000,
        };

        it('triggers sync before when stale', () => {
            const policy = createSyncPolicy(config);
            const now = Date.now();

            // 2 minutes since last sync (> 60s stale threshold)
            const lastSyncAt = now - 120000;
            expect(policy.shouldSyncBefore({
                lastSyncAt,
                isDirty: false,
                lastSyncAttemptAt: null,
            })).toBe(true);
        });

        it('does not trigger sync before when fresh', () => {
            const policy = createSyncPolicy(config);
            const now = Date.now();

            // 30 seconds since last sync (< 60s stale threshold)
            const lastSyncAt = now - 30000;
            expect(policy.shouldSyncBefore({
                lastSyncAt,
                isDirty: false,
                lastSyncAttemptAt: null,
            })).toBe(false);
        });

        it('triggers sync before when never synced', () => {
            const policy = createSyncPolicy(config);

            expect(policy.shouldSyncBefore({
                lastSyncAt: null,
                isDirty: false,
                lastSyncAttemptAt: null,
            })).toBe(true);
        });

        it('respects failure backoff', () => {
            const policy = createSyncPolicy(config);
            const now = Date.now();

            // Stale but recent failed attempt
            expect(policy.shouldSyncBefore({
                lastSyncAt: now - 120000,  // Stale
                isDirty: false,
                lastSyncAttemptAt: now - 5000,  // Failed 5s ago (< 60s backoff)
                lastSyncError: 'network error',
            })).toBe(false);
        });

        it('triggers sync after write when dirty and interval passed', () => {
            const policy = createSyncPolicy(config);
            const now = Date.now();

            expect(policy.shouldSyncAfter({
                isDirty: true,
                lastSyncAttemptAt: now - 20000,  // 20s ago (> 15s interval)
            })).toBe(true);
        });

        it('does not trigger sync after when interval not passed', () => {
            const policy = createSyncPolicy(config);
            const now = Date.now();

            expect(policy.shouldSyncAfter({
                isDirty: true,
                lastSyncAttemptAt: now - 5000,  // 5s ago (< 15s interval)
            })).toBe(false);
        });
    });

    describe('strict policy', () => {
        const config: Partial<SyncConfig> = { policy: 'strict' };

        it('always triggers sync before reads', () => {
            const policy = createSyncPolicy(config);
            const now = Date.now();

            expect(policy.shouldSyncBefore({
                lastSyncAt: now - 1000,  // Very fresh
                isDirty: false,
                lastSyncAttemptAt: null,
            })).toBe(true);
        });

        it('always triggers sync after writes', () => {
            const policy = createSyncPolicy(config);
            const now = Date.now();

            expect(policy.shouldSyncAfter({
                isDirty: true,
                lastSyncAttemptAt: now - 100,  // Very recent
            })).toBe(true);
        });

        it('fails on sync error', () => {
            const policy = createSyncPolicy(config);

            expect(policy.onSyncError(new Error('network error'))).toBe('fail');
        });
    });

    describe('onSyncError', () => {
        it('opportunistic policy continues on error', () => {
            const policy = createSyncPolicy({ policy: 'opportunistic' });
            expect(policy.onSyncError(new Error('network error'))).toBe('continue');
        });

        it('manual policy continues on error', () => {
            const policy = createSyncPolicy({ policy: 'manual' });
            expect(policy.onSyncError(new Error('network error'))).toBe('continue');
        });
    });
});
