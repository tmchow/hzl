import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runConfig } from './config.js';

describe('runConfig', () => {
  const originalEnv = process.env;
  let tempDir: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.HZL_DB;
    delete process.env.HZL_CONFIG;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-config-cmd-test-'));
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('shows db path from config file', () => {
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ dbPath: '/my/db.sqlite' }));

    const result = runConfig({ cliPath: undefined, json: true, configPath });

    expect(result.db.value).toBe('/my/db.sqlite');
    expect(result.db.source).toBe('config');
  });

  it('shows db path from CLI flag', () => {
    const configPath = path.join(tempDir, 'config.json');

    const result = runConfig({ cliPath: '/cli/db.sqlite', json: true, configPath });

    expect(result.db.value).toBe('/cli/db.sqlite');
    expect(result.db.source).toBe('cli');
  });

  it('shows db path from env var', () => {
    const configPath = path.join(tempDir, 'config.json');
    process.env.HZL_DB = '/env/db.sqlite';

    const result = runConfig({ cliPath: undefined, json: true, configPath });

    expect(result.db.value).toBe('/env/db.sqlite');
    expect(result.db.source).toBe('env');
  });

  it('shows default when nothing configured', () => {
    const configPath = path.join(tempDir, 'nonexistent.json');

    const result = runConfig({ cliPath: undefined, json: true, configPath });

    expect(result.db.value).toContain('.hzl/data.db');
    expect(result.db.source).toBe('default');
  });
});
