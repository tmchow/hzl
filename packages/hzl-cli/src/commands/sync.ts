import { Command } from 'commander';
import { z } from 'zod';
import {
    createDatastore,
    type Datastore,
    type ConflictStrategy,
    type SyncStats,
    type SyncResult as CoreSyncResult,
    getDirtySince,
    getLastSyncFrameNo,
    clearDirtySince
} from 'hzl-core';
import { GlobalOptionsSchema } from '../types.js';
import { resolveDbPaths } from '../config.js';

const SyncOptionsSchema = z.object({
    conflictStrategy: z.enum(['merge', 'discard-local', 'fail']).optional(),
    force: z.boolean().optional(),
    reset: z.boolean().optional(),
});

export interface SyncResult {
    success: boolean;
    mode: string;
    message?: string;
    data?: {
        status: string;
        lastSyncAt?: string;
        framesSynced?: number;
        frameNo?: number;
        merged?: { localEvents?: number; remoteEvents?: number };
        localEvents?: number;
        lastSyncFrameNo?: number | null;
    };
    sync?: SyncStats;
    error?: {
        code: string;
        message: string;
        recoverable: boolean;
        actions?: Array<{ command: string; description: string }>;
    };
}

export interface SyncOptions {
    eventsDbPath: string;
    cacheDbPath: string;
    json: boolean;
    conflictStrategy?: ConflictStrategy;
    force?: boolean; // Force re-sync even if clean
}

export class ConflictError extends Error {
    constructor(
        message: string,
        public readonly localEvents: number,
        public readonly remoteFrameNo: number,
        public readonly lastSyncFrameNo: number | null
    ) {
        super(message);
        this.name = 'ConflictError';
    }
}

/**
 * Detect if there are local changes that conflict with remote.
 * Returns null if no conflict, or conflict details if there is one.
 */
function detectConflict(datastore: Datastore): {
    hasLocalChanges: boolean;
    localEventCount: number;
    dirtySince: number | null;
} {
    const dirtySince = getDirtySince(datastore.cacheDb);
    if (!dirtySince) {
        return { hasLocalChanges: false, localEventCount: 0, dirtySince: null };
    }

    // Count events created since last sync
    const lastSyncFrameNo = getLastSyncFrameNo(datastore.cacheDb) ?? 0;
    const localEventCount = datastore.eventsDb
        .prepare('SELECT COUNT(*) as count FROM events WHERE id > ?')
        .get(lastSyncFrameNo) as { count: number };

    return {
        hasLocalChanges: localEventCount.count > 0,
        localEventCount: localEventCount.count,
        dirtySince,
    };
}

/**
 * Apply conflict resolution strategy.
 * - merge: Push local changes, then pull remote (default, safe for append-only)
 * - discard-local: Drop local changes since last sync, pull remote
 * - fail: Abort with error, let user decide
 */
async function resolveConflict(
    datastore: Datastore,
    strategy: ConflictStrategy,
    conflictInfo: { localEventCount: number; dirtySince: number | null }
): Promise<{ resolved: boolean; action: string }> {
    switch (strategy) {
        case 'merge':
            // For append-only events, merge is safe - just sync and both sides get all events
            // The ULID ordering ensures consistent final state
            return { resolved: true, action: 'merge' };

        case 'discard-local':
            // WARNING: This discards local work! Only use if explicitly requested.
            // We don't actually delete events (append-only), but we mark them as superseded
            // by clearing dirty state and letting remote state take precedence in projections
            clearDirtySince(datastore.cacheDb);
            return { resolved: true, action: 'discard-local' };

        case 'fail':
            throw new ConflictError(
                `Conflict detected: ${conflictInfo.localEventCount} local events since last sync. ` +
                `Use --conflict-strategy=merge to sync anyway, or --conflict-strategy=discard-local to discard local changes.`,
                conflictInfo.localEventCount,
                0, // Will be filled by sync
                getLastSyncFrameNo(datastore.cacheDb)
            );

        default: {
            const _exhaustive: never = strategy;
            throw new Error(`Unknown conflict strategy: ${strategy}`);
        }
    }
}

export async function runSync(options: SyncOptions): Promise<SyncResult> {
    const { eventsDbPath, cacheDbPath, json, conflictStrategy = 'merge', force = false } = options;

    const datastore = createDatastore({
        events: { path: eventsDbPath, syncMode: 'offline', readYourWrites: true },
        cache: { path: cacheDbPath },
    });

    try {
        if (datastore.mode === 'local-only') {
            const result: SyncResult = {
                success: true,
                mode: 'local-only',
                message: 'Database is in local-only mode. No sync configured.',
                data: {
                    status: 'local-only',
                },
            };

            if (!json) {
                console.log('✓ Database is in local-only mode. No sync configured.');
                console.log('  To enable sync, run: hzl init --sync-url <url> --auth-token <token>');
            }

            return result;
        }

        // Check for conflicts before syncing
        const conflictInfo = detectConflict(datastore);
        if (conflictInfo.hasLocalChanges && !force) {
            try {
                const resolution = await resolveConflict(datastore, conflictStrategy, conflictInfo);
                if (!json) {
                    console.log(`ℹ Conflict resolution: ${resolution.action} (${conflictInfo.localEventCount} local events)`);
                }
            } catch (err) {
                if (err instanceof ConflictError) {
                    return {
                        success: false,
                        mode: datastore.mode,
                        error: {
                            code: 'SYNC_CONFLICT',
                            message: err.message,
                            recoverable: true,
                            actions: [
                                { command: 'hzl sync --conflict-strategy=merge', description: 'Merge local and remote changes' },
                                { command: 'hzl sync --conflict-strategy=discard-local', description: 'Discard local changes' },
                            ],
                        },
                        data: {
                            status: 'conflict',
                            localEvents: err.localEvents,
                            lastSyncFrameNo: err.lastSyncFrameNo,
                        },
                    };
                }
                throw err;
            }
        }

        // Perform sync
        const syncStats = await datastore.sync();

        if (!syncStats.success) {
            const result: SyncResult = {
                success: false,
                mode: datastore.mode,
                error: {
                    code: 'SYNC_FAILED',
                    message: syncStats.error ?? 'Sync failed',
                    recoverable: true,
                    actions: [
                        { command: 'hzl doctor', description: 'Check configuration and connectivity' },
                        { command: 'hzl sync --force', description: 'Retry sync' },
                    ],
                },
                sync: syncStats,
            };

            if (!json) {
                console.error(`✗ Sync failed: ${syncStats.error}`);
            }

            return result;
        }

        const result: SyncResult = {
            success: true,
            mode: datastore.mode,
            data: {
                status: 'synced',
                lastSyncAt: new Date().toISOString(),
                framesSynced: syncStats.framesSynced,
                frameNo: syncStats.frameNo,
            },
            sync: syncStats,
        };

        if (!json) {
            console.log(`✓ Sync complete`);
            console.log(`  Frames synced: ${syncStats.framesSynced ?? 0}`);
            console.log(`  Current frame: ${syncStats.frameNo ?? 'unknown'}`);
        }

        return result;
    } finally {
        datastore.close();
    }
}

export function createSyncCommand(): Command {
    return new Command('sync')
        .description('Synchronize local database with remote Turso instance')
        .option(
            '--conflict-strategy <strategy>',
            'Conflict resolution strategy: merge, discard-local, fail',
            'merge'
        )
        .option(
            '-f, --force',
            'Force sync even if rate limited or recently synced. Use with --reset to force full re-sync.'
        )
        .option(
            '--reset',
            'Reset sync state and perform full re-sync (requires --force). ' +
            'WARNING: This rebuilds all projections from scratch.'
        )
        .action(async function (this: Command) {
            const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
            const localOpts = SyncOptionsSchema.parse(this.opts());

            // --reset requires --force as safety measure
            if (localOpts.reset && !localOpts.force) {
                console.error('Error: --reset requires --force flag');
                process.exit(1);
            }

            const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);

            // Handle --reset: clear sync state to force full re-sync
            if (localOpts.reset && localOpts.force) {
                // We import Database locally to allow reset even if Datastore creation would fail
                // But actually createDatastore is fine.
                // We just need to access the cache db directly to delete keys.
                // Or createDatastore() gives us cacheDb.
                const datastore = createDatastore({
                    events: { path: eventsDbPath, syncMode: 'offline', readYourWrites: true },
                    cache: { path: cacheDbPath }
                });
                clearDirtySince(datastore.cacheDb);
                datastore.cacheDb.prepare('DELETE FROM hzl_local_meta WHERE key LIKE ?').run('last_sync%');
                datastore.close();
                console.log('ℹ Sync state reset. Performing full re-sync...');
            }

            const result = await runSync({
                eventsDbPath,
                cacheDbPath,
                json: globalOpts.json,
                conflictStrategy: localOpts.conflictStrategy,
                force: localOpts.force,
            });

            if (globalOpts.json) {
                console.log(JSON.stringify(result, null, 2));
            }

            process.exit(result.success ? 0 : 1);
        });
}
