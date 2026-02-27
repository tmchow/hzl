import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, initializeDb } from '../db.js';
import { createHookCommand, runHookDrain } from './hook.js';

describe('hook command', () => {
  let tempDir: string;
  let eventsDbPath: string;
  let cacheDbPath: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-hook-command-test-'));
    eventsDbPath = path.join(tempDir, 'events.db');
    cacheDbPath = path.join(tempDir, 'cache.db');
    const services = initializeDb({ eventsDbPath, cacheDbPath });
    closeDb(services);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('drains queued records through runHookDrain', async () => {
    const setup = initializeDb({ eventsDbPath, cacheDbPath });
    try {
      setup.cacheDb.prepare(`
        INSERT INTO hook_outbox (
          hook_name,
          status,
          url,
          headers,
          payload,
          attempts,
          next_attempt_at,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'on_done',
        'queued',
        'https://example.com/hooks/done',
        '{"Authorization":"Bearer test"}',
        '{"task_id":"TASK-1","status":"done"}',
        0,
        '2026-02-27T11:59:00.000Z',
        '2026-02-27T11:00:00.000Z'
      );
    } finally {
      closeDb(setup);
    }

    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const result = await runHookDrain({
      eventsDbPath,
      cacheDbPath,
      json: true,
      now: () => new Date('2026-02-27T12:00:00.000Z'),
      random: () => 0.5,
      fetchFn: fetchMock as unknown as typeof fetch,
      workerId: 'cmd-worker',
    });

    expect(result.claimed).toBe(1);
    expect(result.delivered).toBe(1);
    expect(result.retried).toBe(0);
    expect(result.failed).toBe(0);

    const verify = initializeDb({ eventsDbPath, cacheDbPath });
    try {
      const row = verify.cacheDb.prepare(`
        SELECT status, delivered_at
        FROM hook_outbox
        ORDER BY id ASC
        LIMIT 1
      `).get() as { status: string; delivered_at: string | null };
      expect(row.status).toBe('delivered');
      expect(row.delivered_at).toBe('2026-02-27T12:00:00.000Z');
    } finally {
      closeDb(verify);
    }
  });

  it('creates a hook command with drain subcommand', () => {
    const command = createHookCommand();
    expect(command.name()).toBe('hook');
    const subcommands = command.commands.map((subcommand) => subcommand.name());
    expect(subcommands).toContain('drain');
  });
});
