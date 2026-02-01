import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runProjectCreate } from './create.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';

describe('runProjectCreate', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-project-create-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a project with name only', () => {
    const result = runProjectCreate({ services, name: 'myproject', json: false });

    expect(result.name).toBe('myproject');
    expect(result.description).toBeNull();
    expect(result.is_protected).toBe(false);
  });

  it('creates a project with description', () => {
    const result = runProjectCreate({
      services,
      name: 'myproject',
      description: 'Test project',
      json: false,
    });

    expect(result.description).toBe('Test project');
  });
});
