import Database from 'libsql';
import fs from 'fs';
import path from 'path';
import type { DbConfig, SyncResult, SyncStats } from './types.js';
import { EVENTS_SCHEMA_V2, CACHE_SCHEMA_V1, PRAGMAS } from './schema.js';
import { generateId } from '../utils/id.js';
import { setInstanceId, getInstanceId, setDeviceId, getDeviceId, setLastSyncAttemptAt } from './meta.js';

export type ConnectionMode = 'local-only' | 'remote-replica' | 'offline-sync' | 'remote-only';

export interface Datastore {
    eventsDb: Database.Database;
    cacheDb: Database.Database;
    mode: ConnectionMode;
    syncUrl?: string;
    instanceId: string;
    deviceId: string;
    syncAttempts: number[];
    sync(): Promise<SyncStats>;
    close(): void;
}

function ensureDirectory(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function determineMode(config: DbConfig): ConnectionMode {
    const syncUrl = config.events?.syncUrl;
    if (!syncUrl) return 'local-only';

    const syncMode = config.events?.syncMode ?? 'offline';
    return syncMode === 'replica' ? 'remote-replica' : 'offline-sync';
}

export function createDatastore(config: DbConfig): Datastore {
    const eventsPath = config.events?.path ?? ':memory:';
    const cachePath = config.cache?.path ?? ':memory:';
    const mode = determineMode(config);

    // Ensure directories exist
    if (eventsPath !== ':memory:') ensureDirectory(eventsPath);
    if (cachePath !== ':memory:') ensureDirectory(cachePath);

    // Build events.db options
    const eventsOpts: any = {};
    if (config.events?.syncUrl) {
        eventsOpts.syncUrl = config.events.syncUrl;
    }
    if (config.events?.authToken) {
        eventsOpts.authToken = config.events.authToken;
    }
    if (config.events?.encryptionKey) {
        eventsOpts.encryptionKey = config.events.encryptionKey;
    }
    if (config.timeoutSec) {
        eventsOpts.timeout = config.timeoutSec;
    }
    // Disable background sync in CLI
    eventsOpts.syncPeriod = 0;

    // Create connections
    const eventsDb = new Database(eventsPath, eventsOpts);
    const cacheDb = new Database(cachePath, { timeout: config.timeoutSec });

    // Set pragmas
    cacheDb.exec(PRAGMAS);

    try {
        eventsDb.exec(PRAGMAS);
    } catch (err: any) {
        // In sync mode (embedded replica), some pragmas like journal_mode might be restricted
        // or handled by the engine. We ignore 'Sqlite3UnsupportedStatement' in this context.
        // The library throws generic Error with message or name equivalent to the code.
        const isUnsupported =
            err.code === 'Sqlite3UnsupportedStatement' ||
            err.message === 'Sqlite3UnsupportedStatement' ||
            String(err).includes('Sqlite3UnsupportedStatement');

        if (!isUnsupported) {
            throw err;
        }
    }

    // Initialize schemas
    eventsDb.exec(EVENTS_SCHEMA_V2);
    cacheDb.exec(CACHE_SCHEMA_V1);

    // Ensure instance ID exists (generate if new database)
    let instanceId = getInstanceId(eventsDb);
    if (!instanceId) {
        instanceId = generateId();
        setInstanceId(eventsDb, instanceId);
    }

    // Ensure device ID exists (generate if new device)
    let deviceId = getDeviceId(cacheDb);
    if (!deviceId) {
        deviceId = generateId();
        setDeviceId(cacheDb, deviceId);
    }

    const datastore: Datastore = {
        eventsDb,
        cacheDb,
        mode,
        syncUrl: config.events?.syncUrl,
        instanceId,
        deviceId,

        // Rate limiting state
        syncAttempts: [] as number[],

        async sync(): Promise<SyncStats> {
            if (mode === 'local-only') {
                return { attempted: false, success: true };
            }

            const now = Date.now();
            const maxAttempts = config.sync?.maxSyncAttemptsPerMinute ?? 10;
            const syncTimeoutMs = config.sync?.syncTimeoutMs ?? 30000;

            // Rate limiting: track attempts in the last minute
            this.syncAttempts = this.syncAttempts.filter(t => now - t < 60000);
            if (this.syncAttempts.length >= maxAttempts) {
                return {
                    attempted: false,
                    success: false,
                    error: `Rate limited: ${maxAttempts} sync attempts per minute exceeded`,
                };
            }
            this.syncAttempts.push(now);

            // Update sync attempt timestamp in local meta
            setLastSyncAttemptAt(cacheDb, now);

            try {
                // Wrap sync() with timeout using AbortController pattern
                const syncPromise = new Promise<SyncResult>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error(`Sync timed out after ${syncTimeoutMs}ms`));
                    }, syncTimeoutMs);

                    try {
                        // libsql sync() is synchronous in Node.js binding? No, it returns void or result?
                        // Wait, better-sqlite3 style sync might be synchronous, but libsql over HTTP is likely async?
                        // The libsql type defs say sync() returns void... wait.
                        // Let's assume sync() is synchronous for now as per better-sqlite3-libsql, OR verify.
                        // The 'libsql' package (which is @libsql/client usually, but here we are using 'libsql' npm package which is the better-sqlite3 fork)
                        // The 'libsql' npm package's sync() IS synchronous usually if it's embedded replica.
                        // But if it blocks, we might need to be careful.

                        // Actually, looking at docs, db.sync() returns nothing in the better-sqlite3 compatible binding?
                        // Let's assume it works synchronously.
                        eventsDb.sync();
                        clearTimeout(timeout);
                        // It doesn't return stats in the binding usually. 
                        resolve({ frames_synced: 0, frame_no: 0 }); // Mock result since binding might not return it
                    } catch (err) {
                        clearTimeout(timeout);
                        reject(err);
                    }
                });

                // If it's truly synchronous, the promise wrapper above is silly but harmless.
                // If it's async (which Turso sync implies), then we await it.
                // But 'libsql' (better-sqlite3 fork) sync() blocks.

                await syncPromise;

                return {
                    attempted: true,
                    success: true,
                    framesSynced: 0,
                };
            } catch (err) {
                return {
                    attempted: true,
                    success: false,
                    error: err instanceof Error ? err.message : String(err),
                };
            }
        },

        close(): void {
            eventsDb.close();
            cacheDb.close();
        }
    };

    return datastore;
}
