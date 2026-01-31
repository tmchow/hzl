// packages/hzl-cli/src/commands/init.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runInit } from './init.js';

describe('runInit', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-init-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates database file at specified path', async () => {
    const dbPath = path.join(tempDir, 'test.db');
    const configPath = path.join(tempDir, 'config.json');
    const result = await runInit({ dbPath, json: false, configPath });
    expect(fs.existsSync(dbPath)).toBe(true);
    expect(result.created).toBe(true);
  });

  it('creates parent directory if it does not exist', async () => {
    const dbPath = path.join(tempDir, 'nested', 'dir', 'test.db');
    const configPath = path.join(tempDir, 'config.json');
    await runInit({ dbPath, json: false, configPath });
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('is idempotent - does not corrupt existing database', async () => {
    const dbPath = path.join(tempDir, 'test.db');
    const configPath = path.join(tempDir, 'config.json');
    await runInit({ dbPath, json: false, configPath });
    const result = await runInit({ dbPath, json: false, configPath }); // Run again
    expect(fs.existsSync(dbPath)).toBe(true);
    expect(result.created).toBe(false);
  });

  it('returns path information', async () => {
    const dbPath = path.join(tempDir, 'test.db');
    const configPath = path.join(tempDir, 'config.json');
    const result = await runInit({ dbPath, json: false, configPath });
    expect(result.path).toBe(dbPath);
  });

  it('writes config file with dbPath after init', async () => {
    const dbPath = path.join(tempDir, 'data.db');
    const configPath = path.join(tempDir, 'config.json');

    await runInit({ dbPath, json: true, configPath });

    expect(fs.existsSync(configPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.dbPath).toBe(dbPath);
  });

  it('allows re-init with same path (idempotent)', async () => {
    const dbPath = path.join(tempDir, 'data.db');
    const configPath = path.join(tempDir, 'config.json');

    await runInit({ dbPath, json: true, configPath });
    await runInit({ dbPath, json: true, configPath }); // Second init

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.dbPath).toBe(dbPath);
  });

  it('errors when config points to different path without --force', async () => {
    const dbPath = path.join(tempDir, 'new.db');
    const configPath = path.join(tempDir, 'config.json');

    // Pre-existing config pointing elsewhere
    fs.writeFileSync(configPath, JSON.stringify({ dbPath: '/other/path.db' }));

    await expect(runInit({ dbPath, json: true, configPath }))
      .rejects.toThrow('Config already exists pointing to /other/path.db');
  });

  it('overwrites config when --force is used', async () => {
    const dbPath = path.join(tempDir, 'new.db');
    const configPath = path.join(tempDir, 'config.json');

    // Pre-existing config pointing elsewhere
    fs.writeFileSync(configPath, JSON.stringify({ dbPath: '/other/path.db' }));

    await runInit({ dbPath, json: true, configPath, force: true });

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.dbPath).toBe(dbPath);
  });
});
