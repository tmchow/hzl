import type Database from 'libsql';
import { EventStore } from '../events/store.js';
import { EventType, PROJECT_EVENT_TASK_ID } from '../events/types.js';
import { ProjectionEngine } from '../projections/engine.js';
import { withWriteTransaction } from '../db/transaction.js';

export interface Project {
  name: string;
  description: string | null;
  is_protected: boolean;
  created_at: string;
}

export interface CreateProjectOptions {
  description?: string;
  is_protected?: boolean;
}

type ProjectRow = {
  name: string;
  description: string | null;
  is_protected: number;
  created_at: string;
};

export class ProjectNotFoundError extends Error {
  constructor(name: string) {
    super(`Project not found: ${name}`);
    this.name = 'ProjectNotFoundError';
  }
}

export class ProtectedProjectError extends Error {
  constructor(name: string, action: string = 'modify') {
    super(`Cannot ${action} protected project: ${name}`);
    this.name = 'ProtectedProjectError';
  }
}

export class ProjectHasTasksError extends Error {
  constructor(name: string, taskCount: number, archivedTaskCount: number) {
    super(
      `Project '${name}' has ${taskCount} active tasks and ${archivedTaskCount} archived tasks. Use --move-to, --archive-tasks, or --delete-tasks.`
    );
    this.name = 'ProjectHasTasksError';
  }
}

export class ProjectAlreadyExistsError extends Error {
  constructor(name: string) {
    super(`Project already exists: ${name}`);
    this.name = 'ProjectAlreadyExistsError';
  }
}

export class ProjectService {
  constructor(
    private db: Database.Database,
    private eventStore: EventStore,
    private projectionEngine: ProjectionEngine
  ) {}

  createProject(name: string, options?: CreateProjectOptions): Project {
    return withWriteTransaction(this.db, () => {
      if (this.projectExists(name)) {
        throw new ProjectAlreadyExistsError(name);
      }

      const event = this.eventStore.append({
        task_id: PROJECT_EVENT_TASK_ID,
        type: EventType.ProjectCreated,
        data: {
          name,
          description: options?.description,
          is_protected: options?.is_protected,
        },
      });

      this.projectionEngine.applyEvent(event);
      return this.getProject(name)!;
    });
  }

  getProject(name: string): Project | null {
    const row = this.db
      .prepare(
        'SELECT name, description, is_protected, created_at FROM projects WHERE name = ?'
      )
      .get(name) as ProjectRow | undefined;
    if (!row) return null;
    return {
      name: row.name,
      description: row.description,
      is_protected: row.is_protected === 1,
      created_at: row.created_at,
    };
  }

  projectExists(name: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM projects WHERE name = ?').get(name);
    return row !== undefined;
  }

  listProjects(): Project[] {
    const rows = this.db
      .prepare(
        'SELECT name, description, is_protected, created_at FROM projects ORDER BY name'
      )
      .all() as ProjectRow[];
    return rows.map((row) => ({
      name: row.name,
      description: row.description,
      is_protected: row.is_protected === 1,
      created_at: row.created_at,
    }));
  }

  renameProject(oldName: string, newName: string): void {
    withWriteTransaction(this.db, () => {
      const project = this.getProject(oldName);
      if (!project) {
        throw new ProjectNotFoundError(oldName);
      }
      if (project.is_protected) {
        throw new ProtectedProjectError(oldName, 'rename');
      }
      if (this.projectExists(newName)) {
        throw new ProjectAlreadyExistsError(newName);
      }

      const event = this.eventStore.append({
        task_id: PROJECT_EVENT_TASK_ID,
        type: EventType.ProjectRenamed,
        data: {
          old_name: oldName,
          new_name: newName,
        },
      });

      this.projectionEngine.applyEvent(event);
    });
  }

  getTaskCount(projectName: string, includeArchived: boolean = false): number {
    if (includeArchived) {
      const result = this.db
        .prepare('SELECT COUNT(*) as count FROM tasks_current WHERE project = ?')
        .get(projectName) as { count: number };
      return result.count;
    }

    const result = this.db
      .prepare(
        'SELECT COUNT(*) as count FROM tasks_current WHERE project = ? AND status != ?'
      )
      .get(projectName, 'archived') as { count: number };
    return result.count;
  }

  ensureInboxExists(): void {
    const exists = this.projectExists('inbox');
    if (!exists) {
      try {
        this.createProject('inbox', { is_protected: true });
      } catch (e) {
        if (!(e instanceof ProjectAlreadyExistsError)) {
          throw e;
        }
      }
    }
  }

  requireProject(name: string): void {
    if (!this.projectExists(name)) {
      throw new ProjectNotFoundError(name);
    }
  }
}
