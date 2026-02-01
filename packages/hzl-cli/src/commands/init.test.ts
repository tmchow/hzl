import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createInitCommand, runInit } from './init.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

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

    it('accepts --sync-url option', async () => {
      const result = await runInit({
        dbPath: path.join(testDir, 'data.db'),
        pathSource: 'cli',
        json: true,
        syncUrl: 'libsql://test.turso.io',
        authToken: 'test-token',
        configPath
      });

      expect(result.syncUrl).toBe('libsql://test.turso.io');
      expect(result.mode).toBe('offline-sync');
    });

    it('accepts --local flag to disable sync', async () => {
      // Mock existing config with sync
      fs.writeFileSync(configPath, JSON.stringify({ syncUrl: 'old-url' }));

      const result = await runInit({
        dbPath: path.join(testDir, 'data.db'),
        pathSource: 'cli',
        json: true,
        local: true,
        configPath
      });

      expect(result.mode).toBe('local-only');
      expect(result.syncUrl).toBeUndefined();
    });

    it('accepts --encryption-key option', async () => {
      const result = await runInit({
        dbPath: path.join(testDir, 'data.db'),
        pathSource: 'cli',
        json: true,
        encryptionKey: 'secret-key',
        configPath
      });

      expect(result.encrypted).toBe(true);
    });
  });

  describe('createInitCommand', () => {
    it('has sync options', () => {
      const cmd = createInitCommand();
      const opts = cmd.options.map((o: any) => o.long);
      expect(opts).toContain('--sync-url');
      expect(opts).toContain('--auth-token');
      expect(opts).toContain('--encryption-key');
      expect(opts).toContain('--local');
    });
  });
});
