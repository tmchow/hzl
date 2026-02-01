import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSyncCommand, runSync } from './sync.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('hzl sync command', () => {
    const testDir = path.join(os.tmpdir(), `sync-test-${Date.now()}`);
    const eventsDb = path.join(testDir, 'events.db');
    const cacheDb = path.join(testDir, 'cache.db');

    beforeEach(() => {
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    describe('runSync', () => {
        it('returns success for local-only database', async () => {
            const result = await runSync({
                eventsDbPath: eventsDb,
                cacheDbPath: cacheDb,
                json: false,
            });

            expect(result.success).toBe(true);
            expect(result.mode).toBe('local-only');
            expect(result.message).toContain('local-only');
        });

        it('returns JSON output when requested', async () => {
            const result = await runSync({
                eventsDbPath: eventsDb,
                cacheDbPath: cacheDb,
                json: true,
            });

            expect(result.success).toBe(true);
            expect(typeof result.data).toBe('object');
        });
    });

    describe('createSyncCommand', () => {
        it('creates a command with correct name', () => {
            const cmd = createSyncCommand();
            expect(cmd.name()).toBe('sync');
        });

        it('has conflict-strategy option', () => {
            const cmd = createSyncCommand();
            const opts = cmd.options.map((o: any) => o.long);
            expect(opts).toContain('--conflict-strategy');
        });
    });
});
