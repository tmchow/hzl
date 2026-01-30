// packages/hzl-core/src/services/task-service.ts
import type Database from 'better-sqlite3';
import { EventStore } from '../events/store.js';
import { EventType, TaskStatus, type TaskCreatedData } from '../events/types.js';
import { ProjectionEngine } from '../projections/engine.js';
import { withWriteTransaction } from '../db/connection.js';
import { generateId } from '../utils/id.js';

export interface CreateTaskInput {
  title: string;
  project: string;
  parent_id?: string;
  description?: string;
  links?: string[];
  depends_on?: string[];
  tags?: string[];
  priority?: number;
  due_at?: string;
  metadata?: Record<string, unknown>;
}

export interface EventContext {
  author?: string;
  agent_id?: string;
  session_id?: string;
  correlation_id?: string;
  causation_id?: string;
}

export interface Task {
  task_id: string;
  title: string;
  project: string;
  status: TaskStatus;
  parent_id: string | null;
  description: string | null;
  links: string[];
  tags: string[];
  priority: number;
  due_at: string | null;
  metadata: Record<string, unknown>;
  claimed_at: string | null;
  claimed_by_author: string | null;
  claimed_by_agent_id: string | null;
  lease_until: string | null;
  created_at: string;
  updated_at: string;
}

export class TaskService {
  constructor(
    private db: Database.Database,
    private eventStore: EventStore,
    private projectionEngine: ProjectionEngine
  ) {}

  createTask(input: CreateTaskInput, ctx?: EventContext): Task {
    const taskId = generateId();

    const eventData: TaskCreatedData = {
      title: input.title,
      project: input.project,
      parent_id: input.parent_id,
      description: input.description,
      links: input.links,
      depends_on: input.depends_on,
      tags: input.tags,
      priority: input.priority,
      due_at: input.due_at,
      metadata: input.metadata,
    };

    Object.keys(eventData).forEach((key) => {
      if ((eventData as any)[key] === undefined) {
        delete (eventData as any)[key];
      }
    });

    const task = withWriteTransaction(this.db, () => {
      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.TaskCreated,
        data: eventData,
        author: ctx?.author,
        agent_id: ctx?.agent_id,
        session_id: ctx?.session_id,
        correlation_id: ctx?.correlation_id,
        causation_id: ctx?.causation_id,
      });

      this.projectionEngine.applyEvent(event);
      return this.getTaskById(taskId);
    });

    if (!task) {
      throw new Error(`Failed to create task: task not found after creation`);
    }
    return task;
  }

  getTaskById(taskId: string): Task | null {
    const row = this.db.prepare(
      'SELECT * FROM tasks_current WHERE task_id = ?'
    ).get(taskId) as any;
    if (!row) return null;
    return this.rowToTask(row);
  }

  private rowToTask(row: any): Task {
    return {
      task_id: row.task_id,
      title: row.title,
      project: row.project,
      status: row.status as TaskStatus,
      parent_id: row.parent_id,
      description: row.description,
      links: JSON.parse(row.links),
      tags: JSON.parse(row.tags),
      priority: row.priority,
      due_at: row.due_at,
      metadata: JSON.parse(row.metadata),
      claimed_at: row.claimed_at,
      claimed_by_author: row.claimed_by_author,
      claimed_by_agent_id: row.claimed_by_agent_id,
      lease_until: row.lease_until,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
