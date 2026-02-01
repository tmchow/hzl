import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createInitCommand, runInit } from './init.js';
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

    it('does not overwrite existing config dbPath when using default pathSource', () => {
      const existingDbPath = '/existing/path/events.db';
      fs.writeFileSync(configPath, JSON.stringify({ dbPath: existingDbPath }));

      runInit({
        eventsDbPath: path.join(testDir, 'events.db'),
        cacheDbPath: path.join(testDir, 'cache.db'),
        pathSource: 'default',
        json: true,
        configPath,
        force: true // Bypass conflict check
      });

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(savedConfig.dbPath).toBe(existingDbPath);
    });
  });

  describe('createInitCommand', () => {
    it('has sync options', () => {
      const cmd = createInitCommand();
      const opts = cmd.options.map((o: unknown) => (o as { long: string }).long);
      expect(opts).toContain('--sync-url');
      expect(opts).toContain('--auth-token');
      expect(opts).toContain('--encryption-key');
      expect(opts).toContain('--local');
    });
  });
});
