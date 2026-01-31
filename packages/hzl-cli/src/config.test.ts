// packages/hzl-cli/src/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { resolveDbPath, getDefaultDbPath, getConfigPath, writeConfig, readConfig } from './config.js';

describe('resolveDbPath', () => {
  const originalEnv = process.env;
  let tempDir: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.HZL_DB;
    delete process.env.HZL_CONFIG;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-test-'));
    // Point to a non-existent config file to avoid reading the user's config
    process.env.HZL_CONFIG = path.join(tempDir, 'nonexistent-config.json');
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

describe('writeConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates config file with dbPath', () => {
    const configPath = path.join(tempDir, 'config.json');
    writeConfig({ dbPath: '/my/db.sqlite' }, configPath);

    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(content.dbPath).toBe('/my/db.sqlite');
  });

  it('creates parent directory if needed', () => {
    const configPath = path.join(tempDir, 'subdir', 'config.json');
    writeConfig({ dbPath: '/my/db.sqlite' }, configPath);

    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('merges with existing config', () => {
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ otherKey: 'value' }));

    writeConfig({ dbPath: '/my/db.sqlite' }, configPath);

    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(content.dbPath).toBe('/my/db.sqlite');
    expect(content.otherKey).toBe('value');
  });
});

describe('readConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-readconfig-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty config when file does not exist', () => {
    const configPath = path.join(tempDir, 'nonexistent.json');
    const config = readConfig(configPath);
    expect(config).toEqual({});
  });

  it('returns parsed config when file exists', () => {
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ dbPath: '/my/db.sqlite' }));

    const config = readConfig(configPath);
    expect(config.dbPath).toBe('/my/db.sqlite');
  });

  it('throws on invalid JSON', () => {
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, 'not valid json {{{');

    expect(() => readConfig(configPath))
      .toThrow(`Config file at ${configPath} is invalid JSON`);
  });
});
