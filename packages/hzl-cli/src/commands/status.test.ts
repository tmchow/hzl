import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStatusCommand, runStatus } from './status.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('hzl status command', () => {
    const testDir = path.join(os.tmpdir(), `status-test-${Date.now()}`);
    const eventsDb = path.join(testDir, 'events.db');
    const cacheDb = path.join(testDir, 'cache.db');

    beforeEach(() => {
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    describe('runStatus', () => {
        it('returns database status', async () => {
            const result = await runStatus({
                eventsDbPath: eventsDb,
                cacheDbPath: cacheDb,
                json: true,
            });

            expect(result.success).toBe(true);
            expect(result.data.mode).toBe('local-only');
            expect(result.data.eventsDb).toBe(eventsDb);
            expect(result.data.cacheDb).toBe(cacheDb);
            expect(result.data.instanceId).toBeDefined();
            expect(result.data.deviceId).toBeDefined();
        });

        it('shows no sync info for local-only mode', async () => {
            const result = await runStatus({
                eventsDbPath: eventsDb,
                cacheDbPath: cacheDb,
                json: true,
            });

            expect(result.data.syncUrl).toBeUndefined();
            expect(result.data.lastSyncAt).toBeUndefined();
        });
    });

    describe('createStatusCommand', () => {
        it('creates a command with correct name', () => {
            const cmd = createStatusCommand();
            expect(cmd.name()).toBe('status');
        });
    });
});
