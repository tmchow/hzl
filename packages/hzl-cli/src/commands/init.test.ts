import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createInitCommand, runInit, deleteExistingDatabases } from './init.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as hzlCore from 'hzl-core';

describe('hzl init command', () => {
  const testDir = path.join(os.tmpdir(), `init-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('runInit', () => {
    let configPath: string;

    beforeEach(() => {
      configPath = path.join(testDir, 'config.json');
    });

    it('accepts --sync-url option', () => {
      // Mock createDatastore to avoid network connection to Turso
      const mockDatastore: ReturnType<typeof hzlCore.createDatastore> = {
        eventsDb: {} as ReturnType<typeof hzlCore.createDatastore>['eventsDb'],
        cacheDb: {} as ReturnType<typeof hzlCore.createDatastore>['cacheDb'],
        mode: 'offline-sync',
        syncUrl: 'libsql://test.turso.io',
        instanceId: 'test-instance-id',
        deviceId: 'test-device-id',
        syncAttempts: [],
        sync: vi.fn().mockResolvedValue({ pushed: 0, pulled: 0 }),
        close: vi.fn(),
      };
      const spy = vi.spyOn(hzlCore, 'createDatastore').mockReturnValue(mockDatastore);

      try {
        const result = runInit({
          eventsDbPath: path.join(testDir, 'events.db'),
          cacheDbPath: path.join(testDir, 'cache.db'),
          pathSource: 'cli',
          json: true,
          syncUrl: 'libsql://test.turso.io',
          authToken: 'test-token',
          configPath
        });

        expect(result.syncUrl).toBe('libsql://test.turso.io');
        expect(result.mode).toBe('offline-sync');
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({
          events: expect.objectContaining({
            syncUrl: 'libsql://test.turso.io',
            authToken: 'test-token',
          })
        }));
      } finally {
        spy.mockRestore();
      }
    });

    it('accepts --local flag to disable sync', () => {
      // Mock existing config with sync
      fs.writeFileSync(configPath, JSON.stringify({ syncUrl: 'old-url' }));

      const result = runInit({
        eventsDbPath: path.join(testDir, 'events.db'),
        cacheDbPath: path.join(testDir, 'cache.db'),
        pathSource: 'cli',
        json: true,
        local: true,
        configPath
      });

      expect(result.mode).toBe('local-only');
      expect(result.syncUrl).toBeUndefined();
    });

    it('accepts --encryption-key option', () => {
      const result = runInit({
        eventsDbPath: path.join(testDir, 'events.db'),
        cacheDbPath: path.join(testDir, 'cache.db'),
        pathSource: 'cli',
        json: true,
        encryptionKey: 'secret-key',
        configPath
      });

      expect(result.encrypted).toBe(true);
    });

    it('persists dbPath to config when pathSource is cli', () => {
      const eventsDbPath = path.join(testDir, 'events.db');
      runInit({
        eventsDbPath,
        cacheDbPath: path.join(testDir, 'cache.db'),
        pathSource: 'cli',
        json: true,
        configPath
      });

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(savedConfig.dbPath).toBe(eventsDbPath);
    });

    it('does not persist dbPath to config when pathSource is default', () => {
      runInit({
        eventsDbPath: path.join(testDir, 'events.db'),
        cacheDbPath: path.join(testDir, 'cache.db'),
        pathSource: 'default',
        json: true,
        configPath
      });

      // Config file should not exist since no values were persisted
      expect(fs.existsSync(configPath)).toBe(false);
    });

    it('does not persist dbPath to config when pathSource is dev', () => {
      runInit({
        eventsDbPath: path.join(testDir, 'events.db'),
        cacheDbPath: path.join(testDir, 'cache.db'),
        pathSource: 'dev',
        json: true,
        configPath
      });

      // Config file should not exist since no values were persisted
      expect(fs.existsSync(configPath)).toBe(false);
    });

    it('clears existing config dbPath when using --reset-config', () => {
      const existingDbPath = '/existing/path/events.db';
      fs.writeFileSync(configPath, JSON.stringify({ dbPath: existingDbPath }));

      runInit({
        eventsDbPath: path.join(testDir, 'events.db'),
        cacheDbPath: path.join(testDir, 'cache.db'),
        pathSource: 'default',
        json: true,
        configPath,
        resetConfig: true
      });

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      // --reset-config clears the old dbPath so default location is used
      expect(savedConfig.dbPath).toBeUndefined();
    });

    it('preserves existing config dbPath without --reset-config when pathSource is config', () => {
      // Use paths in test directory
      const existingDbPath = path.join(testDir, 'existing', 'events.db');
      const existingCachePath = path.join(testDir, 'existing', 'cache.db');
      fs.writeFileSync(configPath, JSON.stringify({ dbPath: existingDbPath }));

      runInit({
        eventsDbPath: existingDbPath,
        cacheDbPath: existingCachePath,
        pathSource: 'config', // resolved from config, not default
        json: true,
        configPath,
        resetConfig: false
      });

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      // Without --reset-config, existing dbPath is preserved
      expect(savedConfig.dbPath).toBe(existingDbPath);
    });
  });

  describe('createInitCommand', () => {
    // Helper to safely extract option long names from Commander
    function getOptionLongNames(cmd: ReturnType<typeof createInitCommand>): string[] {
      return cmd.options
        .map((o) => {
          const opt = o as unknown as Record<string, unknown>;
          return typeof opt.long === 'string' ? opt.long : undefined;
        })
        .filter((x): x is string => x !== undefined);
    }

    it('has sync options', () => {
      const cmd = createInitCommand();
      const opts = getOptionLongNames(cmd);
      expect(opts).toContain('--sync-url');
      expect(opts).toContain('--auth-token');
      expect(opts).toContain('--encryption-key');
      expect(opts).toContain('--local');
    });

    it('has --reset-config option without short flag (non-destructive)', () => {
      const cmd = createInitCommand();
      const opts = getOptionLongNames(cmd);
      expect(opts).toContain('--reset-config');
      // Verify no -r short flag (could be confused with -r for recursive)
      const resetConfigOpt = cmd.options.find((o) => {
        const opt = o as unknown as Record<string, unknown>;
        return opt.long === '--reset-config';
      }) as Record<string, unknown> | undefined;
      expect(resetConfigOpt?.short).toBeUndefined();
    });

    it('has --force and --yes options for destructive reset', () => {
      const cmd = createInitCommand();
      const opts = getOptionLongNames(cmd);
      expect(opts).toContain('--force');
      expect(opts).toContain('--yes');
    });
  });

  describe('deleteExistingDatabases (--force helper)', () => {
    it('deletes events.db and cache.db files', () => {
      const eventsDbPath = path.join(testDir, 'events.db');
      const cacheDbPath = path.join(testDir, 'cache.db');

      // Create test files
      fs.writeFileSync(eventsDbPath, 'test data');
      fs.writeFileSync(cacheDbPath, 'test data');

      expect(fs.existsSync(eventsDbPath)).toBe(true);
      expect(fs.existsSync(cacheDbPath)).toBe(true);

      deleteExistingDatabases(eventsDbPath, cacheDbPath);

      expect(fs.existsSync(eventsDbPath)).toBe(false);
      expect(fs.existsSync(cacheDbPath)).toBe(false);
    });

    it('deletes WAL, SHM, and journal files if they exist', () => {
      const eventsDbPath = path.join(testDir, 'events.db');
      const cacheDbPath = path.join(testDir, 'cache.db');

      // Create test files including WAL/SHM/journal
      fs.writeFileSync(eventsDbPath, 'test data');
      fs.writeFileSync(eventsDbPath + '-wal', 'wal data');
      fs.writeFileSync(eventsDbPath + '-shm', 'shm data');
      fs.writeFileSync(eventsDbPath + '-journal', 'journal data');
      fs.writeFileSync(cacheDbPath, 'test data');
      fs.writeFileSync(cacheDbPath + '-wal', 'wal data');

      deleteExistingDatabases(eventsDbPath, cacheDbPath);

      expect(fs.existsSync(eventsDbPath)).toBe(false);
      expect(fs.existsSync(eventsDbPath + '-wal')).toBe(false);
      expect(fs.existsSync(eventsDbPath + '-shm')).toBe(false);
      expect(fs.existsSync(eventsDbPath + '-journal')).toBe(false);
      expect(fs.existsSync(cacheDbPath)).toBe(false);
      expect(fs.existsSync(cacheDbPath + '-wal')).toBe(false);
    });

    it('handles missing files gracefully', () => {
      const eventsDbPath = path.join(testDir, 'nonexistent-events.db');
      const cacheDbPath = path.join(testDir, 'nonexistent-cache.db');

      // Should not throw
      expect(() => deleteExistingDatabases(eventsDbPath, cacheDbPath)).not.toThrow();
    });

    it('deletes auxiliary files before main database (safe order)', () => {
      const eventsDbPath = path.join(testDir, 'events.db');
      const cacheDbPath = path.join(testDir, 'cache.db');

      // Track deletion order
      const deletionOrder: string[] = [];
      const originalUnlink = fs.unlinkSync;
      vi.spyOn(fs, 'unlinkSync').mockImplementation((p) => {
        deletionOrder.push(path.basename(String(p)));
        return originalUnlink(p);
      });

      // Create test files
      fs.writeFileSync(eventsDbPath, 'test data');
      fs.writeFileSync(eventsDbPath + '-wal', 'wal data');
      fs.writeFileSync(eventsDbPath + '-shm', 'shm data');
      fs.writeFileSync(cacheDbPath, 'test data');

      deleteExistingDatabases(eventsDbPath, cacheDbPath);

      // Verify auxiliary files deleted before main database
      const eventsDbIndex = deletionOrder.indexOf('events.db');
      const walIndex = deletionOrder.indexOf('events.db-wal');
      const shmIndex = deletionOrder.indexOf('events.db-shm');

      expect(walIndex).toBeLessThan(eventsDbIndex);
      expect(shmIndex).toBeLessThan(eventsDbIndex);

      vi.restoreAllMocks();
    });
  });
});
