import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDoctorCommand, runDoctor } from './doctor.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('hzl doctor command', () => {
    const testDir = path.join(os.tmpdir(), `doctor-test-${Date.now()}`);
    const eventsDb = path.join(testDir, 'events.db');
    const cacheDb = path.join(testDir, 'cache.db');

    beforeEach(() => {
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    describe('runDoctor', () => {
        it('returns healthy status for valid database', async () => {
            // Initialize database first
            const { createDatastore } = await import('hzl-core');
            const ds = createDatastore({
                events: { path: eventsDb, syncMode: 'offline', readYourWrites: true },
                cache: { path: cacheDb },
            });
            ds.close();

            const result = await runDoctor({
                eventsDbPath: eventsDb,
                cacheDbPath: cacheDb,
                configPath: path.join(testDir, 'config.json'),
                json: true,
            });

            expect(result.success).toBe(true);
            expect(result.status).toBe('healthy');
            expect(result.checks.database.status).toBe('pass');
        });

        it('reports unhealthy when database missing', async () => {
            const result = await runDoctor({
                eventsDbPath: path.join(testDir, 'nonexistent.db'),
                cacheDbPath: cacheDb,
                configPath: path.join(testDir, 'config.json'),
                json: true,
            });

            expect(result.success).toBe(false);
            expect(result.status).toBe('unhealthy');
            expect(result.checks.database.status).toBe('fail');
        });
    });

    describe('createDoctorCommand', () => {
        it('creates a command with correct name', () => {
            const cmd = createDoctorCommand();
            expect(cmd.name()).toBe('doctor');
        });
    });
});
