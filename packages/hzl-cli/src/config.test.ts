// packages/hzl-cli/src/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { resolveDbPath, getDefaultDbPath, getConfigPath } from './config.js';

describe('resolveDbPath', () => {
  const originalEnv = process.env;
  let tempDir: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.HZL_DB;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-test-'));
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns CLI option when provided', () => {
    const result = resolveDbPath('/custom/path/to/db.sqlite');
    expect(result).toBe('/custom/path/to/db.sqlite');
  });

  it('returns HZL_DB env var when CLI option not provided', () => {
    process.env.HZL_DB = '/env/path/to/db.sqlite';
    const result = resolveDbPath();
    expect(result).toBe('/env/path/to/db.sqlite');
  });

  it('CLI option takes precedence over env var', () => {
    process.env.HZL_DB = '/env/path/to/db.sqlite';
    const result = resolveDbPath('/cli/path/to/db.sqlite');
    expect(result).toBe('/cli/path/to/db.sqlite');
  });

  it('returns default path when nothing else specified', () => {
    const result = resolveDbPath();
    expect(result).toBe(getDefaultDbPath());
  });
});

describe('getConfigPath', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.HZL_CONFIG;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns HZL_CONFIG env var when set', () => {
    process.env.HZL_CONFIG = '/custom/config.json';
    expect(getConfigPath()).toBe('/custom/config.json');
  });

  it('returns default path when HZL_CONFIG not set', () => {
    expect(getConfigPath()).toContain('.hzl/config.json');
  });
});
