import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseLock, LockMetadata } from '../lock.js';

describe('DatabaseLock', () => {
    const testDir = path.join(os.tmpdir(), `lock-test-${Date.now()}`);
    const lockPath = path.join(testDir, 'test.db.lock');

    beforeEach(() => {
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('acquires lock when not held', async () => {
        const lock = new DatabaseLock(lockPath);
        const guard = await lock.acquire(1000);
        expect(guard).toBeDefined();
        expect(fs.existsSync(lockPath)).toBe(true);
        guard.release();
        expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('writes metadata to lock file', async () => {
        const lock = new DatabaseLock(lockPath, { command: 'test-cmd', version: '1.0.0' });
        const guard = await lock.acquire(1000);

        const content = fs.readFileSync(lockPath, 'utf-8');
        const metadata: LockMetadata = JSON.parse(content);

        expect(metadata.pid).toBe(process.pid);
        expect(metadata.command).toBe('test-cmd');
        expect(metadata.version).toBe('1.0.0');
        expect(typeof metadata.hostname).toBe('string');
        expect(typeof metadata.startedAt).toBe('number');

        guard.release();
    });

    it('fails to acquire when already held by same process', async () => {
        const lock1 = new DatabaseLock(lockPath);
        const guard1 = await lock1.acquire(1000);

        const lock2 = new DatabaseLock(lockPath);
        await expect(lock2.acquire(100)).rejects.toThrow(/lock.*held/i);

        guard1.release();
    });

    it('auto-clears stale lock from dead process', async () => {
        // Write a lock file with a PID that doesn't exist
        const staleLock: LockMetadata = {
            pid: 999999999, // Very high PID unlikely to exist
            hostname: os.hostname(),
            startedAt: Date.now() - 60000,
            command: 'dead-process',
            version: '1.0.0',
        };
        fs.writeFileSync(lockPath, JSON.stringify(staleLock));

        const lock = new DatabaseLock(lockPath);
        const guard = await lock.acquire(1000);

        expect(guard).toBeDefined();
        expect(guard.staleLockCleared).toBe(true);

        guard.release();
    });

    it('releases lock on guard disposal', async () => {
        const lock = new DatabaseLock(lockPath);
        {
            const guard = await lock.acquire(1000);
            expect(fs.existsSync(lockPath)).toBe(true);
            guard.release();
        }
        expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('acquires uncontested lock quickly (exponential backoff)', async () => {
        const lock = new DatabaseLock(lockPath);
        const startTime = Date.now();
        const guard = await lock.acquire(1000);
        const elapsed = Date.now() - startTime;

        // Uncontested lock should be acquired in < 10ms (no retry needed)
        expect(elapsed).toBeLessThan(20);
        guard.release();
    });
});
