// packages/hzl-cli/src/commands/which-db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runWhichDb } from './which-db.js';

describe('runWhichDb', () => {
  const originalEnv = process.env;
  let tempDir: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.HZL_DB;
    delete process.env.HZL_CONFIG;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-which-db-test-'));
    // Point to a non-existent config file to avoid reading the user's config
    process.env.HZL_CONFIG = path.join(tempDir, 'nonexistent-config.json');
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns CLI option when provided', () => {
    const dbPath = path.join(tempDir, 'events.db');
    const result = runWhichDb({ cliPath: dbPath, json: false });
    expect(result.eventsDbPath).toBe(dbPath);
    expect(result.cacheDbPath).toBe(path.join(tempDir, 'cache.db'));
  });

  it('returns env var path when HZL_DB is set', () => {
    const dbPath = path.join(tempDir, 'env.db');
    process.env.HZL_DB = dbPath;
    const result = runWhichDb({ cliPath: undefined, json: false });
    expect(result.eventsDbPath).toBe(dbPath);
    expect(result.cacheDbPath).toBe(dbPath.replace('.db', '-cache.db'));
  });

  it('returns default path when nothing specified', () => {
    process.env.HZL_DEV_MODE = '0'; // Disable dev mode to test production behavior
    const result = runWhichDb({ cliPath: undefined, json: false });
    // Platform-aware assertion: Windows uses AppData\Local, Unix uses .local/share
    if (process.platform === 'win32') {
      expect(result.eventsDbPath).toMatch(/AppData[/\\]Local[/\\]hzl/);
    } else {
      expect(result.eventsDbPath).toContain('.local/share/hzl');
    }
    expect(result.eventsDbPath).toContain('events.db');
    expect(result.cacheDbPath).toContain('cache.db');
  });
});
