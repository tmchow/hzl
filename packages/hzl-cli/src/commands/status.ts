import { Command } from 'commander';
import {
    createDatastore,
    getLastSyncAt,
    getLastSyncError,
    getLastSyncFrameNo,
    getDirtySince,
    getLastSyncAttemptAt
} from 'hzl-core';
import { GlobalOptionsSchema } from '../types.js';
import { resolveDbPaths, readConfig, getConfigPath } from '../config.js';

export interface StatusResult {
    success: boolean;
    data: {
        mode: string;
        eventsDb: string;
        cacheDb: string;
        instanceId: string;
        deviceId: string;
        syncUrl?: string;
        lastSyncAt?: string;
        lastSyncError?: string;
        lastSyncFrameNo?: number;
        dirtySince?: string;
        localChanges?: boolean;
        lastSyncAttemptAt?: string;
    };
}

export interface StatusOptions {
    eventsDbPath: string;
    cacheDbPath: string;
    json: boolean;
    syncUrl?: string;
    authToken?: string;
}

export async function runStatus(options: StatusOptions): Promise<StatusResult> {
    const { eventsDbPath, cacheDbPath, json, syncUrl, authToken } = options;

    const datastore = createDatastore({
        events: { path: eventsDbPath, syncUrl, authToken, syncMode: 'offline', readYourWrites: true },
        cache: { path: cacheDbPath },
    });

    try {
        const lastSyncAtTimestamp = getLastSyncAt(datastore.cacheDb);
        const lastSyncAttemptTimestamp = getLastSyncAttemptAt(datastore.cacheDb);
        const dirtySinceTimestamp = getDirtySince(datastore.cacheDb);
        const lastSyncError = getLastSyncError(datastore.cacheDb);
        const lastSyncFrameNo = getLastSyncFrameNo(datastore.cacheDb);

        const result: StatusResult = {
            success: true,
            data: {
                mode: datastore.mode,
                eventsDb: eventsDbPath,
                cacheDb: cacheDbPath,
                instanceId: datastore.instanceId,
                deviceId: datastore.deviceId,
                syncUrl: datastore.syncUrl,
                lastSyncAt: lastSyncAtTimestamp ? new Date(lastSyncAtTimestamp).toISOString() : undefined,
                lastSyncAttemptAt: lastSyncAttemptTimestamp ? new Date(lastSyncAttemptTimestamp).toISOString() : undefined,
                lastSyncError: lastSyncError ?? undefined,
                lastSyncFrameNo: lastSyncFrameNo ?? undefined,
                dirtySince: dirtySinceTimestamp ? new Date(dirtySinceTimestamp).toISOString() : undefined,
                localChanges: !!dirtySinceTimestamp,
            },
        };

        if (!json) {
            console.log('Database Status');
            console.log('---------------');
            console.log(`Mode:           ${result.data.mode}`);
            console.log(`Events DB:      ${result.data.eventsDb}`);
            console.log(`Cache DB:       ${result.data.cacheDb}`);
            console.log(`Instance ID:    ${result.data.instanceId}`);
            console.log(`Device ID:      ${result.data.deviceId}`);

            if (result.data.syncUrl) {
                console.log(`Sync URL:       ${result.data.syncUrl}`);
                console.log(`Last Sync:      ${result.data.lastSyncAt ?? 'Never'}`);
                if (result.data.lastSyncError) {
                    console.log(`Last Error:     ${result.data.lastSyncError}`);
                }
                if (result.data.localChanges) {
                    console.log(`Local Changes:  Yes (since ${result.data.dirtySince})`);
                } else {
                    console.log(`Local Changes:  No`);
                }
            } else {
                console.log(`Sync:           Not configured (local-only)`);
            }
        }

        return result;
    } finally {
        datastore.close();
    }
}

export function createStatusCommand(): Command {
    return new Command('status')
        .description('Show database connection status and sync information')
        .action(async function (this: Command) {
            const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
            const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
            const config = readConfig(getConfigPath());

            // Get sync URL and auth token from config or env
            const syncUrl = process.env.HZL_SYNC_URL ?? config.syncUrl ?? config.db?.events?.syncUrl;
            const authToken = process.env.HZL_AUTH_TOKEN ?? config.authToken ?? config.db?.events?.authToken;

            const result = await runStatus({
                eventsDbPath,
                cacheDbPath,
                json: globalOpts.json,
                syncUrl,
                authToken,
            });

            if (globalOpts.json) {
                console.log(JSON.stringify(result, null, 2));
            }

            process.exit(result.success ? 0 : 1);
        });
}
