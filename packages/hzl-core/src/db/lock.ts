import fs from 'fs';
import os from 'os';

export interface LockMetadata {
    pid: number;
    hostname: string;
    startedAt: number;
    command?: string;
    version?: string;
}

export interface LockGuard {
    release(): void;
    staleLockCleared: boolean;
}

export interface LockOptions {
    command?: string;
    version?: string;
}

function isPidRunning(pid: number): boolean {
    try {
        // Sending signal 0 checks if process exists without killing it
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

export class DatabaseLock {
    private lockPath: string;
    private options: LockOptions;

    constructor(lockPath: string, options: LockOptions = {}) {
        this.lockPath = lockPath;
        this.options = options;
    }

    /**
     * Read current lock metadata if lock file exists
     */
    readMetadata(): LockMetadata | null {
        if (!fs.existsSync(this.lockPath)) {
            return null;
        }
        try {
            const content = fs.readFileSync(this.lockPath, 'utf-8');
            return JSON.parse(content) as LockMetadata;
        } catch {
            return null;
        }
    }

    /**
     * Check if lock is stale (held by dead process)
     */
    isStale(): boolean {
        const metadata = this.readMetadata();
        if (!metadata) return false;

        // Only consider stale if on same hostname (can't check PIDs across machines)
        if (metadata.hostname !== os.hostname()) {
            return false;
        }

        return !isPidRunning(metadata.pid);
    }

    /**
     * Clear the lock file
     */
    clear(): void {
        if (fs.existsSync(this.lockPath)) {
            fs.unlinkSync(this.lockPath);
        }
    }

    /**
     * Acquire the lock with timeout.
     * Uses exponential backoff starting at 5ms for fast CLI responsiveness.
     */
    async acquire(timeoutMs: number): Promise<LockGuard> {
        const startTime = Date.now();
        let staleLockCleared = false;
        let attempt = 0;
        const BASE_DELAY_MS = 5;
        const MAX_DELAY_MS = 100;

        while (Date.now() - startTime < timeoutMs) {
            // Check for stale lock
            if (this.isStale()) {
                this.clear();
                staleLockCleared = true;
            }

            // Try to create lock file exclusively
            try {
                const metadata: LockMetadata = {
                    pid: process.pid,
                    hostname: os.hostname(),
                    startedAt: Date.now(),
                    command: this.options.command,
                    version: this.options.version,
                };

                // O_EXCL ensures atomic creation - fails if file exists
                const fd = fs.openSync(this.lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
                fs.writeSync(fd, JSON.stringify(metadata, null, 2));
                fs.closeSync(fd);

                return {
                    release: () => this.clear(),
                    staleLockCleared,
                };
            } catch (err) {
                const error = err as NodeJS.ErrnoException;
                if (error.code !== 'EEXIST') {
                    throw err;
                }
                // Lock exists, wait with exponential backoff (5ms, 10ms, 20ms, 40ms, 80ms, 100ms max)
                const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
                await new Promise(resolve => setTimeout(resolve, delay));
                attempt++;
            }
        }

        const metadata = this.readMetadata();
        const holder = metadata
            ? `PID ${metadata.pid} (${metadata.command ?? 'unknown'}) since ${new Date(metadata.startedAt).toISOString()}`
            : 'unknown process';
        throw new Error(`Lock is held by ${holder}. Timeout after ${timeoutMs}ms.`);
    }
}
