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

**Step 1: Write the failing test**

Create test file first:

```typescript
// packages/hzl-core/src/events/types.test.ts
import { describe, it, expect } from 'vitest';
import { EventType, validateEventData } from './types.js';

describe('Project event types', () => {
  it('should have ProjectCreated event type', () => {
    expect(EventType.ProjectCreated).toBe('project_created');
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

  it('should validate ProjectDeleted data', () => {
    expect(() => validateEventData(EventType.ProjectDeleted, {
      name: 'myproject',
      tasks_action: 'moved',
      moved_to: 'inbox',
    })).not.toThrow();
  });

  it('should reject ProjectCreated without name', () => {
    expect(() => validateEventData(EventType.ProjectCreated, {})).toThrow();
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
  ProjectDeleted = 'project_deleted',
}

// Add schemas after existing schemas
const ProjectCreatedSchema = z.object({
  name: nonEmptyString,
  description: z.string().optional(),
  is_protected: z.boolean().optional(),
});

const ProjectDeletedSchema = z.object({
  name: nonEmptyString,
  tasks_action: z.enum(['moved', 'archived', 'deleted']),
  moved_to: nonEmptyString.optional(),
});

// Add to EventSchemas record
export const EventSchemas: Record<EventType, z.ZodSchema<unknown>> = {
  // ... existing schemas ...
  [EventType.ProjectCreated]: ProjectCreatedSchema,
  [EventType.ProjectDeleted]: ProjectDeletedSchema,
};

// Add exported types
export type ProjectCreatedData = z.infer<typeof ProjectCreatedSchema>;
export type ProjectDeletedData = z.infer<typeof ProjectDeletedSchema>;
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-core -- src/events/types.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add ProjectCreated and ProjectDeleted event types
```

---

### Task 2: Add Projects Table to Schema

**Files:**
- Modify: `packages/hzl-core/src/db/schema.ts`
- Modify: `packages/hzl-core/src/db/migrations.ts`

**Step 1: Update schema**

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
```

**Step 2: Add migration**

Create migration in `packages/hzl-core/src/db/migrations.ts` to add projects table for existing databases.

**Step 3: Run existing tests**

Run: `npm test -w hzl-core -- src/db/`
Expected: PASS (schema changes are additive)

**Step 4: Commit**

```
feat: add projects table to schema
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
import { EventType } from '../events/types.js';
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
      task_id: '',
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
      task_id: '',
      type: EventType.ProjectCreated,
      data: { name: 'inbox', is_protected: true },
      timestamp: '2026-01-30T12:00:00.000Z',
    };

    projector.apply(event, db);

    const row = db.prepare('SELECT * FROM projects WHERE name = ?').get('inbox') as any;
    expect(row.is_protected).toBe(1);
  });

  it('should handle ProjectDeleted event', () => {
    // First create a project
    db.prepare('INSERT INTO projects (name, description, is_protected, created_at, last_event_id) VALUES (?, ?, ?, ?, ?)').run('myproject', null, 0, '2026-01-30T12:00:00.000Z', 1);

    const event: PersistedEventEnvelope = {
      rowid: 2,
      event_id: 'evt-2',
      task_id: '',
      type: EventType.ProjectDeleted,
      data: { name: 'myproject', tasks_action: 'moved', moved_to: 'inbox' },
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
      case EventType.ProjectDeleted:
        this.handleProjectDeleted(event, db);
        break;
    }
  }

  reset(db: Database.Database): void {
    db.exec('DELETE FROM projects');
  }

  private handleProjectCreated(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as any;
    db.prepare(`
      INSERT INTO projects (name, description, is_protected, created_at, last_event_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.name,
      data.description ?? null,
      data.is_protected ? 1 : 0,
      event.timestamp,
      event.rowid
    );
  }

  private handleProjectDeleted(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as any;
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
import { ProjectService, ProjectNotFoundError, ProtectedProjectError, ProjectHasTasksError } from './project-service.js';
import { EventStore } from '../events/store.js';
import { ProjectionEngine } from '../projections/engine.js';
import { ProjectsProjector } from '../projections/projects.js';
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

    it('should throw if project already exists', () => {
      projectService.createProject('myproject');
      expect(() => projectService.createProject('myproject')).toThrow();
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

  describe('deleteProject', () => {
    it('should delete empty project', () => {
      projectService.createProject('myproject');
      projectService.deleteProject('myproject', { tasks_action: 'deleted' });
      expect(projectService.getProject('myproject')).toBeNull();
    });

    it('should throw when deleting protected project', () => {
      projectService.createProject('inbox', { is_protected: true });
      expect(() => projectService.deleteProject('inbox', { tasks_action: 'deleted' }))
        .toThrow(ProtectedProjectError);
    });

    it('should throw when deleting non-existent project', () => {
      expect(() => projectService.deleteProject('nonexistent', { tasks_action: 'deleted' }))
        .toThrow(ProjectNotFoundError);
    });
  });

  describe('ensureInboxExists', () => {
    it('should create inbox if not exists', () => {
      projectService.ensureInboxExists();
      const inbox = projectService.getProject('inbox');
      expect(inbox).not.toBeNull();
      expect(inbox?.is_protected).toBe(true);
    });

    it('should not fail if inbox already exists', () => {
      projectService.ensureInboxExists();
      projectService.ensureInboxExists(); // Should not throw
      const projects = projectService.listProjects();
      expect(projects.filter(p => p.name === 'inbox')).toHaveLength(1);
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
import { EventType } from '../events/types.js';
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

export interface DeleteProjectOptions {
  tasks_action: 'moved' | 'archived' | 'deleted';
  moved_to?: string;
}

export class ProjectNotFoundError extends Error {
  constructor(name: string) {
    super(`Project not found: ${name}`);
  }
}

export class ProtectedProjectError extends Error {
  constructor(name: string) {
    super(`Cannot delete protected project: ${name}`);
  }
}

export class ProjectHasTasksError extends Error {
  constructor(name: string, taskCount: number) {
    super(`Project '${name}' has ${taskCount} tasks. Use --move-to, --archive-tasks, or --delete-tasks.`);
  }
}

export class ProjectAlreadyExistsError extends Error {
  constructor(name: string) {
    super(`Project already exists: ${name}`);
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
        task_id: '', // Project events don't have a task_id
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

  deleteProject(name: string, options: DeleteProjectOptions): void {
    withWriteTransaction(this.db, () => {
      const project = this.getProject(name);
      if (!project) {
        throw new ProjectNotFoundError(name);
      }
      if (project.is_protected) {
        throw new ProtectedProjectError(name);
      }

      const event = this.eventStore.append({
        task_id: '',
        type: EventType.ProjectDeleted,
        data: {
          name,
          tasks_action: options.tasks_action,
          moved_to: options.moved_to,
        },
      });

      this.projectionEngine.applyEvent(event);
    });
  }

  getTaskCount(projectName: string): number {
    const result = this.db.prepare(
      'SELECT COUNT(*) as count FROM tasks_current WHERE project = ? AND status != ?'
    ).get(projectName, 'archived') as { count: number };
    return result.count;
  }

  ensureInboxExists(): void {
    if (!this.projectExists('inbox')) {
      this.createProject('inbox', { is_protected: true });
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
describe('createTask with project validation', () => {
  it('should throw if project does not exist', () => {
    expect(() => taskService.createTask({
      title: 'Test task',
      project: 'nonexistent',
    })).toThrow('Project does not exist: nonexistent');
  });

  it('should create task if project exists', () => {
    // First create the project
    projectService.createProject('myproject');

    const task = taskService.createTask({
      title: 'Test task',
      project: 'myproject',
    });

    expect(task.project).toBe('myproject');
  });

  it('should default to inbox if no project specified', () => {
    projectService.ensureInboxExists();

    const task = taskService.createTask({
      title: 'Test task',
      project: 'inbox', // Explicitly using inbox
    });

    expect(task.project).toBe('inbox');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-core -- src/services/task-service.test.ts`
Expected: FAIL - task is created even if project doesn't exist

**Step 3: Update TaskService constructor and createTask**

In TaskService constructor, add ProjectService dependency. In createTask method, add validation at the start to check project exists.

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-core -- src/services/task-service.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: validate project exists when creating tasks
```

---

### Task 6: Update hzl-core Exports and Wire Up Projector

**Files:**
- Modify: `packages/hzl-core/src/index.ts`
- Modify: `packages/hzl-cli/src/db.ts` (to register projector and create services)

**Step 1: Export new modules from hzl-core**

Add to `packages/hzl-core/src/index.ts`:

```typescript
export * from './services/project-service.js';
export * from './projections/projects.js';
```

**Step 2: Update CLI db.ts to wire up ProjectService**

Update `packages/hzl-cli/src/db.ts` to:
- Register ProjectsProjector
- Create ProjectService
- Update Services type to include projectService
- Call ensureInboxExists() after initialization

**Step 3: Run all tests**

Run: `npm test`
Expected: PASS

**Step 4: Commit**

```
feat: wire up ProjectService and ProjectsProjector
```

---

### Task 7: Update Init Command to Create Inbox

**Files:**
- Modify: `packages/hzl-cli/src/commands/init.ts`
- Modify: `packages/hzl-cli/src/commands/init.test.ts`

**Step 1: Write the failing test**

Add to `packages/hzl-cli/src/commands/init.test.ts`:

```typescript
it('should create inbox project on init', async () => {
  await runInit({ dbPath: testDbPath, json: false });

  const services = initializeDb(testDbPath);
  const inbox = services.projectService.getProject('inbox');
  closeDb(services);

  expect(inbox).not.toBeNull();
  expect(inbox?.is_protected).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-cli -- src/commands/init.test.ts`
Expected: FAIL - inbox doesn't exist or projectService not available

**Step 3: Update init to ensure inbox exists**

The inbox should be created automatically when services are initialized (handled in Task 6).

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-cli -- src/commands/init.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: create inbox project on database initialization
```

---

## Phase 2: CLI Restructure - Project Commands

### Task 8: Create Project Subcommand Group

**Files:**
- Create: `packages/hzl-cli/src/commands/project/index.ts`
- Create: `packages/hzl-cli/src/commands/project/create.ts`
- Create: `packages/hzl-cli/src/commands/project/create.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-cli/src/commands/project/create.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runProjectCreate } from './create.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('project create', () => {
  let testDbPath: string;
  let services: Services;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `hzl-test-${Date.now()}.db`);
    services = initializeDb(testDbPath);
  });

  afterEach(() => {
    closeDb(services);
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  it('should create a project', () => {
    const result = runProjectCreate({
      services,
      name: 'myproject',
      json: false,
    });
    expect(result.name).toBe('myproject');
  });

  it('should create a project with description', () => {
    const result = runProjectCreate({
      services,
      name: 'myproject',
      description: 'A test project',
      json: false,
    });
    expect(result.description).toBe('A test project');
  });

  it('should fail if project already exists', () => {
    runProjectCreate({ services, name: 'myproject', json: false });
    expect(() => runProjectCreate({ services, name: 'myproject', json: false }))
      .toThrow('already exists');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-cli -- src/commands/project/create.test.ts`
Expected: FAIL - Cannot find module

**Step 3: Implement project create command**

Create `packages/hzl-cli/src/commands/project/create.ts` with Commander.js command that calls ProjectService.createProject().

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-cli -- src/commands/project/create.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add 'hzl project create' command
```

---

### Task 9: Add Project Delete Command

**Files:**
- Create: `packages/hzl-cli/src/commands/project/delete.ts`
- Create: `packages/hzl-cli/src/commands/project/delete.test.ts`

Implement `hzl project delete <name>` with flags:
- `--move-to <project>` - Move tasks to another project
- `--archive-tasks` - Archive all tasks first
- `--delete-tasks` - Delete all tasks (dangerous)

**Step 5: Commit**

```
feat: add 'hzl project delete' command
```

---

### Task 10: Add Project List Command

**Files:**
- Create: `packages/hzl-cli/src/commands/project/list.ts`
- Create: `packages/hzl-cli/src/commands/project/list.test.ts`

Replaces `hzl projects`. Shows projects with task counts.

**Step 5: Commit**

```
feat: add 'hzl project list' command
```

---

### Task 11: Add Project Rename and Show Commands

**Files:**
- Create: `packages/hzl-cli/src/commands/project/rename.ts`
- Create: `packages/hzl-cli/src/commands/project/show.ts`

Migrate logic from `rename-project.ts`.

**Step 5: Commit**

```
feat: add 'hzl project rename' and 'hzl project show' commands
```

---

### Task 12: Wire Up Project Subcommand Group

**Files:**
- Create: `packages/hzl-cli/src/commands/project/index.ts`
- Modify: `packages/hzl-cli/src/index.ts`

**Step 1: Create project command group**

```typescript
// packages/hzl-cli/src/commands/project/index.ts
import { Command } from 'commander';
import { createProjectCreateCommand } from './create.js';
import { createProjectDeleteCommand } from './delete.js';
import { createProjectListCommand } from './list.js';
import { createProjectRenameCommand } from './rename.js';
import { createProjectShowCommand } from './show.js';

export function createProjectCommand(): Command {
  const project = new Command('project')
    .description('Project management commands');

  project.addCommand(createProjectCreateCommand());
  project.addCommand(createProjectDeleteCommand());
  project.addCommand(createProjectListCommand());
  project.addCommand(createProjectRenameCommand());
  project.addCommand(createProjectShowCommand());

  return project;
}
```

**Step 2: Update main index.ts**

Replace individual project commands with the group in `packages/hzl-cli/src/index.ts`.

**Step 5: Commit**

```
feat: wire up 'hzl project' subcommand group
```

---

## Phase 3: CLI Restructure - Task Commands

### Task 13: Restructure Task Commands Under `hzl task`

**Files:**
- Create: `packages/hzl-cli/src/commands/task/index.ts`
- Move/refactor existing commands into `task/` directory

Commands to migrate:
- `add.ts` → `task/add.ts` (update to use `--project` flag instead of positional arg)
- `list.ts` → `task/list.ts`
- `show.ts` → `task/show.ts`
- `claim.ts` → `task/claim.ts`
- `next.ts` → `task/next.ts`
- `complete.ts` → `task/complete.ts`
- `release.ts` → `task/release.ts`
- `archive.ts` → `task/archive.ts`
- `reopen.ts` → `task/reopen.ts`
- `update.ts` → `task/update.ts`
- `move.ts` → `task/move.ts`
- `comment.ts` → `task/comment.ts`
- `checkpoint.ts` → `task/checkpoint.ts`
- `history.ts` → `task/history.ts`
- `search.ts` → `task/search.ts`
- `stuck.ts` → `task/stuck.ts`
- `steal.ts` → `task/steal.ts`
- `set-status.ts` → `task/set-status.ts`
- `add-dep.ts` → `task/add-dep.ts`
- `remove-dep.ts` → `task/remove-dep.ts`

**Commit after each batch of 3-4 commands.**

---

### Task 14: Update `task add` to Use `--project` Flag

**Files:**
- Modify: `packages/hzl-cli/src/commands/task/add.ts`

**Step 1: Update the command signature**

Change from:
```typescript
.argument('<project>', 'Project name')
.argument('<title>', 'Task title')
```

To:
```typescript
.argument('<title>', 'Task title')
.option('-p, --project <project>', 'Project name (default: inbox)', 'inbox')
```

**Step 2: Update tests**

**Step 3: Commit**

```
feat: change 'hzl task add' to use --project flag, default to inbox
```

---

## Phase 4: Remove Old Commands

### Task 15: Remove Deprecated Top-Level Commands

**Files:**
- Delete: `packages/hzl-cli/src/commands/projects.ts`
- Delete: `packages/hzl-cli/src/commands/rename-project.ts`
- Delete: `packages/hzl-cli/src/commands/add.ts` (old version)
- etc.

Remove old command files and their imports from index.ts.

**Step 5: Commit**

```
chore: remove deprecated top-level commands
```

---

## Phase 5: Documentation

### Task 16: Update README.md

**Files:**
- Modify: `README.md`

Update all CLI examples to use new noun-verb syntax:
- `hzl project create`, `hzl project list`, etc.
- `hzl task add`, `hzl task list`, etc.
- Update CLAUDE.md/AGENTS.md snippet

**Step 5: Commit**

```
docs: update README with noun-verb CLI syntax
```

---

### Task 17: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

Update command examples in build/test section.

**Step 5: Commit**

```
docs: update AGENTS.md with new CLI syntax
```

---

## Phase 6: Final Verification

### Task 18: Run Full Test Suite and Manual Verification

**Steps:**
1. Run `npm test` - all tests should pass
2. Run `npm run build` - should compile without errors
3. Run `npm run lint` - should pass
4. Manual test the CLI end-to-end

**Step 5: Commit**

```
test: verify full CLI restructure works end-to-end
```

---

## Summary

**Total Tasks:** 18

**Phase 1 (Core):** 7 tasks - Event types, schema, projector, services
**Phase 2 (Project CLI):** 5 tasks - Project subcommand group
**Phase 3 (Task CLI):** 2 tasks - Task subcommand restructure
**Phase 4 (Cleanup):** 1 task - Remove old commands
**Phase 5 (Docs):** 2 tasks - Update documentation
**Phase 6 (Verify):** 1 task - Final verification

Each task follows TDD: write failing test → implement → verify → commit.
