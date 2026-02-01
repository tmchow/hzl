// packages/hzl-cli/src/commands/export-events.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runExportEvents } from './export-events.js';
import { initializeDbFromPath, closeDb, type Services } from '../db.js';

describe('runExportEvents', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-export-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('exports events to file', () => {
    services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    services.taskService.createTask({ title: 'Task 2', project: 'inbox' });

    const exportPath = path.join(tempDir, 'events.jsonl');
    const result = runExportEvents({ services, outputPath: exportPath, json: false });

    expect(result.count).toBeGreaterThanOrEqual(2);
    expect(result.path).toBe(exportPath);
    expect(fs.existsSync(exportPath)).toBe(true);
  });

  it('returns count of exported events', () => {
    services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    
    const result = runExportEvents({ services, outputPath: '-', json: true });
    expect(result.count).toBeGreaterThanOrEqual(1);
  });
});
