import type { SyncConfig, SyncPolicy as SyncPolicyType } from './types.js';

export interface SyncState {
    lastSyncAt: number | null;
    isDirty: boolean;
    lastSyncAttemptAt?: number | null;
    lastSyncError?: string | null;
}

export interface AfterWriteState {
    isDirty: boolean;
    lastSyncAttemptAt?: number | null;
}

export type SyncTrigger = 'stale' | 'dirty' | 'forced' | 'none';
export type SyncErrorAction = 'continue' | 'fail';

export interface SyncPolicy {
    type: SyncPolicyType;
    shouldSyncBefore(state: SyncState): boolean;
    shouldSyncAfter(state: AfterWriteState): boolean;
    onSyncError(error: Error): SyncErrorAction;
}

const DEFAULT_STALE_AFTER_MS = 60000;
const DEFAULT_MIN_INTERVAL_MS = 15000;
const DEFAULT_FAILURE_BACKOFF_MS = 60000;

export function createSyncPolicy(config: SyncConfig = {}): SyncPolicy {
    const policyType = config.policy ?? 'opportunistic';
    const staleAfterMs = config.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
    const minIntervalMs = config.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    const failureBackoffMs = config.failureBackoffMs ?? DEFAULT_FAILURE_BACKOFF_MS;

    if (policyType === 'manual') {
        return {
            type: 'manual',
            shouldSyncBefore: () => false,
            shouldSyncAfter: () => false,
            onSyncError: () => 'continue',
        };
    }

    if (policyType === 'strict') {
        return {
            type: 'strict',
            shouldSyncBefore: () => true,
            shouldSyncAfter: () => true,
            onSyncError: () => 'fail',
        };
    }

    // Opportunistic policy
    return {
        type: 'opportunistic',

        shouldSyncBefore(state: SyncState): boolean {
            const now = Date.now();

            // Check for failure backoff
            if (state.lastSyncError && state.lastSyncAttemptAt) {
                const timeSinceAttempt = now - state.lastSyncAttemptAt;
                if (timeSinceAttempt < failureBackoffMs) {
                    return false;
                }
            }

            // Never synced - should sync
            if (state.lastSyncAt === null) {
                return true;
            }

            // Check if stale
            const timeSinceSync = now - state.lastSyncAt;
            return timeSinceSync > staleAfterMs;
        },

        shouldSyncAfter(state: AfterWriteState): boolean {
            if (!state.isDirty) {
                return false;
            }

            const now = Date.now();

            // Check min interval
            if (state.lastSyncAttemptAt) {
                const timeSinceAttempt = now - state.lastSyncAttemptAt;
                if (timeSinceAttempt < minIntervalMs) {
                    return false;
                }
            }

            return true;
        },

        onSyncError: () => 'continue',
    };
}
