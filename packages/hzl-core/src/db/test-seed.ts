import type Database from 'libsql';
import type { ProjectionEngine } from '../projections/engine.js';
import { EventType, TaskStatus } from '../events/types.js';

let seededEventCounter = 0;

export function resetSeedCounter(): void {
  seededEventCounter = 0;
}

export function seedEvent(
  eventsDb: Database.Database,
  projectionEngine: ProjectionEngine,
  input: {
    taskId: string;
    type: EventType;
    data: Record<string, unknown>;
    timestamp: string;
    author?: string;
    agentId?: string;
  }
): void {
  seededEventCounter += 1;
  const eventId = `seed-event-${seededEventCounter}`;
  const payload = {
    rowid: 0,
    event_id: eventId,
    task_id: input.taskId,
    type: input.type,
    data: input.data,
    author: input.author,
    agent_id: input.agentId,
    timestamp: input.timestamp,
  };

  eventsDb.prepare(`
    INSERT INTO events (
      event_id, task_id, type, data, schema_version, author, agent_id, timestamp
    ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
  `).run(
    eventId,
    input.taskId,
    input.type,
    JSON.stringify(input.data),
    input.author ?? null,
    input.agentId ?? null,
    input.timestamp
  );

  const row = eventsDb
    .prepare('SELECT id FROM events WHERE event_id = ?')
    .get(eventId) as { id: number };

  projectionEngine.applyEvent({ ...payload, rowid: row.id });
}

export function seedCompletedTask(
  eventsDb: Database.Database,
  projectionEngine: ProjectionEngine,
  input: {
    taskId: string;
    title: string;
    project: string;
    agent: string;
    readyAt: string;
    startedAt: string;
    doneAt: string;
  }
): void {
  seedEvent(eventsDb, projectionEngine, {
    taskId: input.taskId,
    type: EventType.TaskCreated,
    timestamp: input.readyAt,
    data: {
      title: input.title,
      project: input.project,
      agent: input.agent,
    },
  });
  seedEvent(eventsDb, projectionEngine, {
    taskId: input.taskId,
    type: EventType.StatusChanged,
    timestamp: input.readyAt,
    author: input.agent,
    data: {
      from: TaskStatus.Backlog,
      to: TaskStatus.Ready,
    },
  });
  seedEvent(eventsDb, projectionEngine, {
    taskId: input.taskId,
    type: EventType.StatusChanged,
    timestamp: input.startedAt,
    author: input.agent,
    data: {
      from: TaskStatus.Ready,
      to: TaskStatus.InProgress,
      agent: input.agent,
    },
  });
  seedEvent(eventsDb, projectionEngine, {
    taskId: input.taskId,
    type: EventType.StatusChanged,
    timestamp: input.doneAt,
    author: input.agent,
    data: {
      from: TaskStatus.InProgress,
      to: TaskStatus.Done,
    },
  });
}
