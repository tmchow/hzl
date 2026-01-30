# HZL Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a task coordination system for AI agent swarms with SQLite-backed event sourcing, CLI interface, and web dashboard.

**Architecture:** Event-sourced design with append-only events table as source of truth, rebuildable projections for fast reads. Core library (`hzl-core`) contains all business logic, consumed by CLI and web dashboard. SQLite with WAL mode for concurrent access.

**Tech Stack:** TypeScript, Node.js, SQLite (better-sqlite3), Vitest for testing, Commander.js for CLI

---

## Phase 1: Project Setup & Core Infrastructure

### Task 1: Initialize TypeScript Monorepo

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `packages/hzl-core/package.json`
- Create: `packages/hzl-core/tsconfig.json`
- Create: `packages/hzl-cli/package.json`
- Create: `packages/hzl-cli/tsconfig.json`

**Step 1: Create root package.json**

```json
{
  "name": "hzl",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces",
    "lint": "eslint packages/*/src"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0",
    "eslint": "^8.56.0",
    "@typescript-eslint/parser": "^6.19.0",
    "@typescript-eslint/eslint-plugin": "^6.19.0"
  }
}
```

**Step 2: Create root tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist"
  }
}
```

**Step 3: Create packages/hzl-core/package.json**

```json
{
  "name": "hzl-core",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "better-sqlite3": "^9.3.0",
    "ulid": "^2.3.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8"
  }
}
```

**Step 4: Create packages/hzl-core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

**Step 5: Create packages/hzl-cli/package.json**

```json
{
  "name": "hzl",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "hzl": "dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "hzl-core": "*",
    "commander": "^12.0.0"
  }
}
```

**Step 6: Create packages/hzl-cli/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

**Step 7: Install dependencies**

Run: `npm install`

**Step 8: Commit**

```bash
git add package.json tsconfig.json packages/
git commit -m "chore: initialize TypeScript monorepo structure"
```

---

### Task 2: Database Schema & Migrations

**Files:**
- Create: `packages/hzl-core/src/db/schema.ts`
- Create: `packages/hzl-core/src/db/migrations.ts`
- Test: `packages/hzl-core/src/db/migrations.test.ts`

**Step 1: Write the failing test for migrations**

```typescript
// packages/hzl-core/src/db/migrations.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations, getCurrentVersion } from './migrations.js';

describe('migrations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('creates schema_migrations table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
    ).get();
    expect(table).toBeDefined();
  });

  it('creates events table with correct columns', () => {
    runMigrations(db);
    const columns = db.prepare("PRAGMA table_info(events)").all();
    const columnNames = columns.map((c: any) => c.name);
    expect(columnNames).toContain('event_id');
    expect(columnNames).toContain('task_id');
    expect(columnNames).toContain('type');
    expect(columnNames).toContain('data');
    expect(columnNames).toContain('timestamp');
  });

  it('creates tasks_current projection table', () => {
    runMigrations(db);
    const columns = db.prepare("PRAGMA table_info(tasks_current)").all();
    const columnNames = columns.map((c: any) => c.name);
    expect(columnNames).toContain('task_id');
    expect(columnNames).toContain('title');
    expect(columnNames).toContain('status');
    expect(columnNames).toContain('project');
  });

  it('creates task_dependencies table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_dependencies'"
    ).get();
    expect(table).toBeDefined();
  });

  it('is idempotent', () => {
    runMigrations(db);
    runMigrations(db);
    const version = getCurrentVersion(db);
    expect(version).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL with "Cannot find module './migrations.js'"

**Step 3: Create schema constants**

```typescript
// packages/hzl-core/src/db/schema.ts
export const SCHEMA_V1 = `
-- Append-only event store (source of truth)
CREATE TABLE IF NOT EXISTS events (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id         TEXT NOT NULL UNIQUE,
    task_id          TEXT NOT NULL,
    type             TEXT NOT NULL,
    data             TEXT NOT NULL CHECK (json_valid(data)),
    author           TEXT,
    agent_id         TEXT,
    session_id       TEXT,
    correlation_id   TEXT,
    causation_id     TEXT,
    timestamp        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Current-state projection for fast reads (rebuildable from events)
CREATE TABLE IF NOT EXISTS tasks_current (
    task_id       TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    project       TEXT NOT NULL,
    status        TEXT NOT NULL,
    parent_id     TEXT,
    description   TEXT,
    links         TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(links)),
    tags          TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
    priority      INTEGER NOT NULL DEFAULT 0,
    due_at        TEXT,
    metadata      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    last_event_id INTEGER NOT NULL
);

-- Dependency edges for fast availability checks (rebuildable from events)
CREATE TABLE IF NOT EXISTS task_dependencies (
    task_id        TEXT NOT NULL,
    depends_on_id  TEXT NOT NULL,
    PRIMARY KEY (task_id, depends_on_id)
);

-- Indexes for events
CREATE INDEX IF NOT EXISTS idx_events_task_id ON events(task_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events(correlation_id);

-- Indexes for tasks_current
CREATE INDEX IF NOT EXISTS idx_tasks_current_project_status ON tasks_current(project, status);
CREATE INDEX IF NOT EXISTS idx_tasks_current_priority ON tasks_current(project, priority, created_at);

-- Indexes for dependencies
CREATE INDEX IF NOT EXISTS idx_deps_depends_on ON task_dependencies(depends_on_id);
`;

export const PRAGMAS = `
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
`;
```

**Step 4: Implement migrations**

```typescript
// packages/hzl-core/src/db/migrations.ts
import type Database from 'better-sqlite3';
import { SCHEMA_V1, PRAGMAS } from './schema.js';

const MIGRATIONS: Record<number, string> = {
  1: SCHEMA_V1,
};

export function getCurrentVersion(db: Database.Database): number {
  try {
    const row = db.prepare(
      'SELECT MAX(version) as version FROM schema_migrations'
    ).get() as { version: number | null } | undefined;
    return row?.version ?? 0;
  } catch {
    return 0;
  }
}

export function runMigrations(db: Database.Database): void {
  db.exec(PRAGMAS);

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const currentVersion = getCurrentVersion(db);
  const versions = Object.keys(MIGRATIONS)
    .map(Number)
    .sort((a, b) => a - b);

  for (const version of versions) {
    if (version > currentVersion) {
      db.transaction(() => {
        db.exec(MIGRATIONS[version]);
        db.prepare(
          'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)'
        ).run(version, new Date().toISOString());
      })();
    }
  }
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/hzl-core/src/db/
git commit -m "feat(core): add database schema and migrations"
```

---

### Task 3: Database Connection Manager

**Files:**
- Create: `packages/hzl-core/src/db/connection.ts`
- Test: `packages/hzl-core/src/db/connection.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/db/connection.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { createConnection, getDefaultDbPath } from './connection.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('connection', () => {
  const testDbPath = path.join(os.tmpdir(), 'hzl-test-' + Date.now() + '.db');

  afterEach(() => {
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
      if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
    } catch {}
  });

  it('creates database file at specified path', () => {
    const db = createConnection(testDbPath);
    expect(fs.existsSync(testDbPath)).toBe(true);
    db.close();
  });

  it('runs migrations on new database', () => {
    const db = createConnection(testDbPath);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all();
    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).toContain('events');
    expect(tableNames).toContain('tasks_current');
    db.close();
  });

  it('returns default path in ~/.hzl/', () => {
    const defaultPath = getDefaultDbPath();
    expect(defaultPath).toContain('.hzl');
    expect(defaultPath).toContain('data.db');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement connection manager**

```typescript
// packages/hzl-core/src/db/connection.ts
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { runMigrations } from './migrations.js';

export function getDefaultDbPath(): string {
  const hzlDir = path.join(os.homedir(), '.hzl');
  return path.join(hzlDir, 'data.db');
}

export function createConnection(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? process.env.HZL_DB ?? getDefaultDbPath();

  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(resolvedPath);
  runMigrations(db);
  return db;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/db/connection.ts packages/hzl-core/src/db/connection.test.ts
git commit -m "feat(core): add database connection manager"
```

---

### Task 4: ULID Generation

**Files:**
- Create: `packages/hzl-core/src/utils/id.ts`
- Test: `packages/hzl-core/src/utils/id.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/utils/id.test.ts
import { describe, it, expect } from 'vitest';
import { generateId, isValidId } from './id.js';

describe('id generation', () => {
  it('generates a ULID', () => {
    const id = generateId();
    expect(id).toHaveLength(26);
    expect(id).toMatch(/^[0-9A-Z]{26}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('validates ULID format', () => {
    expect(isValidId('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
  });

  it('validates UUID format', () => {
    expect(isValidId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects invalid IDs', () => {
    expect(isValidId('')).toBe(false);
    expect(isValidId('too-short')).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement ID utilities**

```typescript
// packages/hzl-core/src/utils/id.ts
import { ulid } from 'ulid';

export function generateId(): string {
  return ulid();
}

const ULID_REGEX = /^[0-9A-Z]{26}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return ULID_REGEX.test(id) || UUID_REGEX.test(id);
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/utils/
git commit -m "feat(core): add ULID generation and validation"
```

---

## Phase 2: Event System

### Task 5: Event Types & Validation

**Files:**
- Create: `packages/hzl-core/src/events/types.ts`
- Test: `packages/hzl-core/src/events/validation.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/events/validation.test.ts
import { describe, it, expect } from 'vitest';
import { validateEventData, EventType, TaskStatus } from './types.js';

describe('event validation', () => {
  describe('task_created', () => {
    it('accepts valid data', () => {
      const data = { title: 'Test task', project: 'inbox' };
      expect(() => validateEventData(EventType.TaskCreated, data)).not.toThrow();
    });

    it('rejects missing title', () => {
      const data = { project: 'inbox' };
      expect(() => validateEventData(EventType.TaskCreated, data)).toThrow();
    });
  });

  describe('status_changed', () => {
    it('accepts valid transition', () => {
      const data = { from: TaskStatus.Ready, to: TaskStatus.InProgress };
      expect(() => validateEventData(EventType.StatusChanged, data)).not.toThrow();
    });

    it('rejects invalid status', () => {
      const data = { from: 'ready', to: 'invalid_status' };
      expect(() => validateEventData(EventType.StatusChanged, data)).toThrow();
    });
  });

  describe('comment_added', () => {
    it('accepts valid comment', () => {
      const data = { text: 'This is a comment' };
      expect(() => validateEventData(EventType.CommentAdded, data)).not.toThrow();
    });

    it('rejects empty text', () => {
      const data = { text: '' };
      expect(() => validateEventData(EventType.CommentAdded, data)).toThrow();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement event types**

```typescript
// packages/hzl-core/src/events/types.ts
export enum EventType {
  TaskCreated = 'task_created',
  StatusChanged = 'status_changed',
  TaskMoved = 'task_moved',
  DependencyAdded = 'dependency_added',
  DependencyRemoved = 'dependency_removed',
  TaskUpdated = 'task_updated',
  TaskArchived = 'task_archived',
  CommentAdded = 'comment_added',
  CheckpointRecorded = 'checkpoint_recorded',
}

export enum TaskStatus {
  Backlog = 'backlog',
  Ready = 'ready',
  InProgress = 'in_progress',
  Done = 'done',
  Archived = 'archived',
}

export interface EventEnvelope {
  event_id: string;
  task_id: string;
  type: EventType;
  data: Record<string, unknown>;
  author?: string;
  agent_id?: string;
  session_id?: string;
  correlation_id?: string;
  causation_id?: string;
  timestamp: string;
}

export interface TaskCreatedData {
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

export interface StatusChangedData {
  from: TaskStatus;
  to: TaskStatus;
  reason?: string;
}

const VALID_STATUSES = Object.values(TaskStatus);

export function validateEventData(type: EventType, data: unknown): void {
  if (!data || typeof data !== 'object') {
    throw new Error('Event data must be an object');
  }

  const d = data as Record<string, unknown>;

  switch (type) {
    case EventType.TaskCreated:
      if (!d.title || typeof d.title !== 'string') {
        throw new Error('task_created requires title string');
      }
      if (!d.project || typeof d.project !== 'string') {
        throw new Error('task_created requires project string');
      }
      break;

    case EventType.StatusChanged:
      if (!VALID_STATUSES.includes(d.from as TaskStatus)) {
        throw new Error(`Invalid from status: ${d.from}`);
      }
      if (!VALID_STATUSES.includes(d.to as TaskStatus)) {
        throw new Error(`Invalid to status: ${d.to}`);
      }
      break;

    case EventType.CommentAdded:
      if (!d.text || typeof d.text !== 'string' || d.text.trim() === '') {
        throw new Error('comment_added requires non-empty text');
      }
      break;

    case EventType.CheckpointRecorded:
      if (!d.name || typeof d.name !== 'string') {
        throw new Error('checkpoint_recorded requires name');
      }
      break;

    case EventType.DependencyAdded:
    case EventType.DependencyRemoved:
      if (!d.depends_on_id || typeof d.depends_on_id !== 'string') {
        throw new Error('dependency events require depends_on_id');
      }
      break;

    case EventType.TaskMoved:
      if (!d.from_project || !d.to_project) {
        throw new Error('task_moved requires from_project and to_project');
      }
      break;

    case EventType.TaskUpdated:
      if (!d.field || typeof d.field !== 'string') {
        throw new Error('task_updated requires field');
      }
      break;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/events/
git commit -m "feat(core): add event types and validation"
```

---

### Task 6: Event Store

**Files:**
- Create: `packages/hzl-core/src/events/store.ts`
- Test: `packages/hzl-core/src/events/store.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/events/store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { EventStore } from './store.js';
import { EventType, TaskStatus } from './types.js';
import { runMigrations } from '../db/migrations.js';

describe('EventStore', () => {
  let db: Database.Database;
  let store: EventStore;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    store = new EventStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('append', () => {
    it('inserts event and returns envelope', () => {
      const event = store.append({
        task_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        type: EventType.TaskCreated,
        data: { title: 'Test task', project: 'inbox' },
      });

      expect(event.event_id).toBeDefined();
      expect(event.task_id).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
      expect(event.type).toBe(EventType.TaskCreated);
    });

    it('rejects duplicate event_id', () => {
      const eventId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
      store.append({
        event_id: eventId,
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });

      expect(() => store.append({
        event_id: eventId,
        task_id: 'TASK2',
        type: EventType.TaskCreated,
        data: { title: 'Test 2', project: 'inbox' },
      })).toThrow();
    });
  });

  describe('getByTaskId', () => {
    it('returns events for a task in order', () => {
      const taskId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

      store.append({
        task_id: taskId,
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });

      store.append({
        task_id: taskId,
        type: EventType.StatusChanged,
        data: { from: TaskStatus.Backlog, to: TaskStatus.Ready },
      });

      const events = store.getByTaskId(taskId);
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe(EventType.TaskCreated);
      expect(events[1].type).toBe(EventType.StatusChanged);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement EventStore**

```typescript
// packages/hzl-core/src/events/store.ts
import type Database from 'better-sqlite3';
import { generateId } from '../utils/id.js';
import { EventEnvelope, EventType, validateEventData } from './types.js';

export interface AppendEventInput {
  event_id?: string;
  task_id: string;
  type: EventType;
  data: Record<string, unknown>;
  author?: string;
  agent_id?: string;
  session_id?: string;
  correlation_id?: string;
  causation_id?: string;
}

export class EventStore {
  private insertStmt: Database.Statement;
  private selectByTaskStmt: Database.Statement;

  constructor(private db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO events (event_id, task_id, type, data, author, agent_id, session_id, correlation_id, causation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.selectByTaskStmt = db.prepare(`
      SELECT * FROM events WHERE task_id = ? ORDER BY id ASC
    `);
  }

  append(input: AppendEventInput): EventEnvelope {
    validateEventData(input.type, input.data);

    const eventId = input.event_id ?? generateId();
    const timestamp = new Date().toISOString();

    this.insertStmt.run(
      eventId,
      input.task_id,
      input.type,
      JSON.stringify(input.data),
      input.author ?? null,
      input.agent_id ?? null,
      input.session_id ?? null,
      input.correlation_id ?? null,
      input.causation_id ?? null
    );

    return {
      event_id: eventId,
      task_id: input.task_id,
      type: input.type,
      data: input.data,
      author: input.author,
      agent_id: input.agent_id,
      session_id: input.session_id,
      correlation_id: input.correlation_id,
      causation_id: input.causation_id,
      timestamp,
    };
  }

  getByTaskId(taskId: string): EventEnvelope[] {
    const rows = this.selectByTaskStmt.all(taskId) as any[];
    return rows.map(row => ({
      event_id: row.event_id,
      task_id: row.task_id,
      type: row.type as EventType,
      data: JSON.parse(row.data),
      author: row.author,
      agent_id: row.agent_id,
      session_id: row.session_id,
      correlation_id: row.correlation_id,
      causation_id: row.causation_id,
      timestamp: row.timestamp,
    }));
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/events/store.ts packages/hzl-core/src/events/store.test.ts
git commit -m "feat(core): add event store"
```

---

## Summary: Remaining Tasks (7-27)

### Phase 3: Projections
- **Task 7:** Task projection (create, status change, update)
- **Task 8:** Dependency projection (add/remove deps, cycle detection)

### Phase 4: Core Services
- **Task 9:** TaskService - create task
- **Task 10:** TaskService - claim task (atomic)
- **Task 11:** TaskService - claim-next (atomic select + claim)
- **Task 12:** TaskService - complete, release, archive
- **Task 13:** TaskService - comments and checkpoints
- **Task 14:** Availability checker (deps satisfied)

### Phase 5: CLI
- **Task 15:** CLI entry point and init command
- **Task 16:** CLI add command
- **Task 17:** CLI list/show commands
- **Task 18:** CLI claim/complete commands
- **Task 19:** CLI claim-next command
- **Task 20:** CLI dependency commands
- **Task 21:** CLI comment/checkpoint commands
- **Task 22:** CLI utility commands (doctor, rebuild)

### Phase 6: Testing & QA
- **Task 23:** Concurrency stress tests
- **Task 24:** Sample project command
- **Task 25:** Property-based tests

### Phase 7: CI/CD
- **Task 26:** GitHub Actions workflow
- **Task 27:** Core library index export
