import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runProjectRename } from './rename.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import { ProjectAlreadyExistsError } from 'hzl-core/services/project-service.js';

describe('runProjectRename', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-project-rename-test-'));
    dbPath = path.join(tempDir, 'test.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('renames a project', () => {
    services.projectService.createProject('old');

    const result = runProjectRename({ services, oldName: 'old', newName: 'new', json: false });

    expect(result.old_name).toBe('old');
    expect(result.new_name).toBe('new');
    expect(services.projectService.getProject('old')).toBeNull();
    expect(services.projectService.getProject('new')).not.toBeNull();
  });

  it('throws when target project already exists', () => {
    services.projectService.createProject('old');
    services.projectService.createProject('new');

    expect(() => runProjectRename({ services, oldName: 'old', newName: 'new', json: false }))
      .toThrow(ProjectAlreadyExistsError);
  });
});
