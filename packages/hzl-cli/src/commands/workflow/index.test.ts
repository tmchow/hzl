import { describe, expect, it } from 'vitest';
import { createWorkflowCommand } from './index.js';
import { createWorkflowRunCommand } from './run.js';
import { runWorkflowShow } from './show.js';
import { initializeDbFromPath, closeDb, type Services } from '../../db.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('workflow command shape', () => {
  it('registers list/show/run subcommands', () => {
    const command = createWorkflowCommand();
    const names = command.commands.map((subcommand) => subcommand.name());
    expect(names).toEqual(['list', 'show', 'run']);
  });

  it('registers start/handoff/delegate under workflow run', () => {
    const command = createWorkflowRunCommand();
    const names = command.commands.map((subcommand) => subcommand.name());
    expect(names).toEqual(['start', 'handoff', 'delegate']);
  });

  it('exposes explicit start auto-op-id guardrail in show output', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-workflow-show-test-'));
    const dbPath = path.join(tempDir, 'test.db');
    const services: Services = initializeDbFromPath(dbPath);
    try {
      const result = runWorkflowShow({ services, name: 'start', json: true });
      expect(result.workflow.supports_auto_op_id).toBe(false);
      expect(result.workflow.notes.join(' ')).toMatch(/auto-op-id/i);
    } finally {
      closeDb(services);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
