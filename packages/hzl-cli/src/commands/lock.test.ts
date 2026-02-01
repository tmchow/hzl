import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runLockClear, runLockStatus, createLockCommand } from './lock.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('hzl lock command', () => {
    const testDir = path.join(os.tmpdir(), `lock-test-${Date.now()}`);
    const eventsDb = path.join(testDir, 'events.db');
    const lockPath = `${eventsDb}.lock`;

    beforeEach(() => {
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    describe('runLockStatus', () => {
        it('reports no lock when none exists', async () => {
            const result = await runLockStatus({
                eventsDbPath: eventsDb,
                json: true,
            });

            expect(result.success).toBe(true);
            expect(result.locked).toBe(false);
        });

        it('reports lock details when lock exists', async () => {
            // Create a lock file manually (simulating a stale lock from dead process)
            const metadata = {
                pid: 99999, // Non-existent PID
                hostname: os.hostname(),
                startedAt: Date.now(),
                command: 'test-command',
            };
            fs.writeFileSync(lockPath, JSON.stringify(metadata, null, 2));

            const result = await runLockStatus({
                eventsDbPath: eventsDb,
                json: true,
            });

            expect(result.success).toBe(true);
            expect(result.locked).toBe(true);
            expect(result.metadata?.pid).toBe(99999);
            expect(result.metadata?.command).toBe('test-command');
        });
    });

    describe('runLockClear', () => {
        it('reports no lock when none exists', async () => {
            const result = await runLockClear({
                eventsDbPath: eventsDb,
                json: true,
            });

            expect(result.success).toBe(true);
            expect(result.cleared).toBe(false);
            expect(result.message).toContain('No lock file exists');
        });

        it('clears stale lock without --force', async () => {
            // Create a stale lock (non-existent PID)
            const metadata = {
                pid: 99999,
                hostname: os.hostname(),
                startedAt: Date.now(),
                command: 'dead-process',
            };
            fs.writeFileSync(lockPath, JSON.stringify(metadata, null, 2));

            const result = await runLockClear({
                eventsDbPath: eventsDb,
                json: true,
            });

            expect(result.success).toBe(true);
            expect(result.cleared).toBe(true);
            expect(result.wasStale).toBe(true);
            expect(fs.existsSync(lockPath)).toBe(false);
        });

        it('refuses to clear active lock without --force', async () => {
            // Create a lock with current process PID (definitely active)
            const metadata = {
                pid: process.pid,
                hostname: os.hostname(),
                startedAt: Date.now(),
                command: 'current-process',
            };
            fs.writeFileSync(lockPath, JSON.stringify(metadata, null, 2));

            const result = await runLockClear({
                eventsDbPath: eventsDb,
                json: true,
                force: false,
            });

            expect(result.success).toBe(false);
            expect(result.cleared).toBe(false);
            expect(result.message).toContain('Use --force');
            expect(fs.existsSync(lockPath)).toBe(true);
        });

        it('clears active lock with --force', async () => {
            // Create a lock with current process PID
            const metadata = {
                pid: process.pid,
                hostname: os.hostname(),
                startedAt: Date.now(),
                command: 'current-process',
            };
            fs.writeFileSync(lockPath, JSON.stringify(metadata, null, 2));

            const result = await runLockClear({
                eventsDbPath: eventsDb,
                json: true,
                force: true,
            });

            expect(result.success).toBe(true);
            expect(result.cleared).toBe(true);
            expect(result.wasStale).toBe(false);
            expect(fs.existsSync(lockPath)).toBe(false);
        });
    });

    describe('createLockCommand', () => {
        it('creates a command with correct name', () => {
            const cmd = createLockCommand();
            expect(cmd.name()).toBe('lock');
        });

        it('has status and clear subcommands', () => {
            const cmd = createLockCommand();
            const subcommands = cmd.commands.map((c: any) => c.name());
            expect(subcommands).toContain('status');
            expect(subcommands).toContain('clear');
        });

        it('clear subcommand has --force option', () => {
            const cmd = createLockCommand();
            const clearCmd = cmd.commands.find((c: any) => c.name() === 'clear');
            const opts = clearCmd?.options.map((o: any) => o.long);
            expect(opts).toContain('--force');
        });
    });
});
