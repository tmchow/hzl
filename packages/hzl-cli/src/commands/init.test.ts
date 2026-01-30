// packages/hzl-cli/src/commands/init.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    const result = await runInit({ dbPath, json: false });
    expect(fs.existsSync(dbPath)).toBe(true);
    expect(result.created).toBe(true);
  });

  it('creates parent directory if it does not exist', async () => {
    const dbPath = path.join(tempDir, 'nested', 'dir', 'test.db');
    await runInit({ dbPath, json: false });
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('is idempotent - does not corrupt existing database', async () => {
    const dbPath = path.join(tempDir, 'test.db');
    await runInit({ dbPath, json: false });
    const result = await runInit({ dbPath, json: false }); // Run again
    expect(fs.existsSync(dbPath)).toBe(true);
    expect(result.created).toBe(false);
  });

  it('returns path information', async () => {
    const dbPath = path.join(tempDir, 'test.db');
    const result = await runInit({ dbPath, json: false });
    expect(result.path).toBe(dbPath);
  });
});
