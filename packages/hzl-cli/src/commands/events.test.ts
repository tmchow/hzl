import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initializeDbFromPath, closeDb, type Services } from '../db.js';
import { runEvents } from './events.js';

describe('runEvents', () => {
  let tempDir: string;
  let dbPath: string;
  let services: Services;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-events-test-'));
    dbPath = path.join(tempDir, 'events.db');
    services = initializeDbFromPath(dbPath);
  });

  afterEach(() => {
    closeDb(services);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('emits bounded NDJSON in rowid order', async () => {
    services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    services.taskService.createTask({ title: 'Task 2', project: 'inbox' });

    const lines: string[] = [];
    const result = await runEvents({
      services,
      writeLine: (line) => {
        lines.push(line);
      },
    });

    expect(result.count).toBe(3);
    const events = lines.map((line) => JSON.parse(line) as { rowid: number; type: string });
    expect(events.map((event) => event.rowid)).toEqual([1, 2, 3]);
    expect(events[0].type).toBe('project_created');
    expect(events[1].type).toBe('task_created');
    expect(events[2].type).toBe('task_created');
  });

  it('honors fromId and limit for bounded reads', async () => {
    services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    services.taskService.createTask({ title: 'Task 2', project: 'inbox' });
    services.taskService.createTask({ title: 'Task 3', project: 'inbox' });

    const lines: string[] = [];
    const result = await runEvents({
      services,
      fromId: 1,
      limit: 2,
      writeLine: (line) => {
        lines.push(line);
      },
    });

    expect(result.count).toBe(2);
    const events = lines.map((line) => JSON.parse(line) as { rowid: number });
    expect(events.map((event) => event.rowid)).toEqual([2, 3]);
  });

  it('starts follow mode from now when fromId is omitted', async () => {
    services.taskService.createTask({ title: 'Existing task', project: 'inbox' });

    const lines: string[] = [];
    const controller = new AbortController();
    let sleepCalls = 0;

    await runEvents({
      services,
      follow: true,
      signal: controller.signal,
      writeLine: (line) => {
        lines.push(line);
      },
      sleep: async () => {
        sleepCalls += 1;
        if (sleepCalls === 1) {
          services.taskService.createTask({ title: 'New task', project: 'inbox' });
          return;
        }
        controller.abort();
      },
    });

    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0]) as { type: string; data: { title: string } };
    expect(event.type).toBe('task_created');
    expect(event.data.title).toBe('New task');
  });

  it('limits only the initial catch-up batch in follow mode', async () => {
    services.taskService.createTask({ title: 'Task 1', project: 'inbox' });
    services.taskService.createTask({ title: 'Task 2', project: 'inbox' });
    services.taskService.createTask({ title: 'Task 3', project: 'inbox' });

    const lines: string[] = [];
    const controller = new AbortController();
    let sleepCalls = 0;

    await runEvents({
      services,
      fromId: 0,
      limit: 1,
      follow: true,
      signal: controller.signal,
      writeLine: (line) => {
        lines.push(line);
      },
      sleep: async () => {
        sleepCalls += 1;
        if (sleepCalls === 1) {
          services.taskService.createTask({ title: 'Task 4', project: 'inbox' });
          return;
        }
        controller.abort();
      },
    });

    const events = lines.map((line) => JSON.parse(line) as { rowid: number; data: { title?: string } });
    expect(events.map((event) => event.rowid)).toEqual([1, 2, 3, 4, 5]);
    expect(events.at(-1)?.data.title).toBe('Task 4');
  });
});
