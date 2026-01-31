# Explicit Projects & Noun-Verb CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure HZL CLI to use explicit project management and consistent noun-verb command structure.

**Architecture:** Add ProjectService with event-sourced project lifecycle. Update TaskService to validate project existence. Restructure CLI around `hzl project` and `hzl task` subcommand groups.

**Tech Stack:** TypeScript, Commander.js, better-sqlite3, Zod, Vitest

---

## Phase 1: Core Infrastructure

### Task 1: Add Project Event Types

**Files:**
- Modify: `packages/hzl-core/src/events/types.ts`
- Create: `packages/hzl-core/src/events/types.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/events/types.test.ts
import { describe, it, expect } from 'vitest';
import { EventType, validateEventData } from './types.js';

describe('Project event types', () => {
  it('should have ProjectCreated event type', () => {
    expect(EventType.ProjectCreated).toBe('project_created');
  });

  it('should have ProjectRenamed event type', () => {
    expect(EventType.ProjectRenamed).toBe('project_renamed');
  });

  it('should have ProjectDeleted event type', () => {
    expect(EventType.ProjectDeleted).toBe('project_deleted');
  });

  it('should validate ProjectCreated data', () => {
    expect(() => validateEventData(EventType.ProjectCreated, {
      name: 'myproject',
      description: 'A test project',
    })).not.toThrow();
  });

  it('should validate ProjectCreated with is_protected', () => {
    expect(() => validateEventData(EventType.ProjectCreated, {
      name: 'inbox',
      is_protected: true,
    })).not.toThrow();
  });

  it('should validate ProjectRenamed data', () => {
    expect(() => validateEventData(EventType.ProjectRenamed, {
      old_name: 'oldproject',
      new_name: 'newproject',
    })).not.toThrow();
  });

  it('should validate ProjectDeleted data', () => {
    expect(() => validateEventData(EventType.ProjectDeleted, {
      name: 'myproject',
      task_count: 5,
      archived_task_count: 2,
    })).not.toThrow();
  });

  it('should reject ProjectCreated without name', () => {
    expect(() => validateEventData(EventType.ProjectCreated, {})).toThrow();
  });

  it('should reject ProjectRenamed without old_name', () => {
    expect(() => validateEventData(EventType.ProjectRenamed, { new_name: 'foo' })).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-core -- src/events/types.test.ts`
Expected: FAIL - EventType.ProjectCreated is not defined

**Step 3: Add event types and schemas**

```typescript
// Add to EventType enum in packages/hzl-core/src/events/types.ts
export enum EventType {
  // ... existing types ...
  ProjectCreated = 'project_created',
  ProjectRenamed = 'project_renamed',
  ProjectDeleted = 'project_deleted',
}

// Reserved task_id for project events (keeps NOT NULL constraint valid)
export const PROJECT_EVENT_TASK_ID = '__project__';

// Add schemas after existing schemas
const ProjectCreatedSchema = z.object({
  name: nonEmptyString,
  description: z.string().optional(),
  is_protected: z.boolean().optional(),
});

const ProjectRenamedSchema = z.object({
  old_name: nonEmptyString,
  new_name: nonEmptyString,
});

const ProjectDeletedSchema = z.object({
  name: nonEmptyString,
  task_count: z.number().int().min(0),
  archived_task_count: z.number().int().min(0),
});

// Add to EventSchemas record
export const EventSchemas: Record<EventType, z.ZodSchema<unknown>> = {
  // ... existing schemas ...
  [EventType.ProjectCreated]: ProjectCreatedSchema,
  [EventType.ProjectRenamed]: ProjectRenamedSchema,
  [EventType.ProjectDeleted]: ProjectDeletedSchema,
};

// Add exported types
export type ProjectCreatedData = z.infer<typeof ProjectCreatedSchema>;
export type ProjectRenamedData = z.infer<typeof ProjectRenamedSchema>;
export type ProjectDeletedData = z.infer<typeof ProjectDeletedSchema>;
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-core -- src/events/types.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add ProjectCreated, ProjectRenamed, and ProjectDeleted event types
```

---

### Task 2: Add Projects Table to Schema and Migration

**Files:**
- Modify: `packages/hzl-core/src/db/schema.ts`
- Modify: `packages/hzl-core/src/db/migrations.ts`
- Modify: `packages/hzl-core/src/db/migrations.test.ts`

**Step 1: Write the failing test**

Add to `packages/hzl-core/src/db/migrations.test.ts`:

```typescript
describe('projects table migration', () => {
  it('should create projects table', () => {
    // Start with a database that has tasks but no projects table
    const db = new Database(':memory:');
    db.exec(SCHEMA_V1); // Old schema without projects

    // Add some tasks to different projects
    db.prepare(`INSERT INTO tasks_current (task_id, title, project, status, created_at, updated_at, last_event_id)
      VALUES ('t1', 'Task 1', 'projectA', 'ready', datetime('now'), datetime('now'), 1)`).run();
    db.prepare(`INSERT INTO tasks_current (task_id, title, project, status, created_at, updated_at, last_event_id)
      VALUES ('t2', 'Task 2', 'projectB', 'ready', datetime('now'), datetime('now'), 2)`).run();

    // Run migration
    runMigrations(db);

    // Projects table should exist with synthetic projects
    const projects = db.prepare('SELECT name FROM projects ORDER BY name').all() as { name: string }[];
    expect(projects.map(p => p.name)).toContain('inbox');
    expect(projects.map(p => p.name)).toContain('projectA');
    expect(projects.map(p => p.name)).toContain('projectB');

    // Inbox should be protected
    const inbox = db.prepare('SELECT is_protected FROM projects WHERE name = ?').get('inbox') as any;
    expect(inbox.is_protected).toBe(1);

    db.close();
  });

  it('should emit synthetic ProjectCreated events for existing projects', () => {
    const db = new Database(':memory:');
    db.exec(SCHEMA_V1);

    // Add task to a project
    db.prepare(`INSERT INTO tasks_current (task_id, title, project, status, created_at, updated_at, last_event_id)
      VALUES ('t1', 'Task 1', 'myproject', 'ready', datetime('now'), datetime('now'), 1)`).run();

    runMigrations(db);

    // Should have ProjectCreated events
    const events = db.prepare(`SELECT * FROM events WHERE type = 'project_created'`).all() as any[];
    expect(events.length).toBeGreaterThanOrEqual(2); // inbox + myproject

    const projectNames = events.map(e => JSON.parse(e.data).name);
    expect(projectNames).toContain('inbox');
    expect(projectNames).toContain('myproject');

    db.close();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-core -- src/db/migrations.test.ts`
Expected: FAIL - projects table doesn't exist

**Step 3: Update schema and add migration**

Add to `SCHEMA_V1` in `packages/hzl-core/src/db/schema.ts`:

```sql
-- Projects table (projection from events)
CREATE TABLE IF NOT EXISTS projects (
  name TEXT PRIMARY KEY,
  description TEXT,
  is_protected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_event_id INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_protected ON projects(is_protected);
```

Add migration in `packages/hzl-core/src/db/migrations.ts`:

```typescript
// Migration to add projects table and emit synthetic events
function migrateToProjectsTable(db: Database.Database): void {
  // Check if projects table already exists
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
  ).get();

  if (tableExists) return;

  // Create projects table
  db.exec(`
    CREATE TABLE projects (
      name TEXT PRIMARY KEY,
      description TEXT,
      is_protected INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_event_id INTEGER NOT NULL
    );
    CREATE INDEX idx_projects_protected ON projects(is_protected);
  `);

  // Get all unique projects from tasks
  const existingProjects = db.prepare(
    'SELECT DISTINCT project FROM tasks_current'
  ).all() as { project: string }[];

  const timestamp = new Date().toISOString();
  const insertEvent = db.prepare(`
    INSERT INTO events (event_id, task_id, type, data, timestamp)
    VALUES (?, '__project__', 'project_created', ?, ?)
  `);
  const insertProject = db.prepare(`
    INSERT OR IGNORE INTO projects (name, description, is_protected, created_at, last_event_id)
    VALUES (?, NULL, ?, ?, last_insert_rowid())
  `);

  // Emit synthetic ProjectCreated events for existing projects
  for (const { project } of existingProjects) {
    const eventId = `synthetic-${project}-${Date.now()}`;
    const data = JSON.stringify({ name: project });
    insertEvent.run(eventId, data, timestamp);
    insertProject.run(project, 0, timestamp);
  }

  // Always ensure inbox exists and is protected
  const inboxExists = db.prepare('SELECT 1 FROM projects WHERE name = ?').get('inbox');
  if (!inboxExists) {
    const eventId = `synthetic-inbox-${Date.now()}`;
    const data = JSON.stringify({ name: 'inbox', is_protected: true });
    insertEvent.run(eventId, data, timestamp);
    insertProject.run('inbox', 1, timestamp);
  } else {
    // Ensure inbox is protected
    db.prepare('UPDATE projects SET is_protected = 1 WHERE name = ?').run('inbox');
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-core -- src/db/migrations.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add projects table schema and migration with synthetic events
```

---

### Task 3: Create Projects Projector

**Files:**
- Create: `packages/hzl-core/src/projections/projects.ts`
- Create: `packages/hzl-core/src/projections/projects.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/projections/projects.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ProjectsProjector } from './projects.js';
import { EventType, PROJECT_EVENT_TASK_ID } from '../events/types.js';
import type { PersistedEventEnvelope } from '../events/store.js';

describe('ProjectsProjector', () => {
  let db: Database.Database;
  let projector: ProjectsProjector;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE projects (
        name TEXT PRIMARY KEY,
        description TEXT,
        is_protected INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_event_id INTEGER NOT NULL
      );
    `);
    projector = new ProjectsProjector();
  });

  afterEach(() => {
    db.close();
  });

  it('should have correct name', () => {
    expect(projector.name).toBe('projects');
  });

  it('should handle ProjectCreated event', () => {
    const event: PersistedEventEnvelope = {
      rowid: 1,
      event_id: 'evt-1',
      task_id: PROJECT_EVENT_TASK_ID,
      type: EventType.ProjectCreated,
      data: { name: 'myproject', description: 'Test project' },
      timestamp: '2026-01-30T12:00:00.000Z',
    };

    projector.apply(event, db);

    const row = db.prepare('SELECT * FROM projects WHERE name = ?').get('myproject') as any;
    expect(row).toBeDefined();
    expect(row.name).toBe('myproject');
    expect(row.description).toBe('Test project');
    expect(row.is_protected).toBe(0);
  });

  it('should handle ProjectCreated with is_protected', () => {
    const event: PersistedEventEnvelope = {
      rowid: 1,
      event_id: 'evt-1',
      task_id: PROJECT_EVENT_TASK_ID,
      type: EventType.ProjectCreated,
      data: { name: 'inbox', is_protected: true },
      timestamp: '2026-01-30T12:00:00.000Z',
    };

    projector.apply(event, db);

    const row = db.prepare('SELECT * FROM projects WHERE name = ?').get('inbox') as any;
    expect(row.is_protected).toBe(1);
  });

  it('should handle ProjectRenamed event', () => {
    // First create a project
    db.prepare('INSERT INTO projects (name, description, is_protected, created_at, last_event_id) VALUES (?, ?, ?, ?, ?)').run('oldname', null, 0, '2026-01-30T12:00:00.000Z', 1);

    const event: PersistedEventEnvelope = {
      rowid: 2,
      event_id: 'evt-2',
      task_id: PROJECT_EVENT_TASK_ID,
      type: EventType.ProjectRenamed,
      data: { old_name: 'oldname', new_name: 'newname' },
      timestamp: '2026-01-30T12:01:00.000Z',
    };

    projector.apply(event, db);

    const oldRow = db.prepare('SELECT * FROM projects WHERE name = ?').get('oldname');
    expect(oldRow).toBeUndefined();

    const newRow = db.prepare('SELECT * FROM projects WHERE name = ?').get('newname') as any;
    expect(newRow).toBeDefined();
    expect(newRow.name).toBe('newname');
  });

  it('should handle ProjectDeleted event', () => {
    // First create a project
    db.prepare('INSERT INTO projects (name, description, is_protected, created_at, last_event_id) VALUES (?, ?, ?, ?, ?)').run('myproject', null, 0, '2026-01-30T12:00:00.000Z', 1);

    const event: PersistedEventEnvelope = {
      rowid: 2,
      event_id: 'evt-2',
      task_id: PROJECT_EVENT_TASK_ID,
      type: EventType.ProjectDeleted,
      data: { name: 'myproject', task_count: 0, archived_task_count: 0 },
      timestamp: '2026-01-30T12:01:00.000Z',
    };

    projector.apply(event, db);

    const row = db.prepare('SELECT * FROM projects WHERE name = ?').get('myproject');
    expect(row).toBeUndefined();
  });

  it('should reset projection', () => {
    db.prepare('INSERT INTO projects (name, description, is_protected, created_at, last_event_id) VALUES (?, ?, ?, ?, ?)').run('myproject', null, 0, '2026-01-30T12:00:00.000Z', 1);

    projector.reset(db);

    const count = db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number };
    expect(count.count).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-core -- src/projections/projects.test.ts`
Expected: FAIL - Cannot find module './projects.js'

**Step 3: Implement the projector**

```typescript
// packages/hzl-core/src/projections/projects.ts
import type Database from 'better-sqlite3';
import type { PersistedEventEnvelope } from '../events/store.js';
import type { Projector } from './types.js';
import { EventType } from '../events/types.js';

export class ProjectsProjector implements Projector {
  name = 'projects';

  apply(event: PersistedEventEnvelope, db: Database.Database): void {
    switch (event.type) {
      case EventType.ProjectCreated:
        this.handleProjectCreated(event, db);
        break;
      case EventType.ProjectRenamed:
        this.handleProjectRenamed(event, db);
        break;
      case EventType.ProjectDeleted:
        this.handleProjectDeleted(event, db);
        break;
    }
  }

  reset(db: Database.Database): void {
    db.exec('DELETE FROM projects');
  }

  private handleProjectCreated(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as { name: string; description?: string; is_protected?: boolean };
    db.prepare(`
      INSERT OR IGNORE INTO projects (name, description, is_protected, created_at, last_event_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.name,
      data.description ?? null,
      data.is_protected ? 1 : 0,
      event.timestamp,
      event.rowid
    );
  }

  private handleProjectRenamed(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as { old_name: string; new_name: string };

    // Get the old project's data
    const oldProject = db.prepare('SELECT * FROM projects WHERE name = ?').get(data.old_name) as any;
    if (!oldProject) return;

    // Delete old, insert new (atomic rename)
    db.prepare('DELETE FROM projects WHERE name = ?').run(data.old_name);
    db.prepare(`
      INSERT INTO projects (name, description, is_protected, created_at, last_event_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.new_name, oldProject.description, oldProject.is_protected, oldProject.created_at, event.rowid);

    // Update all tasks to point to new project name
    db.prepare('UPDATE tasks_current SET project = ? WHERE project = ?').run(data.new_name, data.old_name);
  }

  private handleProjectDeleted(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as { name: string };
    db.prepare('DELETE FROM projects WHERE name = ?').run(data.name);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-core -- src/projections/projects.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add ProjectsProjector for project lifecycle events
```

---

### Task 4: Create ProjectService

**Files:**
- Create: `packages/hzl-core/src/services/project-service.ts`
- Create: `packages/hzl-core/src/services/project-service.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/services/project-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ProjectService, ProjectNotFoundError, ProtectedProjectError, ProjectHasTasksError, ProjectAlreadyExistsError } from './project-service.js';
import { EventStore } from '../events/store.js';
import { ProjectionEngine } from '../projections/engine.js';
import { ProjectsProjector } from '../projections/projects.js';
import { TasksCurrentProjector } from '../projections/tasks-current.js';
import { SCHEMA_V1 } from '../db/schema.js';

describe('ProjectService', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let projectionEngine: ProjectionEngine;
  let projectService: ProjectService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA_V1);
    // Add projects table
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        name TEXT PRIMARY KEY,
        description TEXT,
        is_protected INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_event_id INTEGER NOT NULL
      );
    `);
    eventStore = new EventStore(db);
    projectionEngine = new ProjectionEngine(db);
    projectionEngine.register(new ProjectsProjector());
    projectionEngine.register(new TasksCurrentProjector());
    projectService = new ProjectService(db, eventStore, projectionEngine);
  });

  afterEach(() => {
    db.close();
  });

  describe('createProject', () => {
    it('should create a project', () => {
      const project = projectService.createProject('myproject', { description: 'Test' });
      expect(project.name).toBe('myproject');
      expect(project.description).toBe('Test');
      expect(project.is_protected).toBe(false);
    });

    it('should create protected project', () => {
      const project = projectService.createProject('inbox', { is_protected: true });
      expect(project.is_protected).toBe(true);
    });

    it('should throw ProjectAlreadyExistsError if project already exists', () => {
      projectService.createProject('myproject');
      expect(() => projectService.createProject('myproject')).toThrow(ProjectAlreadyExistsError);
    });
  });

  describe('getProject', () => {
    it('should get existing project', () => {
      projectService.createProject('myproject');
      const project = projectService.getProject('myproject');
      expect(project?.name).toBe('myproject');
    });

    it('should return null for non-existent project', () => {
      const project = projectService.getProject('nonexistent');
      expect(project).toBeNull();
    });
  });

  describe('projectExists', () => {
    it('should return true for existing project', () => {
      projectService.createProject('myproject');
      expect(projectService.projectExists('myproject')).toBe(true);
    });

    it('should return false for non-existent project', () => {
      expect(projectService.projectExists('nonexistent')).toBe(false);
    });
  });

  describe('listProjects', () => {
    it('should list all projects', () => {
      projectService.createProject('project-a');
      projectService.createProject('project-b');
      const projects = projectService.listProjects();
      expect(projects).toHaveLength(2);
    });
  });

  describe('renameProject', () => {
    it('should rename a project', () => {
      projectService.createProject('oldname');
      projectService.renameProject('oldname', 'newname');
      expect(projectService.projectExists('oldname')).toBe(false);
      expect(projectService.projectExists('newname')).toBe(true);
    });

    it('should throw when renaming non-existent project', () => {
      expect(() => projectService.renameProject('nonexistent', 'newname'))
        .toThrow(ProjectNotFoundError);
    });

    it('should throw when renaming protected project', () => {
      projectService.createProject('inbox', { is_protected: true });
      expect(() => projectService.renameProject('inbox', 'newname'))
        .toThrow(ProtectedProjectError);
    });

    it('should throw when target name already exists', () => {
      projectService.createProject('project-a');
      projectService.createProject('project-b');
      expect(() => projectService.renameProject('project-a', 'project-b'))
        .toThrow(ProjectAlreadyExistsError);
    });
  });

  describe('deleteProject', () => {
    it('should delete empty project', () => {
      projectService.createProject('myproject');
      projectService.deleteProject('myproject');
      expect(projectService.getProject('myproject')).toBeNull();
    });

    it('should throw when deleting protected project', () => {
      projectService.createProject('inbox', { is_protected: true });
      expect(() => projectService.deleteProject('inbox'))
        .toThrow(ProtectedProjectError);
    });

    it('should throw when deleting non-existent project', () => {
      expect(() => projectService.deleteProject('nonexistent'))
        .toThrow(ProjectNotFoundError);
    });

    it('should throw ProjectHasTasksError when project has tasks and no action specified', () => {
      projectService.createProject('myproject');
      // Add a task directly to the projection for testing
      db.prepare(`INSERT INTO tasks_current (task_id, title, project, status, created_at, updated_at, last_event_id)
        VALUES ('t1', 'Test', 'myproject', 'ready', datetime('now'), datetime('now'), 1)`).run();

      expect(() => projectService.deleteProject('myproject'))
        .toThrow(ProjectHasTasksError);
    });
  });

  describe('ensureInboxExists', () => {
    it('should create inbox if not exists', () => {
      projectService.ensureInboxExists();
      const inbox = projectService.getProject('inbox');
      expect(inbox).not.toBeNull();
      expect(inbox?.is_protected).toBe(true);
    });

    it('should be idempotent - not fail if inbox already exists', () => {
      projectService.ensureInboxExists();
      projectService.ensureInboxExists(); // Should not throw
      const projects = projectService.listProjects();
      expect(projects.filter(p => p.name === 'inbox')).toHaveLength(1);
    });
  });

  describe('getTaskCount', () => {
    it('should return task count excluding archived by default', () => {
      projectService.createProject('myproject');
      db.prepare(`INSERT INTO tasks_current (task_id, title, project, status, created_at, updated_at, last_event_id)
        VALUES ('t1', 'Test1', 'myproject', 'ready', datetime('now'), datetime('now'), 1)`).run();
      db.prepare(`INSERT INTO tasks_current (task_id, title, project, status, created_at, updated_at, last_event_id)
        VALUES ('t2', 'Test2', 'myproject', 'archived', datetime('now'), datetime('now'), 2)`).run();

      expect(projectService.getTaskCount('myproject', false)).toBe(1);
    });

    it('should include archived when requested', () => {
      projectService.createProject('myproject');
      db.prepare(`INSERT INTO tasks_current (task_id, title, project, status, created_at, updated_at, last_event_id)
        VALUES ('t1', 'Test1', 'myproject', 'ready', datetime('now'), datetime('now'), 1)`).run();
      db.prepare(`INSERT INTO tasks_current (task_id, title, project, status, created_at, updated_at, last_event_id)
        VALUES ('t2', 'Test2', 'myproject', 'archived', datetime('now'), datetime('now'), 2)`).run();

      expect(projectService.getTaskCount('myproject', true)).toBe(2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-core -- src/services/project-service.test.ts`
Expected: FAIL - Cannot find module './project-service.js'

**Step 3: Implement ProjectService**

```typescript
// packages/hzl-core/src/services/project-service.ts
import type Database from 'better-sqlite3';
import { EventStore } from '../events/store.js';
import { EventType, PROJECT_EVENT_TASK_ID } from '../events/types.js';
import { ProjectionEngine } from '../projections/engine.js';
import { withWriteTransaction } from '../db/connection.js';

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
  public taskCount: number;
  public archivedTaskCount: number;

  constructor(name: string, taskCount: number, archivedTaskCount: number) {
    super(`Project '${name}' has ${taskCount} active tasks and ${archivedTaskCount} archived tasks. Use --move-to, --archive-tasks, or --delete-tasks.`);
    this.name = 'ProjectHasTasksError';
    this.taskCount = taskCount;
    this.archivedTaskCount = archivedTaskCount;
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
    const row = this.db.prepare(
      'SELECT name, description, is_protected, created_at FROM projects WHERE name = ?'
    ).get(name) as any;
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
    const rows = this.db.prepare(
      'SELECT name, description, is_protected, created_at FROM projects ORDER BY name'
    ).all() as any[];
    return rows.map(row => ({
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

  deleteProject(name: string): void {
    withWriteTransaction(this.db, () => {
      const project = this.getProject(name);
      if (!project) {
        throw new ProjectNotFoundError(name);
      }
      if (project.is_protected) {
        throw new ProtectedProjectError(name, 'delete');
      }

      // Check for tasks (including archived)
      const activeCount = this.getTaskCount(name, false);
      const archivedCount = this.getTaskCount(name, true) - activeCount;

      if (activeCount > 0 || archivedCount > 0) {
        throw new ProjectHasTasksError(name, activeCount, archivedCount);
      }

      const event = this.eventStore.append({
        task_id: PROJECT_EVENT_TASK_ID,
        type: EventType.ProjectDeleted,
        data: {
          name,
          task_count: 0,
          archived_task_count: 0,
        },
      });

      this.projectionEngine.applyEvent(event);
    });
  }

  getTaskCount(projectName: string, includeArchived: boolean = false): number {
    if (includeArchived) {
      const result = this.db.prepare(
        'SELECT COUNT(*) as count FROM tasks_current WHERE project = ?'
      ).get(projectName) as { count: number };
      return result.count;
    } else {
      const result = this.db.prepare(
        'SELECT COUNT(*) as count FROM tasks_current WHERE project = ? AND status != ?'
      ).get(projectName, 'archived') as { count: number };
      return result.count;
    }
  }

  ensureInboxExists(): void {
    // Use INSERT OR IGNORE to make this idempotent and race-condition safe
    const exists = this.projectExists('inbox');
    if (!exists) {
      // Wrap in try-catch to handle race condition where another process creates inbox
      try {
        this.createProject('inbox', { is_protected: true });
      } catch (e) {
        // If it's ProjectAlreadyExistsError, that's fine - inbox was created by another process
        if (!(e instanceof ProjectAlreadyExistsError)) {
          throw e;
        }
      }
    }
  }

  /**
   * Validate that a project exists. Used by other services before operations.
   * @throws ProjectNotFoundError if project doesn't exist
   */
  requireProject(name: string): void {
    if (!this.projectExists(name)) {
      throw new ProjectNotFoundError(name);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-core -- src/services/project-service.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add ProjectService for project lifecycle management
```

---

### Task 5: Update TaskService to Validate Project Exists

**Files:**
- Modify: `packages/hzl-core/src/services/task-service.ts`
- Modify: `packages/hzl-core/src/services/task-service.test.ts`

**Step 1: Write the failing test**

Add to `packages/hzl-core/src/services/task-service.test.ts`:

```typescript
import { ProjectService, ProjectNotFoundError } from './project-service.js';
import { ProjectsProjector } from '../projections/projects.js';

describe('createTask with project validation', () => {
  let projectService: ProjectService;

  beforeEach(() => {
    // ... existing setup ...
    projectionEngine.register(new ProjectsProjector());
    projectService = new ProjectService(db, eventStore, projectionEngine);
    taskService = new TaskService(db, eventStore, projectionEngine, projectService);
  });

  it('should throw ProjectNotFoundError if project does not exist', () => {
    expect(() => taskService.createTask({
      title: 'Test task',
      project: 'nonexistent',
    })).toThrow(ProjectNotFoundError);
  });

  it('should create task if project exists', () => {
    projectService.createProject('myproject');

    const task = taskService.createTask({
      title: 'Test task',
      project: 'myproject',
    });

    expect(task.project).toBe('myproject');
  });

  it('should work with inbox project', () => {
    projectService.ensureInboxExists();

    const task = taskService.createTask({
      title: 'Test task',
      project: 'inbox',
    });

    expect(task.project).toBe('inbox');
  });
});

describe('moveTask with project validation', () => {
  it('should throw ProjectNotFoundError if target project does not exist', () => {
    projectService.createProject('source');
    const task = taskService.createTask({ title: 'Test', project: 'source' });

    expect(() => taskService.moveTask(task.task_id, 'nonexistent'))
      .toThrow(ProjectNotFoundError);
  });

  it('should move task if target project exists', () => {
    projectService.createProject('source');
    projectService.createProject('target');
    const task = taskService.createTask({ title: 'Test', project: 'source' });

    const moved = taskService.moveTask(task.task_id, 'target');
    expect(moved.project).toBe('target');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-core -- src/services/task-service.test.ts`
Expected: FAIL - task is created even if project doesn't exist

**Step 3: Update TaskService**

Add ProjectService as constructor dependency and add validation:

```typescript
// In TaskService constructor
constructor(
  private db: Database.Database,
  private eventStore: EventStore,
  private projectionEngine: ProjectionEngine,
  private projectService?: ProjectService
) {
  // ... existing code ...
}

// In createTask method, add at the start:
createTask(input: CreateTaskInput, ctx?: EventContext): Task {
  // Validate project exists
  if (this.projectService) {
    this.projectService.requireProject(input.project);
  }

  // ... rest of existing code ...
}

// Add moveTask method or update existing logic to validate target project:
moveTask(taskId: string, toProject: string, ctx?: EventContext): Task {
  return withWriteTransaction(this.db, () => {
    const task = this.getTaskById(taskId);
    if (!task) throw new TaskNotFoundError(taskId);

    // Validate target project exists
    if (this.projectService) {
      this.projectService.requireProject(toProject);
    }

    const event = this.eventStore.append({
      task_id: taskId,
      type: EventType.TaskMoved,
      data: { from_project: task.project, to_project: toProject },
      author: ctx?.author,
      agent_id: ctx?.agent_id,
    });

    this.projectionEngine.applyEvent(event);
    return this.getTaskById(taskId)!;
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-core -- src/services/task-service.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: validate project exists when creating/moving tasks
```

---

### Task 6: Update hzl-core Exports and Wire Up Services

**Files:**
- Modify: `packages/hzl-core/src/index.ts`
- Modify: `packages/hzl-cli/src/db.ts`

**Step 1: Export new modules from hzl-core**

Add to `packages/hzl-core/src/index.ts`:

```typescript
export * from './services/project-service.js';
export * from './projections/projects.js';
export { PROJECT_EVENT_TASK_ID } from './events/types.js';
```

**Step 2: Update CLI db.ts**

```typescript
// packages/hzl-cli/src/db.ts
import { ProjectService, ProjectsProjector } from 'hzl-core';

export interface Services {
  db: Database.Database;
  eventStore: EventStore;
  projectionEngine: ProjectionEngine;
  taskService: TaskService;
  projectService: ProjectService;  // Add this
}

export function initializeDb(dbPath: string): Services {
  const db = createConnection(dbPath);
  runMigrations(db);

  const eventStore = new EventStore(db);
  const projectionEngine = new ProjectionEngine(db);

  // Register projectors
  projectionEngine.register(new TasksCurrentProjector());
  projectionEngine.register(new DependenciesProjector());
  projectionEngine.register(new TagsProjector());
  projectionEngine.register(new SearchProjector());
  projectionEngine.register(new CommentsCheckpointsProjector());
  projectionEngine.register(new ProjectsProjector());  // Add this

  // Create services
  const projectService = new ProjectService(db, eventStore, projectionEngine);
  const taskService = new TaskService(db, eventStore, projectionEngine, projectService);

  // Ensure inbox exists
  projectService.ensureInboxExists();

  return { db, eventStore, projectionEngine, taskService, projectService };
}
```

**Step 3: Run all tests**

Run: `npm test`
Expected: PASS

**Step 4: Commit**

```
feat: wire up ProjectService and ProjectsProjector in CLI
```

---

### Task 7: Update Init and Verify Inbox Creation

**Files:**
- Modify: `packages/hzl-cli/src/commands/init.test.ts`

**Step 1: Add test for inbox creation**

```typescript
it('should create inbox project on init', async () => {
  await runInit({ dbPath: testDbPath, json: false });

  const services = initializeDb(testDbPath);
  try {
    const inbox = services.projectService.getProject('inbox');
    expect(inbox).not.toBeNull();
    expect(inbox?.is_protected).toBe(true);
  } finally {
    closeDb(services);
  }
});
```

**Step 2: Run test to verify it passes**

Run: `npm test -w hzl-cli -- src/commands/init.test.ts`
Expected: PASS (inbox created in initializeDb via ensureInboxExists)

**Step 3: Commit**

```
test: verify inbox project created on init
```

---

## Phase 2: CLI Restructure - Project Commands

### Task 8: Create `hzl project create` Command

**Files:**
- Create: `packages/hzl-cli/src/commands/project/create.ts`
- Create: `packages/hzl-cli/src/commands/project/create.test.ts`

Follow TDD pattern. Command signature:

```bash
hzl project create <name> [-d, --description <desc>]
```

**Commit:** `feat: add 'hzl project create' command`

---

### Task 9: Create `hzl project delete` Command

**Files:**
- Create: `packages/hzl-cli/src/commands/project/delete.ts`
- Create: `packages/hzl-cli/src/commands/project/delete.test.ts`

Command signature:

```bash
hzl project delete <name> [--move-to <project> | --archive-tasks | --delete-tasks]
```

Implementation must:
1. Validate flags are mutually exclusive
2. If `--move-to`, validate target project exists
3. If project has tasks and no flag, throw error with helpful message
4. Handle tasks FIRST (move/archive/delete via their respective events), THEN emit ProjectDeleted

**Commit:** `feat: add 'hzl project delete' command`

---

### Task 10: Create `hzl project list` Command

**Files:**
- Create: `packages/hzl-cli/src/commands/project/list.ts`
- Create: `packages/hzl-cli/src/commands/project/list.test.ts`

Shows projects with task counts (active and archived separately).

**Commit:** `feat: add 'hzl project list' command`

---

### Task 11: Create `hzl project rename` Command

**Files:**
- Create: `packages/hzl-cli/src/commands/project/rename.ts`
- Create: `packages/hzl-cli/src/commands/project/rename.test.ts`

Validates target project doesn't exist.

**Commit:** `feat: add 'hzl project rename' command`

---

### Task 12: Create `hzl project show` Command

**Files:**
- Create: `packages/hzl-cli/src/commands/project/show.ts`
- Create: `packages/hzl-cli/src/commands/project/show.test.ts`

Shows:
- Project name, description, created_at
- Task breakdown by status (backlog, ready, in_progress, done, archived)
- Whether protected

**Commit:** `feat: add 'hzl project show' command`

---

### Task 13: Wire Up Project Subcommand Group

**Files:**
- Create: `packages/hzl-cli/src/commands/project/index.ts`
- Modify: `packages/hzl-cli/src/index.ts`

**Commit:** `feat: wire up 'hzl project' subcommand group`

---

## Phase 3: CLI Restructure - Task Commands

### Task 14: Create Task Subcommand Group Structure

**Files:**
- Create: `packages/hzl-cli/src/commands/task/index.ts`

Set up the task command group that will contain all task subcommands.

**Commit:** `feat: create 'hzl task' subcommand group structure`

---

### Task 15: Migrate Core Task Commands

**Files:**
- Move: `add.ts` → `task/add.ts` (change `-p` to `-P` for project)
- Move: `list.ts` → `task/list.ts`
- Move: `show.ts` → `task/show.ts`
- Move: `claim.ts` → `task/claim.ts`
- Move: `complete.ts` → `task/complete.ts`

Update `task/add.ts`:
- Change positional `<project> <title>` to `<title>` with `-P, --project` flag
- Default project to "inbox"
- Keep `-p` for priority

**Commit:** `feat: migrate core task commands to 'hzl task' group`

---

### Task 16: Migrate Status Task Commands

**Files:**
- Move: `release.ts` → `task/release.ts`
- Move: `archive.ts` → `task/archive.ts`
- Move: `reopen.ts` → `task/reopen.ts`
- Move: `stuck.ts` → `task/stuck.ts`
- Move: `set-status.ts` → `task/set-status.ts`

**Commit:** `feat: migrate status task commands to 'hzl task' group`

---

### Task 17: Migrate Update/Move Task Commands

**Files:**
- Move: `update.ts` → `task/update.ts`
- Move: `move.ts` → `task/move.ts` (keep positional arg for target project, add validation)
- Move: `steal.ts` → `task/steal.ts`

Update `task/move.ts` to validate target project exists.

**Commit:** `feat: migrate update/move task commands to 'hzl task' group`

---

### Task 18: Migrate Dependency Task Commands

**Files:**
- Move: `add-dep.ts` → `task/add-dep.ts`
- Move: `remove-dep.ts` → `task/remove-dep.ts`

**Commit:** `feat: migrate dependency task commands to 'hzl task' group`

---

### Task 19: Migrate Metadata Task Commands

**Files:**
- Move: `comment.ts` → `task/comment.ts`
- Move: `checkpoint.ts` → `task/checkpoint.ts`
- Move: `history.ts` → `task/history.ts`

**Commit:** `feat: migrate metadata task commands to 'hzl task' group`

---

### Task 20: Migrate Query Task Commands

**Files:**
- Move: `search.ts` → `task/search.ts`
- Move: `next.ts` → `task/next.ts`

**Commit:** `feat: migrate query task commands to 'hzl task' group`

---

### Task 21: Wire Up Task Subcommand Group

**Files:**
- Modify: `packages/hzl-cli/src/commands/task/index.ts`
- Modify: `packages/hzl-cli/src/index.ts`

Register all task subcommands and remove old top-level task commands from index.

**Commit:** `feat: wire up 'hzl task' subcommand group`

---

## Phase 4: Remove Old Commands

### Task 22: Remove Deprecated Top-Level Commands

**Files:**
- Delete: `packages/hzl-cli/src/commands/projects.ts`
- Delete: `packages/hzl-cli/src/commands/rename-project.ts`
- Delete old versions of moved commands
- Update: `packages/hzl-cli/src/index.ts` to remove old imports

**Commit:** `chore: remove deprecated top-level commands`

---

## Phase 5: Documentation and Sample Project

### Task 23: Update sample-project.ts

**Files:**
- Modify: `packages/hzl-cli/src/commands/sample-project.ts`

Update to create project first before adding tasks.

**Commit:** `fix: update sample-project to create project explicitly`

---

### Task 24: Update README.md

**Files:**
- Modify: `README.md`

Update all CLI examples to use new noun-verb syntax and `-P` for project flag.

**Commit:** `docs: update README with noun-verb CLI syntax`

---

### Task 25: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

Update command examples.

**Commit:** `docs: update AGENTS.md with new CLI syntax`

---

## Phase 6: Integration Testing and Verification

### Task 26: Add Integration Test for Full Workflow

**Files:**
- Create: `packages/hzl-cli/src/__tests__/integration/project-workflow.test.ts`

Test full workflow:
1. `hzl init`
2. Verify inbox exists
3. `hzl project create myproject`
4. `hzl task add "title" -P myproject`
5. `hzl task add "title2"` (goes to inbox)
6. `hzl project delete myproject --move-to inbox`
7. Verify tasks moved

**Commit:** `test: add integration test for project workflow`

---

### Task 27: Run Full Test Suite and Manual Verification

**Steps:**
1. Run `npm test` - all tests should pass
2. Run `npm run build` - should compile without errors
3. Run `npm run lint` - should pass
4. Manual test the CLI end-to-end

**Commit:** `test: verify full CLI restructure works end-to-end`

---

## Summary

**Total Tasks:** 27

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 7 | Core infrastructure (events, schema, projector, services) |
| 2 | 6 | Project CLI commands |
| 3 | 8 | Task CLI restructure (broken into logical batches) |
| 4 | 1 | Remove old commands |
| 5 | 3 | Documentation and sample project |
| 6 | 2 | Integration testing and verification |

Each task follows TDD: write failing test → implement → verify → commit.
