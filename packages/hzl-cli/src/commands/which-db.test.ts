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
    const dbPath = path.join(tempDir, 'test.db');
    const result = runWhichDb({ cliPath: dbPath, json: false });
    expect(result.path).toBe(dbPath);
    expect(result.source).toBe('cli');
  });

  it('returns env var path when HZL_DB is set', () => {
    const dbPath = path.join(tempDir, 'env.db');
    process.env.HZL_DB = dbPath;
    const result = runWhichDb({ cliPath: undefined, json: false });
    expect(result.path).toBe(dbPath);
    expect(result.source).toBe('env');
  });

  it('returns default path when nothing specified', () => {
    const result = runWhichDb({ cliPath: undefined, json: false });
    expect(result.path).toContain('.hzl');
    expect(result.source).toBe('default');
  });
});
