import { Command } from 'commander';
import { z } from 'zod';
import { DatabaseLock } from 'hzl-core';
import { GlobalOptionsSchema } from '../types.js';
import { resolveDbPaths } from '../config.js';

export interface LockClearResult {
    success: boolean;
    cleared: boolean;
    message: string;
    lockPath?: string;
    wasStale?: boolean;
    metadata?: {
        pid: number;
        hostname: string;
        startedAt: number;
        command?: string;
    };
}

export interface LockClearOptions {
    eventsDbPath: string;
    json: boolean;
    force?: boolean;
}

export function runLockClear(options: LockClearOptions): LockClearResult {
    const { eventsDbPath, json, force = false } = options;
    const lockPath = `${eventsDbPath}.lock`;
    const lock = new DatabaseLock(lockPath);

    const metadata = lock.readMetadata();

    if (!metadata) {
        const result: LockClearResult = {
            success: true,
            cleared: false,
            message: 'No lock file exists',
            lockPath,
        };

        if (!json) {
            console.log('No lock file exists.');
        }

        return result;
    }

    const isStale = lock.isStale();

    if (!isStale && !force) {
        const result: LockClearResult = {
            success: false,
            cleared: false,
            message: `Lock is held by active process PID ${metadata.pid}. Use --force to clear anyway.`,
            lockPath,
            wasStale: false,
            metadata,
        };

        if (!json) {
            console.error(`Lock is held by active process PID ${metadata.pid} (${metadata.command ?? 'unknown'}).`);
            console.error('Use --force to clear anyway (may cause data corruption if process is still running).');
        }

        return result;
    }

    // Clear the lock
    lock.clear();

    const result: LockClearResult = {
        success: true,
        cleared: true,
        message: isStale
            ? `Cleared stale lock from PID ${metadata.pid}`
            : `Force-cleared lock from PID ${metadata.pid}`,
        lockPath,
        wasStale: isStale,
        metadata,
    };

    if (!json) {
        if (isStale) {
            console.log(`✓ Cleared stale lock from PID ${metadata.pid} (${metadata.command ?? 'unknown'})`);
        } else {
            console.log(`✓ Force-cleared lock from PID ${metadata.pid} (${metadata.command ?? 'unknown'})`);
            console.log('  Warning: If this process is still running, database corruption may occur.');
        }
    }

    return result;
}

export interface LockStatusResult {
    success: boolean;
    locked: boolean;
    lockPath: string;
    isStale?: boolean;
    metadata?: {
        pid: number;
        hostname: string;
        startedAt: number;
        command?: string;
    };
}

export interface LockStatusOptions {
    eventsDbPath: string;
    json: boolean;
}

export function runLockStatus(options: LockStatusOptions): LockStatusResult {
    const { eventsDbPath, json } = options;
    const lockPath = `${eventsDbPath}.lock`;
    const lock = new DatabaseLock(lockPath);

    const metadata = lock.readMetadata();

    if (!metadata) {
        const result: LockStatusResult = {
            success: true,
            locked: false,
            lockPath,
        };

        if (!json) {
            console.log('Database is not locked.');
        }

        return result;
    }

    const isStale = lock.isStale();
    const result: LockStatusResult = {
        success: true,
        locked: true,
        lockPath,
        isStale,
        metadata,
    };

    if (!json) {
        const startedAt = new Date(metadata.startedAt).toISOString();
        console.log('Database Lock Status');
        console.log('--------------------');
        console.log(`Locked:     Yes${isStale ? ' (stale)' : ''}`);
        console.log(`PID:        ${metadata.pid}`);
        console.log(`Hostname:   ${metadata.hostname}`);
        console.log(`Command:    ${metadata.command ?? 'unknown'}`);
        console.log(`Started:    ${startedAt}`);

        if (isStale) {
            console.log('');
            console.log('This lock appears stale (process no longer running).');
            console.log('Run: hzl lock clear');
        }
    }

    return result;
}

export function createLockCommand(): Command {
    const lockCommand = new Command('lock')
        .description('Manage database lock');

    lockCommand
        .command('status')
        .description('Show current lock status')
        .action(function (this: Command) {
            const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
            const { eventsDbPath } = resolveDbPaths(globalOpts.db);

            const result = runLockStatus({
                eventsDbPath,
                json: globalOpts.json,
            });

            if (globalOpts.json) {
                console.log(JSON.stringify(result));
            }
        });

    lockCommand
        .command('clear')
        .description('Clear a stale database lock')
        .option('-f, --force', 'Clear lock even if process appears active (dangerous)')
        .action(function (this: Command) {
            const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
            const localOpts = z.object({
                force: z.boolean().optional(),
            }).parse(this.opts());

            const { eventsDbPath } = resolveDbPaths(globalOpts.db);

            const result = runLockClear({
                eventsDbPath,
                json: globalOpts.json,
                force: localOpts.force,
            });

            if (globalOpts.json) {
                console.log(JSON.stringify(result));
            }

            process.exit(result.success ? 0 : 1);
        });

    return lockCommand;
}
