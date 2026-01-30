# HZL Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a task coordination system for AI agent swarms with SQLite-backed event sourcing and a CLI. Web dashboard deferred to future phase.

**Deliverables (this plan):**
- `hzl-core` — All business logic, SQLite, events, projections, invariants
- `hzl-cli` — Thin CLI wrapper over `hzl-core`

**Future Deliverables (separate plan):**
- `hzl-server` — HTTP API over `hzl-core` for the dashboard
- `hzl-web` — Dashboard UI (Kanban, analytics, steering)

**Architecture:** Event-sourced design with append-only events table as source of truth. Projections are rebuildable and updated atomically within the same transaction as event writes. Core library (`hzl-core`) contains all business logic, consumed by CLI (and later server/web). SQLite with WAL mode for concurrent access from multiple agent processes.

**Tech Stack:** TypeScript, Node.js 20+, SQLite (better-sqlite3), Zod for validation, Vitest for testing, Commander.js for CLI

---

## Phase 1: Project Setup & Core Infrastructure

### Task 1: Initialize TypeScript Monorepo (Core + CLI) ✅

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `packages/hzl-core/package.json`
- Create: `packages/hzl-core/tsconfig.json`
- Create: `packages/hzl-cli/package.json`
- Create: `packages/hzl-cli/tsconfig.json`
- Create: `.prettierrc`
- Create: `.prettierignore`

**Step 1: Create root package.json**

```json
{
  "name": "hzl-workspace",
  "private": true,
  "workspaces": ["packages/*"],
  "engines": { "node": ">=20.0.0" },
  "packageManager": "npm@10.0.0",
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "test:ci": "npm run test --workspaces --if-present -- --run",
    "typecheck": "tsc -b packages/*/tsconfig.json",
    "lint": "eslint \"packages/*/src/**/*.ts\"",
    "lint:fix": "eslint \"packages/*/src/**/*.ts\" --fix",
    "format": "prettier -w .",
    "format:check": "prettier -c ."
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0",
    "eslint": "^8.56.0",
    "@typescript-eslint/parser": "^6.19.0",
    "@typescript-eslint/eslint-plugin": "^6.19.0",
    "prettier": "^3.2.0"
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
    "ulid": "^2.3.0",
    "zod": "^3.23.0"
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
  "name": "hzl-cli",
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
    "hzl-core": "workspace:*",
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

**Step 7: Create .prettierrc**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100
}
```

**Step 8: Create .prettierignore**

```
dist/
node_modules/
*.db
*.db-wal
*.db-shm
```

**Step 9: Install dependencies**

Run: `npm install`

**Step 10: Commit**

```bash
git add package.json tsconfig.json packages/ .prettierrc .prettierignore
git commit -m "chore: initialize TypeScript monorepo with core and cli"
```

---

### Task 2: Database Schema & Migrations ✅

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

  it('creates tasks_current projection table with lease fields', () => {
    runMigrations(db);
    const columns = db.prepare("PRAGMA table_info(tasks_current)").all();
    const columnNames = columns.map((c: any) => c.name);
    expect(columnNames).toContain('task_id');
    expect(columnNames).toContain('title');
    expect(columnNames).toContain('status');
    expect(columnNames).toContain('project');
    expect(columnNames).toContain('claimed_at');
    expect(columnNames).toContain('lease_until');
  });

  it('creates task_dependencies table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_dependencies'"
    ).get();
    expect(table).toBeDefined();
  });

  it('creates projection_state table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='projection_state'"
    ).get();
    expect(table).toBeDefined();
  });

  it('creates task_tags table for fast tag filtering', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_tags'"
    ).get();
    expect(table).toBeDefined();
  });

  it('creates task_comments table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_comments'"
    ).get();
    expect(table).toBeDefined();
  });

  it('creates task_checkpoints table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_checkpoints'"
    ).get();
    expect(table).toBeDefined();
  });

  it('creates task_search FTS5 table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_search'"
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

-- Track last applied event id per projection (enables incremental projection + doctor checks)
CREATE TABLE IF NOT EXISTS projection_state (
    name          TEXT PRIMARY KEY,
    last_event_id INTEGER NOT NULL DEFAULT 0,
    updated_at    TEXT NOT NULL
);

-- Current-state projection for fast reads (rebuildable from events)
CREATE TABLE IF NOT EXISTS tasks_current (
    task_id            TEXT PRIMARY KEY,
    title              TEXT NOT NULL,
    project            TEXT NOT NULL,
    status             TEXT NOT NULL CHECK (status IN ('backlog','ready','in_progress','done','archived')),
    parent_id          TEXT,
    description        TEXT,
    links              TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(links)),
    tags               TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
    priority           INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 3),
    due_at             TEXT,
    metadata           TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
    claimed_at         TEXT,
    claimed_by_author  TEXT,
    claimed_by_agent_id TEXT,
    lease_until        TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    last_event_id      INTEGER NOT NULL
);

-- Dependency edges for fast availability checks (rebuildable from events)
CREATE TABLE IF NOT EXISTS task_dependencies (
    task_id        TEXT NOT NULL,
    depends_on_id  TEXT NOT NULL,
    PRIMARY KEY (task_id, depends_on_id)
);

-- Fast tag filtering (rebuildable)
CREATE TABLE IF NOT EXISTS task_tags (
    task_id TEXT NOT NULL,
    tag     TEXT NOT NULL,
    PRIMARY KEY (task_id, tag)
);

-- Fast access for steering comments (rebuildable)
CREATE TABLE IF NOT EXISTS task_comments (
    event_rowid INTEGER PRIMARY KEY,
    task_id     TEXT NOT NULL,
    author      TEXT,
    agent_id    TEXT,
    text        TEXT NOT NULL,
    timestamp   TEXT NOT NULL
);

-- Fast access for checkpoints (rebuildable)
CREATE TABLE IF NOT EXISTS task_checkpoints (
    event_rowid INTEGER PRIMARY KEY,
    task_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    data        TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
    timestamp   TEXT NOT NULL
);

-- Full-text search over tasks (rebuildable)
CREATE VIRTUAL TABLE IF NOT EXISTS task_search USING fts5(
    task_id UNINDEXED,
    title,
    description,
    content='tasks_current',
    content_rowid='rowid'
);

-- Indexes for events
CREATE INDEX IF NOT EXISTS idx_events_task_id ON events(task_id);
CREATE INDEX IF NOT EXISTS idx_events_task_id_id ON events(task_id, id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events(correlation_id);

-- Indexes for tasks_current
CREATE INDEX IF NOT EXISTS idx_tasks_current_project_status ON tasks_current(project, status);
CREATE INDEX IF NOT EXISTS idx_tasks_current_priority ON tasks_current(project, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_current_claim_next ON tasks_current(project, status, priority DESC, created_at ASC, task_id ASC);
CREATE INDEX IF NOT EXISTS idx_tasks_current_stuck ON tasks_current(project, status, claimed_at);
CREATE INDEX IF NOT EXISTS idx_tasks_current_parent ON tasks_current(parent_id);

-- Indexes for dependencies
CREATE INDEX IF NOT EXISTS idx_deps_depends_on ON task_dependencies(depends_on_id);

-- Indexes for tags/comments/checkpoints
CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags(tag, task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id, event_rowid);
CREATE INDEX IF NOT EXISTS idx_task_checkpoints_task ON task_checkpoints(task_id, event_rowid);
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
git commit -m "feat(core): add database schema with projections, leases, tags, comments, checkpoints, FTS5 search"
```

---

### Task 3: Database Connection Manager & Write Transaction Helper ✅

**Files:**
- Create: `packages/hzl-core/src/db/connection.ts`
- Test: `packages/hzl-core/src/db/connection.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/db/connection.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { createConnection, getDefaultDbPath, withWriteTransaction } from './connection.js';
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
    expect(tableNames).toContain('projection_state');
    db.close();
  });

  it('returns default path in ~/.hzl/', () => {
    const defaultPath = getDefaultDbPath();
    expect(defaultPath).toContain('.hzl');
    expect(defaultPath).toContain('data.db');
  });
});

describe('withWriteTransaction', () => {
  it('commits on success', () => {
    const db = createConnection(':memory:');
    withWriteTransaction(db, () => {
      db.prepare('INSERT INTO projection_state (name, last_event_id, updated_at) VALUES (?, ?, ?)').run('test', 0, new Date().toISOString());
    });
    const row = db.prepare('SELECT * FROM projection_state WHERE name = ?').get('test');
    expect(row).toBeDefined();
    db.close();
  });

  it('rolls back on error', () => {
    const db = createConnection(':memory:');
    try {
      withWriteTransaction(db, () => {
        db.prepare('INSERT INTO projection_state (name, last_event_id, updated_at) VALUES (?, ?, ?)').run('test', 0, new Date().toISOString());
        throw new Error('Intentional failure');
      });
    } catch {}
    const row = db.prepare('SELECT * FROM projection_state WHERE name = ?').get('test');
    expect(row).toBeUndefined();
    db.close();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement connection manager with write transaction helper**

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

  // Handle in-memory databases
  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(resolvedPath);
  runMigrations(db);
  return db;
}

/**
 * Execute a function within a write transaction using BEGIN IMMEDIATE.
 * This ensures proper locking for concurrent access from multiple agents.
 * Includes retry logic for SQLITE_BUSY errors.
 */
export function withWriteTransaction<T>(
  db: Database.Database,
  fn: () => T,
  opts?: { retries?: number; busySleepMs?: number }
): T {
  const retries = opts?.retries ?? 5;
  const busySleepMs = opts?.busySleepMs ?? 25;
  let attempt = 0;

  while (true) {
    try {
      // Use immediate transaction for write lock
      return db.transaction(fn).immediate();
    } catch (err: any) {
      const isBusy = err?.code === 'SQLITE_BUSY' || String(err?.message).includes('SQLITE_BUSY');
      if (!isBusy || attempt >= retries) {
        throw err;
      }
      attempt += 1;
      // Simple sleep with exponential backoff
      const sleepTime = busySleepMs * attempt;
      const start = Date.now();
      while (Date.now() - start < sleepTime) {
        // Busy wait (synchronous sleep for better-sqlite3)
      }
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/db/connection.ts packages/hzl-core/src/db/connection.test.ts
git commit -m "feat(core): add database connection manager with write transaction helper"
```

---

### Task 4: ULID Generation ✅

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

### Task 5: Event Types & Zod Validation Schemas ✅

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

    it('accepts valid data with all optional fields', () => {
      const data = {
        title: 'Test task',
        project: 'inbox',
        description: 'A description',
        links: ['docs/spec.md', 'https://example.com'],
        depends_on: ['TASK1', 'TASK2'],
        tags: ['urgent', 'backend'],
        priority: 2,
        due_at: '2026-02-01T00:00:00Z',
        metadata: { custom: 'value' },
      };
      expect(() => validateEventData(EventType.TaskCreated, data)).not.toThrow();
    });

    it('rejects missing title', () => {
      const data = { project: 'inbox' };
      expect(() => validateEventData(EventType.TaskCreated, data)).toThrow();
    });

    it('rejects invalid priority', () => {
      const data = { title: 'Test', project: 'inbox', priority: 5 };
      expect(() => validateEventData(EventType.TaskCreated, data)).toThrow();
    });

    it('rejects empty tags', () => {
      const data = { title: 'Test', project: 'inbox', tags: ['valid', ''] };
      expect(() => validateEventData(EventType.TaskCreated, data)).toThrow();
    });
  });

  describe('status_changed', () => {
    it('accepts valid transition', () => {
      const data = { from: TaskStatus.Ready, to: TaskStatus.InProgress };
      expect(() => validateEventData(EventType.StatusChanged, data)).not.toThrow();
    });

    it('accepts transition with lease_until', () => {
      const data = {
        from: TaskStatus.Ready,
        to: TaskStatus.InProgress,
        lease_until: '2026-01-30T12:00:00Z',
      };
      expect(() => validateEventData(EventType.StatusChanged, data)).not.toThrow();
    });

    it('rejects invalid status', () => {
      const data = { from: 'ready', to: 'invalid_status' };
      expect(() => validateEventData(EventType.StatusChanged, data)).toThrow();
    });

    it('rejects invalid lease_until format', () => {
      const data = {
        from: TaskStatus.Ready,
        to: TaskStatus.InProgress,
        lease_until: 'not-a-date',
      };
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

  describe('checkpoint_recorded', () => {
    it('accepts valid checkpoint', () => {
      const data = { name: 'step1', data: { progress: 50 } };
      expect(() => validateEventData(EventType.CheckpointRecorded, data)).not.toThrow();
    });

    it('rejects missing name', () => {
      const data = { data: {} };
      expect(() => validateEventData(EventType.CheckpointRecorded, data)).toThrow();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement event types with Zod schemas**

```typescript
// packages/hzl-core/src/events/types.ts
import { z } from 'zod';

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

// ISO-8601 datetime validation
const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
  message: 'Must be an ISO-8601 datetime string',
});

// Non-empty string
const nonEmptyString = z.string().min(1);

// Event data schemas
const TaskCreatedSchema = z.object({
  title: nonEmptyString,
  project: nonEmptyString,
  parent_id: nonEmptyString.optional(),
  description: z.string().max(2000).optional(),
  links: z.array(nonEmptyString).optional(),
  depends_on: z.array(nonEmptyString).optional(),
  tags: z.array(nonEmptyString).optional(),
  priority: z.number().int().min(0).max(3).optional(),
  due_at: isoDateTime.optional(),
  metadata: z.record(z.unknown()).optional(),
});

const StatusChangedSchema = z.object({
  from: z.nativeEnum(TaskStatus),
  to: z.nativeEnum(TaskStatus),
  reason: z.string().optional(),
  lease_until: isoDateTime.optional(),
});

const TaskMovedSchema = z.object({
  from_project: nonEmptyString,
  to_project: nonEmptyString,
});

const DependencySchema = z.object({
  depends_on_id: nonEmptyString,
});

const TaskUpdatedSchema = z.object({
  field: nonEmptyString,
  old_value: z.unknown().optional(),
  new_value: z.unknown(),
});

const TaskArchivedSchema = z.object({
  reason: z.string().optional(),
});

const CommentAddedSchema = z.object({
  text: nonEmptyString,
});

const CheckpointRecordedSchema = z.object({
  name: nonEmptyString,
  data: z.record(z.unknown()).optional(),
});

export const EventSchemas: Record<EventType, z.ZodSchema<unknown>> = {
  [EventType.TaskCreated]: TaskCreatedSchema,
  [EventType.StatusChanged]: StatusChangedSchema,
  [EventType.TaskMoved]: TaskMovedSchema,
  [EventType.DependencyAdded]: DependencySchema,
  [EventType.DependencyRemoved]: DependencySchema,
  [EventType.TaskUpdated]: TaskUpdatedSchema,
  [EventType.TaskArchived]: TaskArchivedSchema,
  [EventType.CommentAdded]: CommentAddedSchema,
  [EventType.CheckpointRecorded]: CheckpointRecordedSchema,
};

export function validateEventData(type: EventType, data: unknown): void {
  const schema = EventSchemas[type];
  if (!schema) {
    throw new Error(`No schema for event type: ${type}`);
  }
  schema.parse(data);
}

// Inferred types for convenience
export type TaskCreatedData = z.infer<typeof TaskCreatedSchema>;
export type StatusChangedData = z.infer<typeof StatusChangedSchema>;
export type CommentAddedData = z.infer<typeof CommentAddedSchema>;
export type CheckpointRecordedData = z.infer<typeof CheckpointRecordedSchema>;
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/events/
git commit -m "feat(core): add event types with Zod validation schemas"
```

---

### Task 6: Event Store with Canonical Timestamps & Pagination ✅

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
    it('inserts event and returns envelope with DB timestamp', () => {
      const event = store.append({
        task_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        type: EventType.TaskCreated,
        data: { title: 'Test task', project: 'inbox' },
      });

      expect(event.event_id).toBeDefined();
      expect(event.task_id).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
      expect(event.type).toBe(EventType.TaskCreated);
      expect(event.timestamp).toBeDefined();
      expect(event.rowid).toBeGreaterThan(0);
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

    it('validates event data', () => {
      expect(() => store.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { project: 'inbox' }, // missing title
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

    it('supports pagination with afterId', () => {
      const taskId = 'TASK1';
      const e1 = store.append({
        task_id: taskId,
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      store.append({
        task_id: taskId,
        type: EventType.CommentAdded,
        data: { text: 'Comment 1' },
      });
      store.append({
        task_id: taskId,
        type: EventType.CommentAdded,
        data: { text: 'Comment 2' },
      });

      const events = store.getByTaskId(taskId, { afterId: e1.rowid });
      expect(events).toHaveLength(2);
      expect((events[0].data as any).text).toBe('Comment 1');
    });

    it('supports limit', () => {
      const taskId = 'TASK1';
      store.append({
        task_id: taskId,
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      for (let i = 0; i < 10; i++) {
        store.append({
          task_id: taskId,
          type: EventType.CommentAdded,
          data: { text: `Comment ${i}` },
        });
      }

      const events = store.getByTaskId(taskId, { limit: 5 });
      expect(events).toHaveLength(5);
    });
  });

  describe('appendIdempotent', () => {
    it('inserts new event', () => {
      const result = store.appendIdempotent({
        event_id: 'UNIQUE1',
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });

      expect(result).not.toBeNull();
      expect(result!.event_id).toBe('UNIQUE1');
    });

    it('returns null for duplicate event_id', () => {
      store.append({
        event_id: 'UNIQUE1',
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });

      const result = store.appendIdempotent({
        event_id: 'UNIQUE1',
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });

      expect(result).toBeNull();
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

export interface PersistedEventEnvelope extends EventEnvelope {
  rowid: number;
}

export interface GetByTaskIdOptions {
  afterId?: number;
  limit?: number;
}

export class EventStore {
  private insertReturningStmt: Database.Statement;
  private insertIgnoreStmt: Database.Statement;
  private selectByTaskStmt: Database.Statement;
  private selectByEventIdStmt: Database.Statement;

  constructor(private db: Database.Database) {
    // Use RETURNING to get canonical DB timestamp and rowid
    this.insertReturningStmt = db.prepare(`
      INSERT INTO events (event_id, task_id, type, data, author, agent_id, session_id, correlation_id, causation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id, timestamp
    `);

    this.insertIgnoreStmt = db.prepare(`
      INSERT OR IGNORE INTO events (event_id, task_id, type, data, author, agent_id, session_id, correlation_id, causation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.selectByTaskStmt = db.prepare(`
      SELECT * FROM events
      WHERE task_id = ? AND id > COALESCE(?, 0)
      ORDER BY id ASC
      LIMIT COALESCE(?, 1000)
    `);

    this.selectByEventIdStmt = db.prepare(`
      SELECT * FROM events WHERE event_id = ?
    `);
  }

  append(input: AppendEventInput): PersistedEventEnvelope {
    validateEventData(input.type, input.data);

    const eventId = input.event_id ?? generateId();
    const row = this.insertReturningStmt.get(
      eventId,
      input.task_id,
      input.type,
      JSON.stringify(input.data),
      input.author ?? null,
      input.agent_id ?? null,
      input.session_id ?? null,
      input.correlation_id ?? null,
      input.causation_id ?? null
    ) as { id: number; timestamp: string };

    return {
      rowid: row.id,
      event_id: eventId,
      task_id: input.task_id,
      type: input.type,
      data: input.data,
      author: input.author,
      agent_id: input.agent_id,
      session_id: input.session_id,
      correlation_id: input.correlation_id,
      causation_id: input.causation_id,
      timestamp: row.timestamp,
    };
  }

  appendIdempotent(input: AppendEventInput): PersistedEventEnvelope | null {
    validateEventData(input.type, input.data);

    const eventId = input.event_id ?? generateId();
    const result = this.insertIgnoreStmt.run(
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

    // If no rows changed, the event_id already existed
    if (result.changes === 0) {
      return null;
    }

    // Fetch the inserted row to get canonical timestamp
    const row = this.selectByEventIdStmt.get(eventId) as any;
    return this.rowToEnvelope(row);
  }

  getByTaskId(taskId: string, opts?: GetByTaskIdOptions): PersistedEventEnvelope[] {
    const rows = this.selectByTaskStmt.all(
      taskId,
      opts?.afterId ?? null,
      opts?.limit ?? null
    ) as any[];
    return rows.map(row => this.rowToEnvelope(row));
  }

  private rowToEnvelope(row: any): PersistedEventEnvelope {
    return {
      rowid: row.id,
      event_id: row.event_id,
      task_id: row.task_id,
      type: row.type as EventType,
      data: JSON.parse(row.data),
      author: row.author ?? undefined,
      agent_id: row.agent_id ?? undefined,
      session_id: row.session_id ?? undefined,
      correlation_id: row.correlation_id ?? undefined,
      causation_id: row.causation_id ?? undefined,
      timestamp: row.timestamp,
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/events/store.ts packages/hzl-core/src/events/store.test.ts
git commit -m "feat(core): add event store with canonical timestamps and pagination"
```

---

## Phase 3: Projections (First-Class Incremental System)

All projections apply events in the same transaction as event writes to ensure immediate consistency.

### Task 7: ProjectionEngine + Projector Interface ✅

**Files:**
- Create: `packages/hzl-core/src/projections/types.ts`
- Create: `packages/hzl-core/src/projections/engine.ts`
- Test: `packages/hzl-core/src/projections/engine.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/projections/engine.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ProjectionEngine } from './engine.js';
import { Projector } from './types.js';
import { runMigrations } from '../db/migrations.js';
import { EventStore, PersistedEventEnvelope } from '../events/store.js';
import { EventType } from '../events/types.js';

describe('ProjectionEngine', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let engine: ProjectionEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    eventStore = new EventStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('registers and applies projectors', () => {
    const applied: PersistedEventEnvelope[] = [];
    const testProjector: Projector = {
      name: 'test',
      apply: (event) => { applied.push(event); },
    };

    engine = new ProjectionEngine(db);
    engine.register(testProjector);

    const event = eventStore.append({
      task_id: 'TASK1',
      type: EventType.TaskCreated,
      data: { title: 'Test', project: 'inbox' },
    });

    engine.applyEvent(event);

    expect(applied).toHaveLength(1);
    expect(applied[0].event_id).toBe(event.event_id);
  });

  it('tracks projection state', () => {
    const testProjector: Projector = {
      name: 'test_state',
      apply: () => {},
    };

    engine = new ProjectionEngine(db);
    engine.register(testProjector);

    const event = eventStore.append({
      task_id: 'TASK1',
      type: EventType.TaskCreated,
      data: { title: 'Test', project: 'inbox' },
    });

    engine.applyEvent(event);
    engine.updateProjectionState('test_state', event.rowid);

    const state = engine.getProjectionState('test_state');
    expect(state?.last_event_id).toBe(event.rowid);
  });

  it('applies multiple projectors in registration order', () => {
    const order: string[] = [];
    const projector1: Projector = {
      name: 'first',
      apply: () => { order.push('first'); },
    };
    const projector2: Projector = {
      name: 'second',
      apply: () => { order.push('second'); },
    };

    engine = new ProjectionEngine(db);
    engine.register(projector1);
    engine.register(projector2);

    const event = eventStore.append({
      task_id: 'TASK1',
      type: EventType.TaskCreated,
      data: { title: 'Test', project: 'inbox' },
    });

    engine.applyEvent(event);

    expect(order).toEqual(['first', 'second']);
  });

  it('getEventsSince returns events after given id', () => {
    engine = new ProjectionEngine(db);

    const e1 = eventStore.append({
      task_id: 'TASK1',
      type: EventType.TaskCreated,
      data: { title: 'Test 1', project: 'inbox' },
    });
    const e2 = eventStore.append({
      task_id: 'TASK2',
      type: EventType.TaskCreated,
      data: { title: 'Test 2', project: 'inbox' },
    });

    const events = engine.getEventsSince(e1.rowid, 100);
    expect(events).toHaveLength(1);
    expect(events[0].event_id).toBe(e2.event_id);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL with "Cannot find module './engine.js'"

**Step 3: Create projection types**

```typescript
// packages/hzl-core/src/projections/types.ts
import type Database from 'better-sqlite3';
import type { PersistedEventEnvelope } from '../events/store.js';

export interface Projector {
  name: string;
  apply(event: PersistedEventEnvelope, db: Database.Database): void;
  reset?(db: Database.Database): void;
}

export interface ProjectionState {
  name: string;
  last_event_id: number;
  updated_at: string;
}
```

**Step 4: Implement ProjectionEngine**

```typescript
// packages/hzl-core/src/projections/engine.ts
import type Database from 'better-sqlite3';
import type { PersistedEventEnvelope } from '../events/store.js';
import type { Projector, ProjectionState } from './types.js';

export class ProjectionEngine {
  private projectors: Projector[] = [];
  private getStateStmt: Database.Statement;
  private upsertStateStmt: Database.Statement;
  private getEventsSinceStmt: Database.Statement;

  constructor(private db: Database.Database) {
    this.getStateStmt = db.prepare(
      'SELECT * FROM projection_state WHERE name = ?'
    );
    this.upsertStateStmt = db.prepare(`
      INSERT INTO projection_state (name, last_event_id, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        last_event_id = excluded.last_event_id,
        updated_at = excluded.updated_at
    `);
    this.getEventsSinceStmt = db.prepare(`
      SELECT * FROM events WHERE id > ? ORDER BY id ASC LIMIT ?
    `);
  }

  register(projector: Projector): void {
    this.projectors.push(projector);
  }

  applyEvent(event: PersistedEventEnvelope): void {
    for (const projector of this.projectors) {
      projector.apply(event, this.db);
    }
  }

  getProjectionState(name: string): ProjectionState | null {
    const row = this.getStateStmt.get(name) as ProjectionState | undefined;
    return row ?? null;
  }

  updateProjectionState(name: string, lastEventId: number): void {
    this.upsertStateStmt.run(name, lastEventId, new Date().toISOString());
  }

  getEventsSince(afterId: number, limit: number): PersistedEventEnvelope[] {
    const rows = this.getEventsSinceStmt.all(afterId, limit) as any[];
    return rows.map((row) => ({
      rowid: row.id,
      event_id: row.event_id,
      task_id: row.task_id,
      type: row.type,
      data: JSON.parse(row.data),
      author: row.author ?? undefined,
      agent_id: row.agent_id ?? undefined,
      session_id: row.session_id ?? undefined,
      correlation_id: row.correlation_id ?? undefined,
      causation_id: row.causation_id ?? undefined,
      timestamp: row.timestamp,
    }));
  }

  getProjectors(): Projector[] {
    return [...this.projectors];
  }
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/hzl-core/src/projections/
git commit -m "feat(core): add projection engine with projector interface"
```

---

### Task 8: TasksCurrentProjector ✅

**Files:**
- Create: `packages/hzl-core/src/projections/tasks-current.ts`
- Test: `packages/hzl-core/src/projections/tasks-current.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/projections/tasks-current.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { TasksCurrentProjector } from './tasks-current.js';
import { runMigrations } from '../db/migrations.js';
import { EventStore } from '../events/store.js';
import { EventType, TaskStatus } from '../events/types.js';

describe('TasksCurrentProjector', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let projector: TasksCurrentProjector;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    eventStore = new EventStore(db);
    projector = new TasksCurrentProjector();
  });

  afterEach(() => {
    db.close();
  });

  describe('task_created', () => {
    it('inserts new task with defaults', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test task', project: 'inbox' },
      });

      projector.apply(event, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.title).toBe('Test task');
      expect(task.project).toBe('inbox');
      expect(task.status).toBe('backlog');
      expect(task.priority).toBe(0);
      expect(JSON.parse(task.tags)).toEqual([]);
    });

    it('inserts task with all optional fields', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: {
          title: 'Full task',
          project: 'project-a',
          description: 'A description',
          tags: ['urgent', 'backend'],
          priority: 2,
          links: ['doc.md'],
          metadata: { key: 'value' },
        },
      });

      projector.apply(event, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.description).toBe('A description');
      expect(JSON.parse(task.tags)).toEqual(['urgent', 'backend']);
      expect(task.priority).toBe(2);
      expect(JSON.parse(task.links)).toEqual(['doc.md']);
      expect(JSON.parse(task.metadata)).toEqual({ key: 'value' });
    });
  });

  describe('status_changed', () => {
    it('updates status', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const statusEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.StatusChanged,
        data: { from: TaskStatus.Backlog, to: TaskStatus.Ready },
      });
      projector.apply(statusEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.status).toBe('ready');
    });

    it('sets claim fields when transitioning to in_progress', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
        author: 'agent-1',
        agent_id: 'AGENT001',
      });
      projector.apply(createEvent, db);

      const claimEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.StatusChanged,
        data: {
          from: TaskStatus.Ready,
          to: TaskStatus.InProgress,
          lease_until: '2026-01-30T12:00:00Z',
        },
        author: 'agent-1',
        agent_id: 'AGENT001',
      });
      projector.apply(claimEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.status).toBe('in_progress');
      expect(task.claimed_at).toBeDefined();
      expect(task.claimed_by_author).toBe('agent-1');
      expect(task.claimed_by_agent_id).toBe('AGENT001');
      expect(task.lease_until).toBe('2026-01-30T12:00:00Z');
    });

    it('clears claim fields when released', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const claimEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.StatusChanged,
        data: { from: TaskStatus.Ready, to: TaskStatus.InProgress },
        author: 'agent-1',
      });
      projector.apply(claimEvent, db);

      const releaseEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.StatusChanged,
        data: { from: TaskStatus.InProgress, to: TaskStatus.Ready },
      });
      projector.apply(releaseEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.status).toBe('ready');
      expect(task.claimed_at).toBeNull();
      expect(task.claimed_by_author).toBeNull();
      expect(task.lease_until).toBeNull();
    });
  });

  describe('task_moved', () => {
    it('updates project', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const moveEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskMoved,
        data: { from_project: 'inbox', to_project: 'project-a' },
      });
      projector.apply(moveEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.project).toBe('project-a');
    });
  });

  describe('task_updated', () => {
    it('updates title', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Original', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const updateEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskUpdated,
        data: { field: 'title', old_value: 'Original', new_value: 'Updated' },
      });
      projector.apply(updateEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.title).toBe('Updated');
    });

    it('updates tags as JSON', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const updateEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskUpdated,
        data: { field: 'tags', new_value: ['new-tag'] },
      });
      projector.apply(updateEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(JSON.parse(task.tags)).toEqual(['new-tag']);
    });
  });

  describe('task_archived', () => {
    it('sets status to archived', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      const archiveEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskArchived,
        data: { reason: 'No longer needed' },
      });
      projector.apply(archiveEvent, db);

      const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
      expect(task.status).toBe('archived');
    });
  });

  describe('reset', () => {
    it('clears all task data', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      projector.apply(createEvent, db);

      projector.reset!(db);

      const count = db.prepare('SELECT COUNT(*) as cnt FROM tasks_current').get() as any;
      expect(count.cnt).toBe(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement TasksCurrentProjector**

```typescript
// packages/hzl-core/src/projections/tasks-current.ts
import type Database from 'better-sqlite3';
import type { PersistedEventEnvelope } from '../events/store.js';
import type { Projector } from './types.js';
import { EventType, TaskStatus } from '../events/types.js';

const JSON_FIELDS = new Set(['tags', 'links', 'metadata']);

export class TasksCurrentProjector implements Projector {
  name = 'tasks_current';

  apply(event: PersistedEventEnvelope, db: Database.Database): void {
    switch (event.type) {
      case EventType.TaskCreated:
        this.handleTaskCreated(event, db);
        break;
      case EventType.StatusChanged:
        this.handleStatusChanged(event, db);
        break;
      case EventType.TaskMoved:
        this.handleTaskMoved(event, db);
        break;
      case EventType.TaskUpdated:
        this.handleTaskUpdated(event, db);
        break;
      case EventType.TaskArchived:
        this.handleTaskArchived(event, db);
        break;
    }
  }

  reset(db: Database.Database): void {
    db.exec('DELETE FROM tasks_current');
  }

  private handleTaskCreated(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as any;
    db.prepare(`
      INSERT INTO tasks_current (
        task_id, title, project, status, parent_id, description,
        links, tags, priority, due_at, metadata,
        created_at, updated_at, last_event_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.task_id,
      data.title,
      data.project,
      TaskStatus.Backlog,
      data.parent_id ?? null,
      data.description ?? null,
      JSON.stringify(data.links ?? []),
      JSON.stringify(data.tags ?? []),
      data.priority ?? 0,
      data.due_at ?? null,
      JSON.stringify(data.metadata ?? {}),
      event.timestamp,
      event.timestamp,
      event.rowid
    );
  }

  private handleStatusChanged(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as any;
    const toStatus = data.to as TaskStatus;

    if (toStatus === TaskStatus.InProgress) {
      db.prepare(`
        UPDATE tasks_current SET
          status = ?,
          claimed_at = ?,
          claimed_by_author = ?,
          claimed_by_agent_id = ?,
          lease_until = ?,
          updated_at = ?,
          last_event_id = ?
        WHERE task_id = ?
      `).run(
        toStatus,
        event.timestamp,
        event.author ?? null,
        event.agent_id ?? null,
        data.lease_until ?? null,
        event.timestamp,
        event.rowid,
        event.task_id
      );
    } else if (data.from === TaskStatus.InProgress) {
      db.prepare(`
        UPDATE tasks_current SET
          status = ?,
          claimed_at = NULL,
          claimed_by_author = NULL,
          claimed_by_agent_id = NULL,
          lease_until = NULL,
          updated_at = ?,
          last_event_id = ?
        WHERE task_id = ?
      `).run(toStatus, event.timestamp, event.rowid, event.task_id);
    } else {
      db.prepare(`
        UPDATE tasks_current SET
          status = ?,
          updated_at = ?,
          last_event_id = ?
        WHERE task_id = ?
      `).run(toStatus, event.timestamp, event.rowid, event.task_id);
    }
  }

  private handleTaskMoved(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as any;
    db.prepare(`
      UPDATE tasks_current SET
        project = ?,
        updated_at = ?,
        last_event_id = ?
      WHERE task_id = ?
    `).run(data.to_project, event.timestamp, event.rowid, event.task_id);
  }

  private handleTaskUpdated(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as any;
    const field = data.field;
    const newValue = JSON_FIELDS.has(field)
      ? JSON.stringify(data.new_value)
      : data.new_value;

    db.prepare(`
      UPDATE tasks_current SET
        ${field} = ?,
        updated_at = ?,
        last_event_id = ?
      WHERE task_id = ?
    `).run(newValue, event.timestamp, event.rowid, event.task_id);
  }

  private handleTaskArchived(event: PersistedEventEnvelope, db: Database.Database): void {
    db.prepare(`
      UPDATE tasks_current SET
        status = ?,
        updated_at = ?,
        last_event_id = ?
      WHERE task_id = ?
    `).run(TaskStatus.Archived, event.timestamp, event.rowid, event.task_id);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/projections/tasks-current.ts packages/hzl-core/src/projections/tasks-current.test.ts
git commit -m "feat(core): add tasks current projector with claim/lease support"
```

---

### Task 9: DependenciesProjector ✅

**Files:**
- Create: `packages/hzl-core/src/projections/dependencies.ts`
- Test: `packages/hzl-core/src/projections/dependencies.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/projections/dependencies.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { DependenciesProjector } from './dependencies.js';
import { runMigrations } from '../db/migrations.js';
import { EventStore } from '../events/store.js';
import { EventType } from '../events/types.js';

describe('DependenciesProjector', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let projector: DependenciesProjector;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    eventStore = new EventStore(db);
    projector = new DependenciesProjector();
  });

  afterEach(() => {
    db.close();
  });

  describe('task_created with depends_on', () => {
    it('inserts dependency edges', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: {
          title: 'Test',
          project: 'inbox',
          depends_on: ['DEP1', 'DEP2'],
        },
      });

      projector.apply(event, db);

      const deps = db.prepare(
        'SELECT depends_on_id FROM task_dependencies WHERE task_id = ? ORDER BY depends_on_id'
      ).all('TASK1') as any[];
      expect(deps.map(d => d.depends_on_id)).toEqual(['DEP1', 'DEP2']);
    });
  });

  describe('dependency_added', () => {
    it('adds new dependency edge', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.DependencyAdded,
        data: { depends_on_id: 'DEP1' },
      });

      projector.apply(event, db);

      const dep = db.prepare(
        'SELECT * FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?'
      ).get('TASK1', 'DEP1');
      expect(dep).toBeDefined();
    });

    it('is idempotent for duplicate adds', () => {
      const event1 = eventStore.append({
        task_id: 'TASK1',
        type: EventType.DependencyAdded,
        data: { depends_on_id: 'DEP1' },
      });
      projector.apply(event1, db);

      const event2 = eventStore.append({
        task_id: 'TASK1',
        type: EventType.DependencyAdded,
        data: { depends_on_id: 'DEP1' },
      });
      projector.apply(event2, db);

      const deps = db.prepare(
        'SELECT * FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?'
      ).all('TASK1', 'DEP1');
      expect(deps).toHaveLength(1);
    });
  });

  describe('dependency_removed', () => {
    it('removes dependency edge', () => {
      const addEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.DependencyAdded,
        data: { depends_on_id: 'DEP1' },
      });
      projector.apply(addEvent, db);

      const removeEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.DependencyRemoved,
        data: { depends_on_id: 'DEP1' },
      });
      projector.apply(removeEvent, db);

      const dep = db.prepare(
        'SELECT * FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?'
      ).get('TASK1', 'DEP1');
      expect(dep).toBeUndefined();
    });
  });

  describe('reset', () => {
    it('clears all dependencies', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.DependencyAdded,
        data: { depends_on_id: 'DEP1' },
      });
      projector.apply(event, db);

      projector.reset!(db);

      const count = db.prepare('SELECT COUNT(*) as cnt FROM task_dependencies').get() as any;
      expect(count.cnt).toBe(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement DependenciesProjector**

```typescript
// packages/hzl-core/src/projections/dependencies.ts
import type Database from 'better-sqlite3';
import type { PersistedEventEnvelope } from '../events/store.js';
import type { Projector } from './types.js';
import { EventType } from '../events/types.js';

export class DependenciesProjector implements Projector {
  name = 'dependencies';

  apply(event: PersistedEventEnvelope, db: Database.Database): void {
    switch (event.type) {
      case EventType.TaskCreated:
        this.handleTaskCreated(event, db);
        break;
      case EventType.DependencyAdded:
        this.handleDependencyAdded(event, db);
        break;
      case EventType.DependencyRemoved:
        this.handleDependencyRemoved(event, db);
        break;
    }
  }

  reset(db: Database.Database): void {
    db.exec('DELETE FROM task_dependencies');
  }

  private handleTaskCreated(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as any;
    const dependsOn = data.depends_on as string[] | undefined;
    if (!dependsOn || dependsOn.length === 0) return;

    const insertStmt = db.prepare(
      'INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)'
    );
    for (const depId of dependsOn) {
      insertStmt.run(event.task_id, depId);
    }
  }

  private handleDependencyAdded(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as any;
    db.prepare(
      'INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)'
    ).run(event.task_id, data.depends_on_id);
  }

  private handleDependencyRemoved(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as any;
    db.prepare(
      'DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?'
    ).run(event.task_id, data.depends_on_id);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/projections/dependencies.ts packages/hzl-core/src/projections/dependencies.test.ts
git commit -m "feat(core): add dependencies projector"
```

---

### Task 10: TagsProjector ✅

**Files:**
- Create: `packages/hzl-core/src/projections/tags.ts`
- Test: `packages/hzl-core/src/projections/tags.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/projections/tags.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { TagsProjector } from './tags.js';
import { runMigrations } from '../db/migrations.js';
import { EventStore } from '../events/store.js';
import { EventType } from '../events/types.js';

describe('TagsProjector', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let projector: TagsProjector;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    eventStore = new EventStore(db);
    projector = new TagsProjector();
  });

  afterEach(() => {
    db.close();
  });

  describe('task_created with tags', () => {
    it('inserts tag rows', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: {
          title: 'Test',
          project: 'inbox',
          tags: ['urgent', 'backend'],
        },
      });

      projector.apply(event, db);

      const tags = db.prepare(
        'SELECT tag FROM task_tags WHERE task_id = ? ORDER BY tag'
      ).all('TASK1') as any[];
      expect(tags.map(t => t.tag)).toEqual(['backend', 'urgent']);
    });
  });

  describe('task_updated tags field', () => {
    it('replaces all tags', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox', tags: ['old1', 'old2'] },
      });
      projector.apply(createEvent, db);

      const updateEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskUpdated,
        data: { field: 'tags', new_value: ['new1', 'new2', 'new3'] },
      });
      projector.apply(updateEvent, db);

      const tags = db.prepare(
        'SELECT tag FROM task_tags WHERE task_id = ? ORDER BY tag'
      ).all('TASK1') as any[];
      expect(tags.map(t => t.tag)).toEqual(['new1', 'new2', 'new3']);
    });
  });

  describe('reset', () => {
    it('clears all tag data', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox', tags: ['tag1'] },
      });
      projector.apply(event, db);

      projector.reset!(db);

      const count = db.prepare('SELECT COUNT(*) as cnt FROM task_tags').get() as any;
      expect(count.cnt).toBe(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement TagsProjector**

```typescript
// packages/hzl-core/src/projections/tags.ts
import type Database from 'better-sqlite3';
import type { PersistedEventEnvelope } from '../events/store.js';
import type { Projector } from './types.js';
import { EventType } from '../events/types.js';

export class TagsProjector implements Projector {
  name = 'tags';

  apply(event: PersistedEventEnvelope, db: Database.Database): void {
    switch (event.type) {
      case EventType.TaskCreated:
        this.handleTaskCreated(event, db);
        break;
      case EventType.TaskUpdated:
        this.handleTaskUpdated(event, db);
        break;
    }
  }

  reset(db: Database.Database): void {
    db.exec('DELETE FROM task_tags');
  }

  private handleTaskCreated(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as any;
    const tags = data.tags as string[] | undefined;
    if (!tags || tags.length === 0) return;

    this.insertTags(db, event.task_id, tags);
  }

  private handleTaskUpdated(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as any;
    if (data.field !== 'tags') return;

    const newTags = data.new_value as string[];
    db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(event.task_id);
    if (newTags && newTags.length > 0) {
      this.insertTags(db, event.task_id, newTags);
    }
  }

  private insertTags(db: Database.Database, taskId: string, tags: string[]): void {
    const insertStmt = db.prepare(
      'INSERT OR IGNORE INTO task_tags (task_id, tag) VALUES (?, ?)'
    );
    for (const tag of tags) {
      insertStmt.run(taskId, tag);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/projections/tags.ts packages/hzl-core/src/projections/tags.test.ts
git commit -m "feat(core): add tags projector for fast tag filtering"
```

---

### Task 30: Comment and Checkpoint Commands ✅Projector ✅

**Files:**
- Create: `packages/hzl-core/src/projections/comments-checkpoints.ts`
- Test: `packages/hzl-core/src/projections/comments-checkpoints.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/projections/comments-checkpoints.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { CommentsCheckpointsProjector } from './comments-checkpoints.js';
import { runMigrations } from '../db/migrations.js';
import { EventStore } from '../events/store.js';
import { EventType } from '../events/types.js';

describe('CommentsCheckpointsProjector', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let projector: CommentsCheckpointsProjector;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    eventStore = new EventStore(db);
    projector = new CommentsCheckpointsProjector();
  });

  afterEach(() => {
    db.close();
  });

  describe('comment_added', () => {
    it('inserts comment row', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.CommentAdded,
        data: { text: 'This is a comment' },
        author: 'user-1',
        agent_id: 'AGENT001',
      });

      projector.apply(event, db);

      const comment = db.prepare(
        'SELECT * FROM task_comments WHERE task_id = ?'
      ).get('TASK1') as any;
      expect(comment.text).toBe('This is a comment');
      expect(comment.author).toBe('user-1');
      expect(comment.agent_id).toBe('AGENT001');
    });
  });

  describe('checkpoint_recorded', () => {
    it('inserts checkpoint row', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.CheckpointRecorded,
        data: { name: 'step1', data: { progress: 50 } },
      });

      projector.apply(event, db);

      const checkpoint = db.prepare(
        'SELECT * FROM task_checkpoints WHERE task_id = ?'
      ).get('TASK1') as any;
      expect(checkpoint.name).toBe('step1');
      expect(JSON.parse(checkpoint.data)).toEqual({ progress: 50 });
    });
  });

  describe('reset', () => {
    it('clears all comments and checkpoints', () => {
      const commentEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.CommentAdded,
        data: { text: 'Comment' },
      });
      projector.apply(commentEvent, db);

      const checkpointEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.CheckpointRecorded,
        data: { name: 'cp1' },
      });
      projector.apply(checkpointEvent, db);

      projector.reset!(db);

      const commentCount = db.prepare('SELECT COUNT(*) as cnt FROM task_comments').get() as any;
      const checkpointCount = db.prepare('SELECT COUNT(*) as cnt FROM task_checkpoints').get() as any;
      expect(commentCount.cnt).toBe(0);
      expect(checkpointCount.cnt).toBe(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement CommentsCheckpointsProjector**

```typescript
// packages/hzl-core/src/projections/comments-checkpoints.ts
import type Database from 'better-sqlite3';
import type { PersistedEventEnvelope } from '../events/store.js';
import type { Projector } from './types.js';
import { EventType } from '../events/types.js';

export class CommentsCheckpointsProjector implements Projector {
  name = 'comments_checkpoints';

  apply(event: PersistedEventEnvelope, db: Database.Database): void {
    switch (event.type) {
      case EventType.CommentAdded:
        this.handleCommentAdded(event, db);
        break;
      case EventType.CheckpointRecorded:
        this.handleCheckpointRecorded(event, db);
        break;
    }
  }

  reset(db: Database.Database): void {
    db.exec('DELETE FROM task_comments');
    db.exec('DELETE FROM task_checkpoints');
  }

  private handleCommentAdded(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as any;
    db.prepare(`
      INSERT INTO task_comments (event_rowid, task_id, author, agent_id, text, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      event.rowid,
      event.task_id,
      event.author ?? null,
      event.agent_id ?? null,
      data.text,
      event.timestamp
    );
  }

  private handleCheckpointRecorded(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as any;
    db.prepare(`
      INSERT INTO task_checkpoints (event_rowid, task_id, name, data, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      event.rowid,
      event.task_id,
      data.name,
      JSON.stringify(data.data ?? {}),
      event.timestamp
    );
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/projections/comments-checkpoints.ts packages/hzl-core/src/projections/comments-checkpoints.test.ts
git commit -m "feat(core): add comments and checkpoints projector"
```

---

### Task 12: SearchProjector (FTS5) ✅

**Files:**
- Create: `packages/hzl-core/src/projections/search.ts`
- Test: `packages/hzl-core/src/projections/search.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/projections/search.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SearchProjector } from './search.js';
import { TasksCurrentProjector } from './tasks-current.js';
import { runMigrations } from '../db/migrations.js';
import { EventStore } from '../events/store.js';
import { EventType } from '../events/types.js';

describe('SearchProjector', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let tasksProjector: TasksCurrentProjector;
  let searchProjector: SearchProjector;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    eventStore = new EventStore(db);
    tasksProjector = new TasksCurrentProjector();
    searchProjector = new SearchProjector();
  });

  afterEach(() => {
    db.close();
  });

  describe('task_created', () => {
    it('indexes title and description', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: {
          title: 'Implement authentication',
          project: 'inbox',
          description: 'Add OAuth2 support',
        },
      });
      tasksProjector.apply(event, db);
      searchProjector.apply(event, db);

      const results = db.prepare(
        "SELECT task_id FROM task_search WHERE task_search MATCH 'authentication'"
      ).all() as any[];
      expect(results.map(r => r.task_id)).toContain('TASK1');
    });
  });

  describe('task_updated', () => {
    it('updates index when title changes', () => {
      const createEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Original title', project: 'inbox' },
      });
      tasksProjector.apply(createEvent, db);
      searchProjector.apply(createEvent, db);

      const updateEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskUpdated,
        data: { field: 'title', new_value: 'Updated title' },
      });
      tasksProjector.apply(updateEvent, db);
      searchProjector.apply(updateEvent, db);

      const oldResults = db.prepare(
        "SELECT task_id FROM task_search WHERE task_search MATCH 'Original'"
      ).all();
      expect(oldResults).toHaveLength(0);

      const newResults = db.prepare(
        "SELECT task_id FROM task_search WHERE task_search MATCH 'Updated'"
      ).all() as any[];
      expect(newResults.map(r => r.task_id)).toContain('TASK1');
    });
  });

  describe('reset', () => {
    it('clears search index', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.TaskCreated,
        data: { title: 'Test', project: 'inbox' },
      });
      tasksProjector.apply(event, db);
      searchProjector.apply(event, db);

      searchProjector.reset!(db);

      const count = db.prepare('SELECT COUNT(*) as cnt FROM task_search').get() as any;
      expect(count.cnt).toBe(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement SearchProjector**

```typescript
// packages/hzl-core/src/projections/search.ts
import type Database from 'better-sqlite3';
import type { PersistedEventEnvelope } from '../events/store.js';
import type { Projector } from './types.js';
import { EventType } from '../events/types.js';

const SEARCHABLE_FIELDS = new Set(['title', 'description']);

export class SearchProjector implements Projector {
  name = 'search';

  apply(event: PersistedEventEnvelope, db: Database.Database): void {
    switch (event.type) {
      case EventType.TaskCreated:
        this.handleTaskCreated(event, db);
        break;
      case EventType.TaskUpdated:
        this.handleTaskUpdated(event, db);
        break;
    }
  }

  reset(db: Database.Database): void {
    db.exec('DELETE FROM task_search');
  }

  private handleTaskCreated(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as any;
    db.prepare(`
      INSERT INTO task_search (task_id, title, description)
      VALUES (?, ?, ?)
    `).run(event.task_id, data.title, data.description ?? '');
  }

  private handleTaskUpdated(event: PersistedEventEnvelope, db: Database.Database): void {
    const data = event.data as any;
    if (!SEARCHABLE_FIELDS.has(data.field)) return;

    const task = db.prepare(
      'SELECT title, description FROM tasks_current WHERE task_id = ?'
    ).get(event.task_id) as { title: string; description: string | null } | undefined;

    if (!task) return;

    db.prepare('DELETE FROM task_search WHERE task_id = ?').run(event.task_id);
    db.prepare(`
      INSERT INTO task_search (task_id, title, description)
      VALUES (?, ?, ?)
    `).run(event.task_id, task.title, task.description ?? '');
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/projections/search.ts packages/hzl-core/src/projections/search.test.ts
git commit -m "feat(core): add FTS5 search projector"
```

---

### Task 13: Rebuild API ✅

**Files:**
- Create: `packages/hzl-core/src/projections/rebuild.ts`
- Test: `packages/hzl-core/src/projections/rebuild.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/projections/rebuild.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { rebuildAllProjections } from './rebuild.js';
import { ProjectionEngine } from './engine.js';
import { TasksCurrentProjector } from './tasks-current.js';
import { DependenciesProjector } from './dependencies.js';
import { TagsProjector } from './tags.js';
import { CommentsCheckpointsProjector } from './comments-checkpoints.js';
import { SearchProjector } from './search.js';
import { runMigrations } from '../db/migrations.js';
import { EventStore } from '../events/store.js';
import { EventType, TaskStatus } from '../events/types.js';

describe('rebuildAllProjections', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let engine: ProjectionEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    eventStore = new EventStore(db);
    engine = new ProjectionEngine(db);
    engine.register(new TasksCurrentProjector());
    engine.register(new DependenciesProjector());
    engine.register(new TagsProjector());
    engine.register(new CommentsCheckpointsProjector());
    engine.register(new SearchProjector());
  });

  afterEach(() => {
    db.close();
  });

  it('rebuilds all projections from events', () => {
    const e1 = eventStore.append({
      task_id: 'TASK1',
      type: EventType.TaskCreated,
      data: { title: 'Test', project: 'inbox', tags: ['tag1'], depends_on: ['DEP1'] },
    });
    engine.applyEvent(e1);

    const e2 = eventStore.append({
      task_id: 'TASK1',
      type: EventType.StatusChanged,
      data: { from: TaskStatus.Backlog, to: TaskStatus.Ready },
    });
    engine.applyEvent(e2);

    // Manually corrupt projections
    db.exec('DELETE FROM tasks_current');
    db.exec('DELETE FROM task_tags');
    db.exec('DELETE FROM task_dependencies');

    // Rebuild
    rebuildAllProjections(db, engine);

    // Verify restoration
    const task = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get('TASK1') as any;
    expect(task.title).toBe('Test');
    expect(task.status).toBe('ready');

    const tags = db.prepare('SELECT tag FROM task_tags WHERE task_id = ?').all('TASK1') as any[];
    expect(tags.map(t => t.tag)).toContain('tag1');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement rebuild function**

```typescript
// packages/hzl-core/src/projections/rebuild.ts
import type Database from 'better-sqlite3';
import type { ProjectionEngine } from './engine.js';

const BATCH_SIZE = 1000;

export function rebuildAllProjections(
  db: Database.Database,
  engine: ProjectionEngine
): void {
  const projectors = engine.getProjectors();

  for (const projector of projectors) {
    if (projector.reset) {
      projector.reset(db);
    }
  }

  db.exec('DELETE FROM projection_state');

  let lastId = 0;
  while (true) {
    const events = engine.getEventsSince(lastId, BATCH_SIZE);
    if (events.length === 0) break;

    for (const event of events) {
      engine.applyEvent(event);
      lastId = event.rowid;
    }
  }

  for (const projector of projectors) {
    if (lastId > 0) {
      engine.updateProjectionState(projector.name, lastId);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/projections/rebuild.ts packages/hzl-core/src/projections/rebuild.test.ts
git commit -m "feat(core): add projection rebuild API"
```

---

## Phase 4: Core Services

All writes use BEGIN IMMEDIATE + append event(s) + apply projections in one transaction.

### Task 14: TaskService - Create Task ✅

**Files:**
- Create: `packages/hzl-core/src/services/task-service.ts`
- Test: `packages/hzl-core/src/services/task-service.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/services/task-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { TaskService } from './task-service.js';
import { runMigrations } from '../db/migrations.js';
import { EventStore } from '../events/store.js';
import { EventType, TaskStatus } from '../events/types.js';
import { ProjectionEngine } from '../projections/engine.js';
import { TasksCurrentProjector } from '../projections/tasks-current.js';
import { DependenciesProjector } from '../projections/dependencies.js';
import { TagsProjector } from '../projections/tags.js';
import { CommentsCheckpointsProjector } from '../projections/comments-checkpoints.js';
import { SearchProjector } from '../projections/search.js';

describe('TaskService', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let projectionEngine: ProjectionEngine;
  let taskService: TaskService;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    eventStore = new EventStore(db);
    projectionEngine = new ProjectionEngine(db);
    projectionEngine.register(new TasksCurrentProjector());
    projectionEngine.register(new DependenciesProjector());
    projectionEngine.register(new TagsProjector());
    projectionEngine.register(new CommentsCheckpointsProjector());
    projectionEngine.register(new SearchProjector());
    taskService = new TaskService(db, eventStore, projectionEngine);
  });

  afterEach(() => {
    db.close();
  });

  describe('createTask', () => {
    it('creates a task with minimal fields', () => {
      const task = taskService.createTask({
        title: 'Test task',
        project: 'inbox',
      });

      expect(task.task_id).toBeDefined();
      expect(task.title).toBe('Test task');
      expect(task.project).toBe('inbox');
      expect(task.status).toBe(TaskStatus.Backlog);
      expect(task.priority).toBe(0);
    });

    it('creates a task with all optional fields', () => {
      const task = taskService.createTask({
        title: 'Full task',
        project: 'project-a',
        description: 'A detailed description',
        tags: ['urgent', 'backend'],
        priority: 2,
        links: ['docs/spec.md'],
        depends_on: [],
        due_at: '2026-02-01T00:00:00Z',
        metadata: { custom: 'value' },
      });

      expect(task.title).toBe('Full task');
      expect(task.description).toBe('A detailed description');
      expect(task.tags).toEqual(['urgent', 'backend']);
      expect(task.priority).toBe(2);
    });

    it('persists task to tasks_current projection', () => {
      const task = taskService.createTask({
        title: 'Persisted task',
        project: 'inbox',
      });

      const row = db.prepare(
        'SELECT * FROM tasks_current WHERE task_id = ?'
      ).get(task.task_id) as any;

      expect(row).toBeDefined();
      expect(row.title).toBe('Persisted task');
      expect(row.status).toBe('backlog');
    });

    it('persists event to event store', () => {
      const task = taskService.createTask({
        title: 'Event test',
        project: 'inbox',
      });

      const events = eventStore.getByTaskId(task.task_id);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(EventType.TaskCreated);
    });

    it('creates dependencies when depends_on provided', () => {
      const dep1 = taskService.createTask({ title: 'Dep 1', project: 'inbox' });
      const dep2 = taskService.createTask({ title: 'Dep 2', project: 'inbox' });

      const task = taskService.createTask({
        title: 'Dependent task',
        project: 'inbox',
        depends_on: [dep1.task_id, dep2.task_id],
      });

      const deps = db.prepare(
        'SELECT depends_on_id FROM task_dependencies WHERE task_id = ? ORDER BY depends_on_id'
      ).all(task.task_id) as any[];

      expect(deps).toHaveLength(2);
    });

    it('includes author and agent_id in event when provided', () => {
      const task = taskService.createTask(
        { title: 'Authored task', project: 'inbox' },
        { author: 'user-1', agent_id: 'AGENT001' }
      );

      const events = eventStore.getByTaskId(task.task_id);
      expect(events[0].author).toBe('user-1');
      expect(events[0].agent_id).toBe('AGENT001');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL with "Cannot find module './task-service.js'"

**Step 3: Implement TaskService with createTask**

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/services/
git commit -m "feat(core): add TaskService with createTask"
```

---

### Task 15: TaskService - Claim Task ✅

**Files:**
- Modify: `packages/hzl-core/src/services/task-service.ts`
- Test: `packages/hzl-core/src/services/task-service.test.ts`

**Step 1: Write the failing test**

Add to `packages/hzl-core/src/services/task-service.test.ts`:

```typescript
describe('claimTask', () => {
  it('claims a ready task with no dependencies', () => {
    const task = taskService.createTask({ title: 'Ready task', project: 'inbox' });
    taskService.setStatus(task.task_id, TaskStatus.Ready);

    const claimed = taskService.claimTask(task.task_id, { author: 'agent-1' });

    expect(claimed.status).toBe(TaskStatus.InProgress);
    expect(claimed.claimed_by_author).toBe('agent-1');
    expect(claimed.claimed_at).toBeDefined();
  });

  it('claims a ready task with all dependencies done', () => {
    const dep1 = taskService.createTask({ title: 'Dep 1', project: 'inbox' });
    const dep2 = taskService.createTask({ title: 'Dep 2', project: 'inbox' });

    // Complete dependencies
    taskService.setStatus(dep1.task_id, TaskStatus.Ready);
    taskService.claimTask(dep1.task_id);
    taskService.completeTask(dep1.task_id);

    taskService.setStatus(dep2.task_id, TaskStatus.Ready);
    taskService.claimTask(dep2.task_id);
    taskService.completeTask(dep2.task_id);

    const task = taskService.createTask({
      title: 'Dependent task',
      project: 'inbox',
      depends_on: [dep1.task_id, dep2.task_id],
    });
    taskService.setStatus(task.task_id, TaskStatus.Ready);

    const claimed = taskService.claimTask(task.task_id);
    expect(claimed.status).toBe(TaskStatus.InProgress);
  });

  it('sets lease_until when provided', () => {
    const task = taskService.createTask({ title: 'Leased task', project: 'inbox' });
    taskService.setStatus(task.task_id, TaskStatus.Ready);

    const leaseUntil = '2026-01-30T12:00:00Z';
    const claimed = taskService.claimTask(task.task_id, { lease_until: leaseUntil });

    expect(claimed.lease_until).toBe(leaseUntil);
  });

  it('throws if task is not in ready status', () => {
    const task = taskService.createTask({ title: 'Backlog task', project: 'inbox' });
    expect(() => taskService.claimTask(task.task_id)).toThrow(/not claimable/i);
  });

  it('throws if task has incomplete dependencies', () => {
    const dep = taskService.createTask({ title: 'Incomplete dep', project: 'inbox' });
    const task = taskService.createTask({
      title: 'Blocked task',
      project: 'inbox',
      depends_on: [dep.task_id],
    });
    taskService.setStatus(task.task_id, TaskStatus.Ready);

    expect(() => taskService.claimTask(task.task_id)).toThrow(/dependencies not done/i);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement claimTask**

Add to `packages/hzl-core/src/services/task-service.ts`:

```typescript
export interface ClaimTaskOptions extends EventContext {
  lease_until?: string;
}

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`);
  }
}

export class TaskNotClaimableError extends Error {
  constructor(taskId: string, reason: string) {
    super(`Task ${taskId} is not claimable: ${reason}`);
  }
}

export class DependenciesNotDoneError extends Error {
  constructor(taskId: string, pendingDeps: string[]) {
    super(`Task ${taskId} has dependencies not done: ${pendingDeps.join(', ')}`);
  }
}

// Add to TaskService class:

private getIncompleteDepsStmt: Database.Statement;

// In constructor, add:
this.getIncompleteDepsStmt = db.prepare(`
  SELECT td.depends_on_id
  FROM task_dependencies td
  LEFT JOIN tasks_current tc ON tc.task_id = td.depends_on_id
  WHERE td.task_id = ?
    AND (tc.status IS NULL OR tc.status != 'done')
`);

claimTask(taskId: string, opts?: ClaimTaskOptions): Task {
  return withWriteTransaction(this.db, () => {
    const task = this.getTaskById(taskId);
    if (!task) throw new TaskNotFoundError(taskId);

    if (task.status !== TaskStatus.Ready) {
      throw new TaskNotClaimableError(taskId, `status is ${task.status}, must be ready`);
    }

    const incompleteDeps = this.getIncompleteDepsStmt.all(taskId) as { depends_on_id: string }[];
    if (incompleteDeps.length > 0) {
      throw new DependenciesNotDoneError(taskId, incompleteDeps.map(d => d.depends_on_id));
    }

    const eventData: any = {
      from: TaskStatus.Ready,
      to: TaskStatus.InProgress,
    };
    if (opts?.lease_until) eventData.lease_until = opts.lease_until;

    const event = this.eventStore.append({
      task_id: taskId,
      type: EventType.StatusChanged,
      data: eventData,
      author: opts?.author,
      agent_id: opts?.agent_id,
    });

    this.projectionEngine.applyEvent(event);
    return this.getTaskById(taskId)!;
  });
}

setStatus(taskId: string, toStatus: TaskStatus, ctx?: EventContext): Task {
  return withWriteTransaction(this.db, () => {
    const task = this.getTaskById(taskId);
    if (!task) throw new TaskNotFoundError(taskId);

    const event = this.eventStore.append({
      task_id: taskId,
      type: EventType.StatusChanged,
      data: { from: task.status, to: toStatus },
      author: ctx?.author,
      agent_id: ctx?.agent_id,
    });

    this.projectionEngine.applyEvent(event);
    return this.getTaskById(taskId)!;
  });
}

completeTask(taskId: string, ctx?: EventContext): Task {
  return withWriteTransaction(this.db, () => {
    const task = this.getTaskById(taskId);
    if (!task) throw new TaskNotFoundError(taskId);
    if (task.status !== TaskStatus.InProgress) {
      throw new Error(`Cannot complete: status is ${task.status}, must be in_progress`);
    }

    const event = this.eventStore.append({
      task_id: taskId,
      type: EventType.StatusChanged,
      data: { from: TaskStatus.InProgress, to: TaskStatus.Done },
      author: ctx?.author,
      agent_id: ctx?.agent_id,
    });

    this.projectionEngine.applyEvent(event);
    return this.getTaskById(taskId)!;
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/services/task-service.ts packages/hzl-core/src/services/task-service.test.ts
git commit -m "feat(core): add TaskService claimTask with dependency validation"
```

---

### Task 16: TaskService - Claim Next ✅

**Files:**
- Modify: `packages/hzl-core/src/services/task-service.ts`
- Test: `packages/hzl-core/src/services/task-service.test.ts`

**Step 1: Write the failing test**

```typescript
describe('claimNext', () => {
  it('claims highest priority ready task with all deps done', () => {
    taskService.createTask({ title: 'Low priority', project: 'inbox', priority: 0 });
    const highPriorityTask = taskService.createTask({ title: 'High priority', project: 'inbox', priority: 2 });
    taskService.createTask({ title: 'Medium priority', project: 'inbox', priority: 1 });

    // Move all to ready
    const tasks = db.prepare('SELECT task_id FROM tasks_current').all() as any[];
    for (const t of tasks) {
      taskService.setStatus(t.task_id, TaskStatus.Ready);
    }

    const claimed = taskService.claimNext({ author: 'agent-1' });

    expect(claimed).not.toBeNull();
    expect(claimed!.task_id).toBe(highPriorityTask.task_id);
    expect(claimed!.status).toBe(TaskStatus.InProgress);
  });

  it('returns null when no tasks are claimable', () => {
    taskService.createTask({ title: 'Backlog task', project: 'inbox' });
    const claimed = taskService.claimNext({ author: 'agent-1' });
    expect(claimed).toBeNull();
  });

  it('filters by project when provided', () => {
    const projectATask = taskService.createTask({ title: 'Project A', project: 'project-a' });
    taskService.createTask({ title: 'Project B', project: 'project-b', priority: 2 });

    taskService.setStatus(projectATask.task_id, TaskStatus.Ready);
    db.prepare("UPDATE tasks_current SET status = 'ready' WHERE project = 'project-b'").run();

    const claimed = taskService.claimNext({ author: 'agent-1', project: 'project-a' });

    expect(claimed).not.toBeNull();
    expect(claimed!.project).toBe('project-a');
  });

  it('filters by tags when provided', () => {
    const urgentTask = taskService.createTask({
      title: 'Urgent task',
      project: 'inbox',
      priority: 1,
      tags: ['urgent', 'backend'],
    });
    taskService.createTask({ title: 'Normal task', project: 'inbox', priority: 2, tags: ['frontend'] });

    taskService.setStatus(urgentTask.task_id, TaskStatus.Ready);
    db.prepare("UPDATE tasks_current SET status = 'ready'").run();

    const claimed = taskService.claimNext({ author: 'agent-1', tags: ['urgent'] });

    expect(claimed).not.toBeNull();
    expect(claimed!.task_id).toBe(urgentTask.task_id);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement claimNext**

```typescript
export interface ClaimNextOptions {
  author?: string;
  agent_id?: string;
  project?: string;
  tags?: string[];
  lease_until?: string;
}

// Add to TaskService class:

claimNext(opts: ClaimNextOptions = {}): Task | null {
  return withWriteTransaction(this.db, () => {
    let candidate: any;

    if (opts.tags && opts.tags.length > 0) {
      const tagPlaceholders = opts.tags.map(() => '?').join(', ');
      const tagCount = opts.tags.length;

      let query = `
        SELECT tc.task_id FROM tasks_current tc
        WHERE tc.status = 'ready'
          AND NOT EXISTS (
            SELECT 1 FROM task_dependencies td
            JOIN tasks_current dep ON td.depends_on_id = dep.task_id
            WHERE td.task_id = tc.task_id AND dep.status != 'done'
          )
          AND (SELECT COUNT(DISTINCT tag) FROM task_tags WHERE task_id = tc.task_id AND tag IN (${tagPlaceholders})) = ?
      `;
      const params: any[] = [...opts.tags, tagCount];

      if (opts.project) {
        query += ' AND tc.project = ?';
        params.push(opts.project);
      }
      query += ' ORDER BY tc.priority DESC, tc.created_at ASC, tc.task_id ASC LIMIT 1';
      candidate = this.db.prepare(query).get(...params);
    } else if (opts.project) {
      candidate = this.db.prepare(`
        SELECT tc.task_id FROM tasks_current tc
        WHERE tc.status = 'ready' AND tc.project = ?
          AND NOT EXISTS (
            SELECT 1 FROM task_dependencies td
            JOIN tasks_current dep ON td.depends_on_id = dep.task_id
            WHERE td.task_id = tc.task_id AND dep.status != 'done'
          )
        ORDER BY tc.priority DESC, tc.created_at ASC, tc.task_id ASC LIMIT 1
      `).get(opts.project);
    } else {
      candidate = this.db.prepare(`
        SELECT tc.task_id FROM tasks_current tc
        WHERE tc.status = 'ready'
          AND NOT EXISTS (
            SELECT 1 FROM task_dependencies td
            JOIN tasks_current dep ON td.depends_on_id = dep.task_id
            WHERE td.task_id = tc.task_id AND dep.status != 'done'
          )
        ORDER BY tc.priority DESC, tc.created_at ASC, tc.task_id ASC LIMIT 1
      `).get();
    }

    if (!candidate) return null;

    const event = this.eventStore.append({
      task_id: candidate.task_id,
      type: EventType.StatusChanged,
      data: { from: TaskStatus.Ready, to: TaskStatus.InProgress, lease_until: opts.lease_until },
      author: opts.author,
      agent_id: opts.agent_id,
    });

    this.projectionEngine.applyEvent(event);
    return this.getTaskById(candidate.task_id);
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/services/task-service.ts packages/hzl-core/src/services/task-service.test.ts
git commit -m "feat(core): add TaskService claimNext with priority-based selection"
```

---

### Task 17: TaskService - Status Transitions (complete, release, archive, reopen) ✅

**Files:**
- Modify: `packages/hzl-core/src/services/task-service.ts`
- Test: `packages/hzl-core/src/services/task-service.test.ts`

**Step 1: Write the failing test**

```typescript
describe('release', () => {
  it('transitions from in_progress to ready', () => {
    const task = taskService.createTask({ title: 'Test', project: 'inbox' });
    taskService.setStatus(task.task_id, TaskStatus.Ready);
    taskService.claimTask(task.task_id, { author: 'agent-1' });

    const released = taskService.releaseTask(task.task_id);

    expect(released.status).toBe(TaskStatus.Ready);
    expect(released.claimed_at).toBeNull();
  });

  it('accepts optional reason', () => {
    const task = taskService.createTask({ title: 'Test', project: 'inbox' });
    taskService.setStatus(task.task_id, TaskStatus.Ready);
    taskService.claimTask(task.task_id);

    taskService.releaseTask(task.task_id, { reason: 'Blocked on external dependency' });

    const events = eventStore.getByTaskId(task.task_id);
    const releaseEvent = events.find(e => (e.data as any).to === TaskStatus.Ready && (e.data as any).from === TaskStatus.InProgress);
    expect((releaseEvent!.data as any).reason).toBe('Blocked on external dependency');
  });
});

describe('archive', () => {
  it('transitions from any status to archived', () => {
    const task = taskService.createTask({ title: 'Test', project: 'inbox' });
    const archived = taskService.archiveTask(task.task_id);
    expect(archived.status).toBe(TaskStatus.Archived);
  });

  it('throws if task is already archived', () => {
    const task = taskService.createTask({ title: 'Test', project: 'inbox' });
    taskService.archiveTask(task.task_id);
    expect(() => taskService.archiveTask(task.task_id)).toThrow('already archived');
  });
});

describe('reopen', () => {
  it('transitions from done to ready by default', () => {
    const task = taskService.createTask({ title: 'Test', project: 'inbox' });
    taskService.setStatus(task.task_id, TaskStatus.Ready);
    taskService.claimTask(task.task_id);
    taskService.completeTask(task.task_id);

    const reopened = taskService.reopenTask(task.task_id);
    expect(reopened.status).toBe(TaskStatus.Ready);
  });

  it('transitions from done to backlog when specified', () => {
    const task = taskService.createTask({ title: 'Test', project: 'inbox' });
    taskService.setStatus(task.task_id, TaskStatus.Ready);
    taskService.claimTask(task.task_id);
    taskService.completeTask(task.task_id);

    const reopened = taskService.reopenTask(task.task_id, { to_status: TaskStatus.Backlog });
    expect(reopened.status).toBe(TaskStatus.Backlog);
  });

  it('throws if task is not done', () => {
    const task = taskService.createTask({ title: 'Test', project: 'inbox' });
    expect(() => taskService.reopenTask(task.task_id)).toThrow('expected done');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement status transition methods**

```typescript
// Add to TaskService class:

releaseTask(taskId: string, opts?: { reason?: string } & EventContext): Task {
  return withWriteTransaction(this.db, () => {
    const task = this.getTaskById(taskId);
    if (!task) throw new TaskNotFoundError(taskId);
    if (task.status !== TaskStatus.InProgress) {
      throw new Error(`Cannot release: status is ${task.status}, expected in_progress`);
    }

    const event = this.eventStore.append({
      task_id: taskId,
      type: EventType.StatusChanged,
      data: { from: TaskStatus.InProgress, to: TaskStatus.Ready, reason: opts?.reason },
      author: opts?.author,
      agent_id: opts?.agent_id,
    });

    this.projectionEngine.applyEvent(event);
    return this.getTaskById(taskId)!;
  });
}

archiveTask(taskId: string, opts?: { reason?: string } & EventContext): Task {
  return withWriteTransaction(this.db, () => {
    const task = this.getTaskById(taskId);
    if (!task) throw new TaskNotFoundError(taskId);
    if (task.status === TaskStatus.Archived) {
      throw new Error('Task is already archived');
    }

    const event = this.eventStore.append({
      task_id: taskId,
      type: EventType.TaskArchived,
      data: { reason: opts?.reason },
      author: opts?.author,
      agent_id: opts?.agent_id,
    });

    this.projectionEngine.applyEvent(event);
    return this.getTaskById(taskId)!;
  });
}

reopenTask(taskId: string, opts?: { to_status?: TaskStatus.Ready | TaskStatus.Backlog; reason?: string } & EventContext): Task {
  return withWriteTransaction(this.db, () => {
    const task = this.getTaskById(taskId);
    if (!task) throw new TaskNotFoundError(taskId);
    if (task.status !== TaskStatus.Done) {
      throw new Error(`Cannot reopen: status is ${task.status}, expected done`);
    }

    const toStatus = opts?.to_status ?? TaskStatus.Ready;

    const event = this.eventStore.append({
      task_id: taskId,
      type: EventType.StatusChanged,
      data: { from: TaskStatus.Done, to: toStatus, reason: opts?.reason },
      author: opts?.author,
      agent_id: opts?.agent_id,
    });

    this.projectionEngine.applyEvent(event);
    return this.getTaskById(taskId)!;
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/services/task-service.ts packages/hzl-core/src/services/task-service.test.ts
git commit -m "feat(core): add TaskService status transitions (complete, release, archive, reopen)"
```

---

### Task 18: Lease Support - Steal and Stuck Detection ✅

**Files:**
- Modify: `packages/hzl-core/src/services/task-service.ts`
- Test: `packages/hzl-core/src/services/task-service.test.ts`

**Step 1: Write the failing test**

```typescript
describe('steal', () => {
  it('steals task with force=true regardless of lease', () => {
    const task = taskService.createTask({ title: 'Test', project: 'inbox' });
    taskService.setStatus(task.task_id, TaskStatus.Ready);
    taskService.claimTask(task.task_id, {
      author: 'agent-1',
      lease_until: new Date(Date.now() + 3600000).toISOString()
    });

    const result = taskService.stealTask(task.task_id, { force: true, author: 'agent-2' });

    expect(result.success).toBe(true);
    const stolen = taskService.getTaskById(task.task_id);
    expect(stolen!.claimed_by_author).toBe('agent-2');
  });

  it('steals task with ifExpired=true only when lease is expired', () => {
    const task = taskService.createTask({ title: 'Test', project: 'inbox' });
    taskService.setStatus(task.task_id, TaskStatus.Ready);
    taskService.claimTask(task.task_id, {
      author: 'agent-1',
      lease_until: new Date(Date.now() - 1000).toISOString() // expired
    });

    const result = taskService.stealTask(task.task_id, { ifExpired: true, author: 'agent-2' });
    expect(result.success).toBe(true);
  });

  it('rejects steal with ifExpired=true when lease is not expired', () => {
    const task = taskService.createTask({ title: 'Test', project: 'inbox' });
    taskService.setStatus(task.task_id, TaskStatus.Ready);
    taskService.claimTask(task.task_id, {
      author: 'agent-1',
      lease_until: new Date(Date.now() + 3600000).toISOString()
    });

    const result = taskService.stealTask(task.task_id, { ifExpired: true, author: 'agent-2' });
    expect(result.success).toBe(false);
  });
});

describe('getStuckTasks', () => {
  it('returns tasks in_progress older than specified duration', () => {
    const task = taskService.createTask({ title: 'Old task', project: 'inbox' });
    taskService.setStatus(task.task_id, TaskStatus.Ready);

    // Manually backdate the claim
    db.prepare(`
      UPDATE tasks_current SET claimed_at = ?, status = 'in_progress'
      WHERE task_id = ?
    `).run(new Date(Date.now() - 2 * 3600000).toISOString(), task.task_id);

    const stuck = taskService.getStuckTasks({ olderThan: 3600000 });

    expect(stuck).toHaveLength(1);
    expect(stuck[0].task_id).toBe(task.task_id);
  });

  it('filters by project', () => {
    const taskA = taskService.createTask({ title: 'Task A', project: 'project-a' });
    const taskB = taskService.createTask({ title: 'Task B', project: 'project-b' });

    const oldTime = new Date(Date.now() - 2 * 3600000).toISOString();
    db.prepare("UPDATE tasks_current SET claimed_at = ?, status = 'in_progress'").run(oldTime);

    const stuck = taskService.getStuckTasks({ project: 'project-a', olderThan: 3600000 });

    expect(stuck).toHaveLength(1);
    expect(stuck[0].project).toBe('project-a');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement steal and getStuckTasks**

```typescript
export interface StealOptions {
  ifExpired?: boolean;
  force?: boolean;
  author?: string;
  agent_id?: string;
  lease_until?: string;
}

export interface StealResult {
  success: boolean;
  error?: string;
}

export interface StuckTask {
  task_id: string;
  title: string;
  project: string;
  claimed_at: string;
  claimed_by_author: string | null;
  claimed_by_agent_id: string | null;
  lease_until: string | null;
}

// Add to TaskService class:

stealTask(taskId: string, opts: StealOptions): StealResult {
  return withWriteTransaction(this.db, () => {
    const task = this.getTaskById(taskId);
    if (!task) return { success: false, error: `Task ${taskId} not found` };
    if (task.status !== TaskStatus.InProgress) {
      return { success: false, error: `Task ${taskId} is not in_progress` };
    }

    if (!opts.force) {
      if (opts.ifExpired) {
        const now = new Date().toISOString();
        if (task.lease_until && task.lease_until >= now) {
          return { success: false, error: `Task ${taskId} lease has not expired` };
        }
      } else {
        return { success: false, error: 'Must specify either force=true or ifExpired=true' };
      }
    }

    const event = this.eventStore.append({
      task_id: taskId,
      type: EventType.StatusChanged,
      data: { from: TaskStatus.InProgress, to: TaskStatus.InProgress, reason: 'stolen', lease_until: opts.lease_until },
      author: opts.author,
      agent_id: opts.agent_id,
    });

    this.projectionEngine.applyEvent(event);

    // Update claim info
    this.db.prepare(`
      UPDATE tasks_current SET
        claimed_at = ?, claimed_by_author = ?, claimed_by_agent_id = ?, lease_until = ?, updated_at = ?, last_event_id = ?
      WHERE task_id = ?
    `).run(new Date().toISOString(), opts.author ?? null, opts.agent_id ?? null, opts.lease_until ?? null, new Date().toISOString(), event.rowid, taskId);

    return { success: true };
  });
}

getStuckTasks(opts: { project?: string; olderThan: number }): StuckTask[] {
  const cutoffTime = new Date(Date.now() - opts.olderThan).toISOString();

  let query = `
    SELECT task_id, title, project, claimed_at, claimed_by_author, claimed_by_agent_id, lease_until
    FROM tasks_current WHERE status = 'in_progress' AND claimed_at < ?
  `;
  const params: any[] = [cutoffTime];

  if (opts.project) {
    query += ' AND project = ?';
    params.push(opts.project);
  }
  query += ' ORDER BY claimed_at ASC';

  return this.db.prepare(query).all(...params) as StuckTask[];
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/services/task-service.ts packages/hzl-core/src/services/task-service.test.ts
git commit -m "feat(core): add lease support with steal and stuck detection"
```

---

### Task 19: Availability Checker + Tag-aware Next Query ✅

**Files:**
- Modify: `packages/hzl-core/src/services/task-service.ts`
- Test: `packages/hzl-core/src/services/task-service.test.ts`

**Step 1: Write the failing test**

```typescript
describe('areAllDepsDone', () => {
  it('returns true when task has no dependencies', () => {
    const task = taskService.createTask({ title: 'No deps', project: 'inbox' });
    expect(taskService.areAllDepsDone(task.task_id)).toBe(true);
  });

  it('returns true when all dependencies are done', () => {
    const dep = taskService.createTask({ title: 'Dep', project: 'inbox' });
    taskService.setStatus(dep.task_id, TaskStatus.Ready);
    taskService.claimTask(dep.task_id);
    taskService.completeTask(dep.task_id);

    const task = taskService.createTask({ title: 'Main', project: 'inbox', depends_on: [dep.task_id] });
    expect(taskService.areAllDepsDone(task.task_id)).toBe(true);
  });

  it('returns false when some dependencies are not done', () => {
    const dep = taskService.createTask({ title: 'Dep', project: 'inbox' });
    const task = taskService.createTask({ title: 'Main', project: 'inbox', depends_on: [dep.task_id] });
    expect(taskService.areAllDepsDone(task.task_id)).toBe(false);
  });
});

describe('isTaskAvailable', () => {
  it('returns true when task is ready and all deps are done', () => {
    const task = taskService.createTask({ title: 'Test', project: 'inbox' });
    taskService.setStatus(task.task_id, TaskStatus.Ready);
    expect(taskService.isTaskAvailable(task.task_id)).toBe(true);
  });

  it('returns false when task is not ready', () => {
    const task = taskService.createTask({ title: 'Test', project: 'inbox' });
    expect(taskService.isTaskAvailable(task.task_id)).toBe(false);
  });
});

describe('getAvailableTasks', () => {
  it('returns tasks that are ready with all deps done', () => {
    const task = taskService.createTask({ title: 'Available', project: 'inbox' });
    taskService.setStatus(task.task_id, TaskStatus.Ready);

    const tasks = taskService.getAvailableTasks({});
    expect(tasks.map(t => t.task_id)).toContain(task.task_id);
  });

  it('filters by project', () => {
    const taskA = taskService.createTask({ title: 'A', project: 'project-a' });
    const taskB = taskService.createTask({ title: 'B', project: 'project-b' });
    taskService.setStatus(taskA.task_id, TaskStatus.Ready);
    taskService.setStatus(taskB.task_id, TaskStatus.Ready);

    const tasks = taskService.getAvailableTasks({ project: 'project-a' });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].project).toBe('project-a');
  });

  it('sorts by priority DESC, created_at ASC', () => {
    const low = taskService.createTask({ title: 'Low', project: 'inbox', priority: 1 });
    const high = taskService.createTask({ title: 'High', project: 'inbox', priority: 3 });
    taskService.setStatus(low.task_id, TaskStatus.Ready);
    taskService.setStatus(high.task_id, TaskStatus.Ready);

    const tasks = taskService.getAvailableTasks({});
    expect(tasks[0].task_id).toBe(high.task_id);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement availability checker**

```typescript
export interface AvailableTask {
  task_id: string;
  title: string;
  project: string;
  status: TaskStatus;
  priority: number;
  created_at: string;
  tags: string[];
}

// Add to TaskService class:

areAllDepsDone(taskId: string): boolean {
  const result = this.db.prepare(`
    SELECT COUNT(*) as count FROM task_dependencies td
    JOIN tasks_current tc ON td.depends_on_id = tc.task_id
    WHERE td.task_id = ? AND tc.status != 'done'
  `).get(taskId) as { count: number };
  return result.count === 0;
}

isTaskAvailable(taskId: string): boolean {
  const task = this.getTaskById(taskId);
  if (!task) return false;
  if (task.status !== TaskStatus.Ready) return false;
  return this.areAllDepsDone(taskId);
}

getAvailableTasks(opts: { project?: string; tagsAny?: string[]; tagsAll?: string[]; limit?: number }): AvailableTask[] {
  let query = `
    SELECT tc.task_id, tc.title, tc.project, tc.status, tc.priority, tc.created_at, tc.tags
    FROM tasks_current tc
    WHERE tc.status = 'ready'
      AND NOT EXISTS (
        SELECT 1 FROM task_dependencies td
        JOIN tasks_current dep ON td.depends_on_id = dep.task_id
        WHERE td.task_id = tc.task_id AND dep.status != 'done'
      )
  `;
  const params: any[] = [];

  if (opts.project) {
    query += ' AND tc.project = ?';
    params.push(opts.project);
  }

  if (opts.tagsAny?.length) {
    query += ` AND EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = tc.task_id AND tt.tag IN (${opts.tagsAny.map(() => '?').join(',')}))`;
    params.push(...opts.tagsAny);
  }

  if (opts.tagsAll?.length) {
    query += ` AND (SELECT COUNT(DISTINCT tt.tag) FROM task_tags tt WHERE tt.task_id = tc.task_id AND tt.tag IN (${opts.tagsAll.map(() => '?').join(',')})) = ?`;
    params.push(...opts.tagsAll, opts.tagsAll.length);
  }

  query += ' ORDER BY tc.priority DESC, tc.created_at ASC, tc.task_id ASC';

  if (opts.limit) {
    query += ' LIMIT ?';
    params.push(opts.limit);
  }

  const rows = this.db.prepare(query).all(...params) as any[];
  return rows.map(row => ({
    task_id: row.task_id,
    title: row.title,
    project: row.project,
    status: row.status as TaskStatus,
    priority: row.priority,
    created_at: row.created_at,
    tags: JSON.parse(row.tags || '[]'),
  }));
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/services/task-service.ts packages/hzl-core/src/services/task-service.test.ts
git commit -m "feat(core): add availability checker and tag-aware task queries"
```

---

### Task 20: Validate API ✅

**Files:**
- Create: `packages/hzl-core/src/services/validation-service.ts`
- Test: `packages/hzl-core/src/services/validation-service.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/services/validation-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ValidationService } from './validation-service.js';
import { runMigrations } from '../db/migrations.js';
import { EventStore } from '../events/store.js';
import { ProjectionEngine } from '../projections/engine.js';
import { TasksCurrentProjector } from '../projections/tasks-current.js';
import { DependenciesProjector } from '../projections/dependencies.js';
import { EventType, TaskStatus } from '../events/types.js';

describe('ValidationService', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let engine: ProjectionEngine;
  let validationService: ValidationService;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    eventStore = new EventStore(db);
    engine = new ProjectionEngine(db);
    engine.register(new TasksCurrentProjector());
    engine.register(new DependenciesProjector());
    validationService = new ValidationService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('detectCycles', () => {
    it('returns empty array when no cycles exist', () => {
      const e1 = eventStore.append({ task_id: 'TASK_A', type: EventType.TaskCreated, data: { title: 'A', project: 'inbox' } });
      engine.applyEvent(e1);
      const e2 = eventStore.append({ task_id: 'TASK_B', type: EventType.TaskCreated, data: { title: 'B', project: 'inbox', depends_on: ['TASK_A'] } });
      engine.applyEvent(e2);

      const cycles = validationService.detectCycles();
      expect(cycles).toHaveLength(0);
    });

    it('detects simple cycle', () => {
      const e1 = eventStore.append({ task_id: 'TASK_A', type: EventType.TaskCreated, data: { title: 'A', project: 'inbox' } });
      engine.applyEvent(e1);
      const e2 = eventStore.append({ task_id: 'TASK_B', type: EventType.TaskCreated, data: { title: 'B', project: 'inbox', depends_on: ['TASK_A'] } });
      engine.applyEvent(e2);
      db.prepare('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)').run('TASK_A', 'TASK_B');

      const cycles = validationService.detectCycles();
      expect(cycles.length).toBeGreaterThan(0);
    });
  });

  describe('findMissingDeps', () => {
    it('finds missing dependency', () => {
      const e1 = eventStore.append({ task_id: 'TASK_A', type: EventType.TaskCreated, data: { title: 'A', project: 'inbox' } });
      engine.applyEvent(e1);
      db.prepare('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)').run('TASK_A', 'NONEXISTENT');

      const missing = validationService.findMissingDeps();
      expect(missing).toHaveLength(1);
      expect(missing[0].missingDepId).toBe('NONEXISTENT');
    });
  });

  describe('validate', () => {
    it('returns valid result when no issues', () => {
      const e1 = eventStore.append({ task_id: 'TASK_A', type: EventType.TaskCreated, data: { title: 'A', project: 'inbox' } });
      engine.applyEvent(e1);

      const result = validationService.validate();
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement ValidationService**

```typescript
// packages/hzl-core/src/services/validation-service.ts
import type Database from 'better-sqlite3';
import { EventType, TaskStatus } from '../events/types.js';

export interface CycleNode { taskId: string; dependsOnId: string; }
export interface MissingDep { taskId: string; missingDepId: string; }
export interface ValidationIssue { type: string; severity: string; message: string; details?: unknown; }
export interface ValidationResult { isValid: boolean; issues: ValidationIssue[]; cycles: CycleNode[][]; missingDeps: MissingDep[]; }

export class ValidationService {
  constructor(private db: Database.Database) {}

  detectCycles(): CycleNode[][] {
    const cycles: CycleNode[][] = [];
    const tasks = this.db.prepare('SELECT task_id FROM tasks_current').all() as { task_id: string }[];
    const taskIds = new Set(tasks.map(t => t.task_id));
    const deps = this.db.prepare('SELECT task_id, depends_on_id FROM task_dependencies').all() as { task_id: string; depends_on_id: string }[];

    const graph = new Map<string, string[]>();
    for (const taskId of taskIds) graph.set(taskId, []);
    for (const dep of deps) {
      if (taskIds.has(dep.task_id)) {
        graph.get(dep.task_id)!.push(dep.depends_on_id);
      }
    }

    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const taskId of taskIds) color.set(taskId, WHITE);

    const dfs = (u: string, path: string[]): void => {
      color.set(u, GRAY);
      for (const v of graph.get(u) || []) {
        if (u === v) { cycles.push([{ taskId: u, dependsOnId: v }]); continue; }
        if (!color.has(v)) continue;
        if (color.get(v) === GRAY) {
          const cycleStartIdx = path.indexOf(v);
          if (cycleStartIdx !== -1) {
            const cyclePath: CycleNode[] = [];
            for (let i = cycleStartIdx; i < path.length; i++) {
              cyclePath.push({ taskId: path[i], dependsOnId: i + 1 < path.length ? path[i + 1] : v });
            }
            cycles.push(cyclePath);
          }
        } else if (color.get(v) === WHITE) {
          dfs(v, [...path, v]);
        }
      }
      color.set(u, BLACK);
    };

    for (const taskId of taskIds) if (color.get(taskId) === WHITE) dfs(taskId, [taskId]);
    return cycles;
  }

  findMissingDeps(): MissingDep[] {
    const rows = this.db.prepare(`
      SELECT d.task_id, d.depends_on_id FROM task_dependencies d
      LEFT JOIN tasks_current t ON d.depends_on_id = t.task_id
      WHERE t.task_id IS NULL
    `).all() as { task_id: string; depends_on_id: string }[];
    return rows.map(r => ({ taskId: r.task_id, missingDepId: r.depends_on_id }));
  }

  validate(): ValidationResult {
    const issues: ValidationIssue[] = [];
    const cycles = this.detectCycles();
    const missingDeps = this.findMissingDeps();

    for (const cycle of cycles) {
      issues.push({ type: 'cycle', severity: 'error', message: `Dependency cycle detected`, details: cycle });
    }
    for (const missing of missingDeps) {
      issues.push({ type: 'missing_dep', severity: 'error', message: `Task ${missing.taskId} depends on non-existent task ${missing.missingDepId}`, details: missing });
    }

    return { isValid: issues.length === 0, issues, cycles, missingDeps };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/services/validation-service.ts packages/hzl-core/src/services/validation-service.test.ts
git commit -m "feat(core): add validation service with cycle detection"
```

---

### Task 21: TaskService - Comments and Checkpoints APIs ✅

**Files:**
- Modify: `packages/hzl-core/src/services/task-service.ts`
- Test: `packages/hzl-core/src/services/task-service.test.ts`

**Step 1: Write the failing test**

```typescript
describe('addComment', () => {
  it('adds a comment to a task', () => {
    const task = taskService.createTask({ title: 'Test', project: 'inbox' });
    const comment = taskService.addComment(task.task_id, 'This is a comment');

    expect(comment.text).toBe('This is a comment');
    expect(comment.task_id).toBe(task.task_id);
  });

  it('throws when task does not exist', () => {
    expect(() => taskService.addComment('NONEXISTENT', 'Comment')).toThrow();
  });
});

describe('addCheckpoint', () => {
  it('adds a checkpoint to a task', () => {
    const task = taskService.createTask({ title: 'Test', project: 'inbox' });
    const checkpoint = taskService.addCheckpoint(task.task_id, 'step1', { progress: 50 });

    expect(checkpoint.name).toBe('step1');
    expect(checkpoint.data).toEqual({ progress: 50 });
  });
});

describe('getComments', () => {
  it('returns comments for a task in order', () => {
    const task = taskService.createTask({ title: 'Test', project: 'inbox' });
    taskService.addComment(task.task_id, 'First');
    taskService.addComment(task.task_id, 'Second');

    const comments = taskService.getComments(task.task_id);
    expect(comments).toHaveLength(2);
    expect(comments[0].text).toBe('First');
  });
});

describe('getCheckpoints', () => {
  it('returns checkpoints for a task in order', () => {
    const task = taskService.createTask({ title: 'Test', project: 'inbox' });
    taskService.addCheckpoint(task.task_id, 'step1', { progress: 25 });
    taskService.addCheckpoint(task.task_id, 'step2', { progress: 50 });

    const checkpoints = taskService.getCheckpoints(task.task_id);
    expect(checkpoints).toHaveLength(2);
    expect(checkpoints[0].name).toBe('step1');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Add comments and checkpoints methods**

```typescript
export interface Comment { event_rowid: number; task_id: string; author?: string; agent_id?: string; text: string; timestamp: string; }
export interface Checkpoint { event_rowid: number; task_id: string; name: string; data: Record<string, unknown>; timestamp: string; }

// Add to TaskService class:

addComment(taskId: string, text: string, opts?: EventContext): Comment {
  if (!text?.trim()) throw new Error('Comment text cannot be empty');
  const task = this.getTaskById(taskId);
  if (!task) throw new TaskNotFoundError(taskId);

  return withWriteTransaction(this.db, () => {
    const event = this.eventStore.append({
      task_id: taskId,
      type: EventType.CommentAdded,
      data: { text },
      author: opts?.author,
      agent_id: opts?.agent_id,
    });
    this.projectionEngine.applyEvent(event);
    return { event_rowid: event.rowid, task_id: taskId, author: opts?.author, agent_id: opts?.agent_id, text, timestamp: event.timestamp };
  });
}

addCheckpoint(taskId: string, name: string, data?: Record<string, unknown>, opts?: EventContext): Checkpoint {
  if (!name?.trim()) throw new Error('Checkpoint name cannot be empty');
  const task = this.getTaskById(taskId);
  if (!task) throw new TaskNotFoundError(taskId);

  const checkpointData = data ?? {};
  return withWriteTransaction(this.db, () => {
    const event = this.eventStore.append({
      task_id: taskId,
      type: EventType.CheckpointRecorded,
      data: { name, data: checkpointData },
      author: opts?.author,
      agent_id: opts?.agent_id,
    });
    this.projectionEngine.applyEvent(event);
    return { event_rowid: event.rowid, task_id: taskId, name, data: checkpointData, timestamp: event.timestamp };
  });
}

getComments(taskId: string): Comment[] {
  const rows = this.db.prepare(`
    SELECT event_rowid, task_id, author, agent_id, text, timestamp
    FROM task_comments WHERE task_id = ? ORDER BY event_rowid ASC
  `).all(taskId) as any[];
  return rows.map(r => ({ event_rowid: r.event_rowid, task_id: r.task_id, author: r.author ?? undefined, agent_id: r.agent_id ?? undefined, text: r.text, timestamp: r.timestamp }));
}

getCheckpoints(taskId: string): Checkpoint[] {
  const rows = this.db.prepare(`
    SELECT event_rowid, task_id, name, data, timestamp
    FROM task_checkpoints WHERE task_id = ? ORDER BY event_rowid ASC
  `).all(taskId) as any[];
  return rows.map(r => ({ event_rowid: r.event_rowid, task_id: r.task_id, name: r.name, data: JSON.parse(r.data), timestamp: r.timestamp }));
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/services/task-service.ts packages/hzl-core/src/services/task-service.test.ts
git commit -m "feat(core): add comments and checkpoints APIs to TaskService"
```

---

### Task 22: SearchService - Full-text Search ✅

**Files:**
- Create: `packages/hzl-core/src/services/search-service.ts`
- Test: `packages/hzl-core/src/services/search-service.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/services/search-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SearchService } from './search-service.js';
import { runMigrations } from '../db/migrations.js';
import { EventStore } from '../events/store.js';
import { ProjectionEngine } from '../projections/engine.js';
import { TasksCurrentProjector } from '../projections/tasks-current.js';
import { SearchProjector } from '../projections/search.js';
import { EventType } from '../events/types.js';

describe('SearchService', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let engine: ProjectionEngine;
  let searchService: SearchService;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    eventStore = new EventStore(db);
    engine = new ProjectionEngine(db);
    engine.register(new TasksCurrentProjector());
    engine.register(new SearchProjector());
    searchService = new SearchService(db);
  });

  afterEach(() => { db.close(); });

  function createTask(taskId: string, title: string, project: string, description?: string) {
    const event = eventStore.append({ task_id: taskId, type: EventType.TaskCreated, data: { title, project, description } });
    engine.applyEvent(event);
  }

  describe('search', () => {
    it('finds tasks by title match', () => {
      createTask('TASK1', 'Implement authentication', 'project-a');
      createTask('TASK2', 'Write documentation', 'project-a');

      const results = searchService.search('authentication');
      expect(results.tasks).toHaveLength(1);
      expect(results.tasks[0].task_id).toBe('TASK1');
    });

    it('finds tasks by description match', () => {
      createTask('TASK1', 'Backend task', 'project-a', 'Implement OAuth2');

      const results = searchService.search('OAuth2');
      expect(results.tasks).toHaveLength(1);
    });

    it('supports project filter', () => {
      createTask('TASK1', 'Auth for A', 'project-a');
      createTask('TASK2', 'Auth for B', 'project-b');

      const results = searchService.search('Auth', { project: 'project-a' });
      expect(results.tasks).toHaveLength(1);
      expect(results.tasks[0].task_id).toBe('TASK1');
    });

    it('supports limit and offset pagination', () => {
      for (let i = 0; i < 5; i++) createTask(`TASK${i}`, `Test task ${i}`, 'inbox');

      const page1 = searchService.search('Test', { limit: 2, offset: 0 });
      const page2 = searchService.search('Test', { limit: 2, offset: 2 });

      expect(page1.tasks).toHaveLength(2);
      expect(page2.tasks).toHaveLength(2);
      expect(page1.total).toBe(5);
    });

    it('handles empty query', () => {
      createTask('TASK1', 'Test', 'inbox');
      const results = searchService.search('');
      expect(results.tasks).toHaveLength(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL

**Step 3: Implement SearchService**

```typescript
// packages/hzl-core/src/services/search-service.ts
import type Database from 'better-sqlite3';

export interface SearchTaskResult { task_id: string; title: string; project: string; status: string; description: string | null; priority: number; rank: number; }
export interface SearchResult { tasks: SearchTaskResult[]; total: number; limit: number; offset: number; }
export interface SearchOptions { project?: string; limit?: number; offset?: number; }

export class SearchService {
  constructor(private db: Database.Database) {}

  search(query: string, opts?: SearchOptions): SearchResult {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const trimmedQuery = query.trim();

    if (!trimmedQuery) return { tasks: [], total: 0, limit, offset };

    const safeQuery = trimmedQuery.split(/\s+/).filter(w => w.length > 0).map(w => w.replace(/[^a-zA-Z0-9]/g, '')).filter(w => w.length > 0).join(' ');
    if (!safeQuery) return { tasks: [], total: 0, limit, offset };

    let countQuery: string, searchQuery: string;
    const params: any[] = [];

    if (opts?.project) {
      countQuery = `SELECT COUNT(*) as total FROM task_search s JOIN tasks_current t ON s.task_id = t.task_id WHERE task_search MATCH ? AND t.project = ?`;
      searchQuery = `SELECT t.task_id, t.title, t.project, t.status, t.description, t.priority, rank FROM task_search s JOIN tasks_current t ON s.task_id = t.task_id WHERE task_search MATCH ? AND t.project = ? ORDER BY rank LIMIT ? OFFSET ?`;
      params.push(safeQuery, opts.project, limit, offset);
    } else {
      countQuery = `SELECT COUNT(*) as total FROM task_search s JOIN tasks_current t ON s.task_id = t.task_id WHERE task_search MATCH ?`;
      searchQuery = `SELECT t.task_id, t.title, t.project, t.status, t.description, t.priority, rank FROM task_search s JOIN tasks_current t ON s.task_id = t.task_id WHERE task_search MATCH ? ORDER BY rank LIMIT ? OFFSET ?`;
      params.push(safeQuery, limit, offset);
    }

    const countParams = opts?.project ? [safeQuery, opts.project] : [safeQuery];
    const total = (this.db.prepare(countQuery).get(...countParams) as { total: number }).total;
    const rows = this.db.prepare(searchQuery).all(...params) as SearchTaskResult[];

    return { tasks: rows, total, limit, offset };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/services/search-service.ts packages/hzl-core/src/services/search-service.test.ts
git commit -m "feat(core): add SearchService with FTS5 full-text search"
```

---

## Phase 5: CLI (Full Command Surface)

### Task 23: CLI Framework Setup ✅

#### 23.1 CLI Types

**Files:**
- Create: `packages/hzl-cli/src/types.ts`
- Test: `packages/hzl-cli/src/types.test.ts`

**Step 1: Write failing test**

```typescript
// packages/hzl-cli/src/types.test.ts
import { describe, it, expect } from 'vitest';
import { GlobalOptionsSchema, type GlobalOptions, type Config } from './types.js';

describe('GlobalOptions', () => {
  it('validates valid options with db path', () => {
    const options = { db: '/path/to/db.sqlite', json: false };
    const result = GlobalOptionsSchema.safeParse(options);
    expect(result.success).toBe(true);
  });

  it('sets default values correctly', () => {
    const options = {};
    const result = GlobalOptionsSchema.parse(options);
    expect(result.json).toBe(false);
    expect(result.db).toBeUndefined();
  });
});

describe('Config type', () => {
  it('has correct shape', () => {
    const config: Config = { dbPath: '/path/to/db', defaultProject: 'inbox' };
    expect(config.dbPath).toBe('/path/to/db');
  });
});
```

**Step 2: Run test (expected FAIL)**

```bash
cd /Users/tmchow/Code/hzl && npm test --workspace=hzl-cli
```

**Step 3: Write minimal implementation**

```typescript
// packages/hzl-cli/src/types.ts
import { z } from 'zod';

export const GlobalOptionsSchema = z.object({
  db: z.string().optional(),
  json: z.boolean().default(false),
});

export type GlobalOptions = z.infer<typeof GlobalOptionsSchema>;

export interface Config {
  dbPath?: string;
  defaultProject?: string;
  defaultAuthor?: string;
  leaseMinutes?: number;
}

export interface CommandContext {
  dbPath: string;
  json: boolean;
}
```

**Step 4: Run test (expected PASS)**

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/types.ts packages/hzl-cli/src/types.test.ts
git commit -m "feat(cli): add CLI types with GlobalOptions and Config"
```

---

#### 23.2 Config Resolution

**Files:**
- Create: `packages/hzl-cli/src/config.ts`
- Test: `packages/hzl-cli/src/config.test.ts`

**Step 1: Write failing test**

```typescript
// packages/hzl-cli/src/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { resolveDbPath, loadConfig, getConfigPath, getDefaultDbPath } from './config.js';

describe('resolveDbPath', () => {
  const originalEnv = process.env;
  let tempDir: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.HZL_DB;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-test-'));
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns CLI option when provided', () => {
    const result = resolveDbPath('/custom/path/to/db.sqlite');
    expect(result).toBe('/custom/path/to/db.sqlite');
  });

  it('returns HZL_DB env var when CLI option not provided', () => {
    process.env.HZL_DB = '/env/path/to/db.sqlite';
    const result = resolveDbPath();
    expect(result).toBe('/env/path/to/db.sqlite');
  });

  it('CLI option takes precedence over env var', () => {
    process.env.HZL_DB = '/env/path/to/db.sqlite';
    const result = resolveDbPath('/cli/path/to/db.sqlite');
    expect(result).toBe('/cli/path/to/db.sqlite');
  });

  it('returns default path when nothing else specified', () => {
    const result = resolveDbPath();
    expect(result).toBe(getDefaultDbPath());
  });
});
```

**Step 2: Run test (expected FAIL)**

**Step 3: Write minimal implementation**

```typescript
// packages/hzl-cli/src/config.ts
import fs from 'fs';
import path from 'path';
import os from 'os';
import { z } from 'zod';
import type { Config } from './types.js';

const ConfigFileSchema = z.object({
  dbPath: z.string().optional(),
  defaultProject: z.string().optional(),
  defaultAuthor: z.string().optional(),
  leaseMinutes: z.number().positive().optional(),
}).partial();

export function getDefaultDbPath(): string {
  return path.join(os.homedir(), '.hzl', 'data.db');
}

export function getConfigPath(): string {
  return path.join(os.homedir(), '.hzl', 'config.json');
}

function expandTilde(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

export function resolveDbPath(cliOption?: string, configPath: string = getConfigPath()): string {
  if (cliOption) return expandTilde(cliOption);
  if (process.env.HZL_DB) return expandTilde(process.env.HZL_DB);

  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);
      if (config.dbPath) return expandTilde(config.dbPath);
    }
  } catch { /* ignore */ }

  return getDefaultDbPath();
}

export async function loadConfig(configPath: string = getConfigPath()): Promise<Config> {
  try {
    if (!fs.existsSync(configPath)) return {};
    const content = await fs.promises.readFile(configPath, 'utf-8');
    const result = ConfigFileSchema.safeParse(JSON.parse(content));
    return result.success ? result.data : {};
  } catch { return {}; }
}
```

**Step 4: Run test (expected PASS)**

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/config.ts packages/hzl-cli/src/config.test.ts
git commit -m "feat(cli): add config resolution with precedence chain"
```

---

#### 23.3 Error Handling

**Files:**
- Create: `packages/hzl-cli/src/errors.ts`
- Test: `packages/hzl-cli/src/errors.test.ts`

**Step 1: Write failing test**

```typescript
// packages/hzl-cli/src/errors.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLIError, handleError, ExitCode } from './errors.js';

describe('CLIError', () => {
  it('creates error with message and default exit code', () => {
    const error = new CLIError('Something went wrong');
    expect(error.message).toBe('Something went wrong');
    expect(error.exitCode).toBe(ExitCode.GeneralError);
  });

  it('creates error with custom exit code', () => {
    const error = new CLIError('Not found', ExitCode.NotFound);
    expect(error.exitCode).toBe(ExitCode.NotFound);
  });
});
```

**Step 2: Run test (expected FAIL)**

**Step 3: Write minimal implementation**

```typescript
// packages/hzl-cli/src/errors.ts
export enum ExitCode {
  Success = 0,
  GeneralError = 1,
  InvalidUsage = 2,
  NotFound = 3,
  DatabaseError = 4,
  ValidationError = 5,
}

export class CLIError extends Error {
  public readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode = ExitCode.GeneralError, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CLIError';
    this.exitCode = exitCode;
  }
}

export function handleError(error: unknown, options: { verbose?: boolean } = {}): never {
  if (error instanceof CLIError) {
    console.error(`Error: ${error.message}`);
    if (options.verbose && error.cause) console.error('Caused by:', error.cause);
    process.exit(error.exitCode);
  } else if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
    process.exit(ExitCode.GeneralError);
  } else {
    console.error('An unknown error occurred');
    process.exit(ExitCode.GeneralError);
  }
}
```

**Step 4: Run test (expected PASS)**

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/errors.ts packages/hzl-cli/src/errors.test.ts
git commit -m "feat(cli): add CLIError class and handleError function"
```

---

#### 23.4 Output Helpers

**Files:**
- Create: `packages/hzl-cli/src/output.ts`
- Test: `packages/hzl-cli/src/output.test.ts`

**Step 1: Write failing test**

```typescript
// packages/hzl-cli/src/output.test.ts
import { describe, it, expect } from 'vitest';
import { formatOutput, printTable, formatDate } from './output.js';

describe('formatOutput', () => {
  it('returns JSON string when json=true', () => {
    const data = { name: 'test', count: 42 };
    const result = formatOutput(data, true);
    expect(result).toBe('{"name":"test","count":42}');
  });

  it('returns string as-is when json=false', () => {
    const result = formatOutput('Hello world', false);
    expect(result).toBe('Hello world');
  });
});
```

**Step 2: Run test (expected FAIL)**

**Step 3: Write minimal implementation**

```typescript
// packages/hzl-cli/src/output.ts
export function formatOutput<T>(data: T, json: boolean, options: { pretty?: boolean } = {}): string | undefined {
  if (json) {
    if (data === undefined) return undefined;
    return options.pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  }
  return typeof data === 'string' ? data : String(data);
}

export function printSuccess(message: string): void { console.log(message); }
export function printError(message: string): void { console.error(`Error: ${message}`); }

export function printTable(rows: string[][]): void {
  if (rows.length === 0) return;
  const columnWidths: number[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (columnWidths[i] === undefined || row[i].length > columnWidths[i]) {
        columnWidths[i] = row[i].length;
      }
    }
  }
  for (const row of rows) {
    console.log(row.map((cell, i) => cell.padEnd(columnWidths[i])).join('  '));
  }
}

export function formatDate(isoString: string, options: { relative?: boolean } = {}): string {
  if (!isoString) return isoString;
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  if (options.relative) {
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
  return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
```

**Step 4: Run test (expected PASS)**

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/output.ts packages/hzl-cli/src/output.test.ts
git commit -m "feat(cli): add output formatting helpers"
```

---

#### 23.5 Main Entry Point

**Files:**
- Create: `packages/hzl-cli/src/index.ts`
- Create: `packages/hzl-cli/src/cli.ts`
- Test: `packages/hzl-cli/src/index.test.ts`

**Step 1: Write failing test**

```typescript
// packages/hzl-cli/src/index.test.ts
import { describe, it, expect } from 'vitest';
import { createProgram } from './index.js';

describe('createProgram', () => {
  it('creates a Commander program', () => {
    const program = createProgram();
    expect(program.name()).toBe('hzl');
  });

  it('has --db global option', () => {
    const program = createProgram();
    const dbOption = program.options.find((opt) => opt.long === '--db');
    expect(dbOption).toBeDefined();
  });

  it('has --json global option', () => {
    const program = createProgram();
    const jsonOption = program.options.find((opt) => opt.long === '--json');
    expect(jsonOption).toBeDefined();
  });
});
```

**Step 2: Run test (expected FAIL)**

**Step 3: Write minimal implementation**

```typescript
// packages/hzl-cli/src/index.ts
import { Command } from 'commander';
import { handleError } from './errors.js';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('hzl')
    .description('HZ Agent Ledger - Task coordination for AI agent swarms')
    .version('0.1.0')
    .option('--db <path>', 'Path to the database file')
    .option('--json', 'Output in JSON format', false);
  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();
  try { await program.parseAsync(argv); }
  catch (error) { handleError(error); }
}

export { GlobalOptions, Config, CommandContext } from './types.js';
export { resolveDbPath, loadConfig } from './config.js';
export { CLIError, ExitCode, handleError } from './errors.js';
export { formatOutput, printSuccess, printError, printTable } from './output.js';
```

```typescript
// packages/hzl-cli/src/cli.ts
#!/usr/bin/env node
import { run } from './index.js';
run().catch((error) => { console.error('Fatal error:', error); process.exit(1); });
```

**Step 4: Run test (expected PASS)**

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/index.ts packages/hzl-cli/src/cli.ts packages/hzl-cli/src/index.test.ts
git commit -m "feat(cli): add main entry point with Commander program"
```

---

### Task 24: Basic CLI Commands ✅

#### 24.1 init Command

**Files:**
- Create: `packages/hzl-cli/src/commands/init.ts`
- Test: `packages/hzl-cli/src/commands/init.test.ts`

**Step 1: Write failing test**

```typescript
// packages/hzl-cli/src/commands/init.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runInit } from './init.js';

describe('runInit', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-init-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates database file at specified path', async () => {
    const dbPath = path.join(tempDir, 'test.db');
    await runInit({ dbPath, json: false });
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('creates parent directory if it does not exist', async () => {
    const dbPath = path.join(tempDir, 'nested', 'dir', 'test.db');
    await runInit({ dbPath, json: false });
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('is idempotent - does not corrupt existing database', async () => {
    const dbPath = path.join(tempDir, 'test.db');
    await runInit({ dbPath, json: false });
    await runInit({ dbPath, json: false }); // Run again
    expect(fs.existsSync(dbPath)).toBe(true);
  });
});
```

**Step 2: Run test (expected FAIL)**

**Step 3: Write minimal implementation**

```typescript
// packages/hzl-cli/src/commands/init.ts
import { Command } from 'commander';
import fs from 'fs';
import { createConnection } from 'hzl-core';
import { resolveDbPath } from '../config.js';
import { formatOutput, printSuccess } from '../output.js';
import type { GlobalOptions } from '../types.js';

export interface InitResult { path: string; created: boolean; }

export async function runInit(options: { dbPath: string; json: boolean }): Promise<InitResult> {
  const { dbPath, json } = options;
  const existed = fs.existsSync(dbPath);
  const db = createConnection(dbPath);
  db.close();

  const result: InitResult = { path: dbPath, created: !existed };
  if (json) console.log(formatOutput(result, true));
  else printSuccess(result.created ? `Initialized new database at ${result.path}` : `Database already exists at ${result.path}`);
  return result;
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize a new HZL database')
    .action(async function (this: Command) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      await runInit({ dbPath: resolveDbPath(globalOpts.db), json: globalOpts.json ?? false });
    });
}
```

**Step 4: Run test (expected PASS)**

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/commands/init.ts packages/hzl-cli/src/commands/init.test.ts
git commit -m "feat(cli): add init command to create database"
```

---

#### 24.2 which-db Command

**Files:**
- Create: `packages/hzl-cli/src/commands/which-db.ts`
- Test: `packages/hzl-cli/src/commands/which-db.test.ts`

**Step 1-5:** Follow same TDD pattern. Prints resolved database path with source info (cli/env/config/default).

**Commit:**

```bash
git add packages/hzl-cli/src/commands/which-db.ts packages/hzl-cli/src/commands/which-db.test.ts
git commit -m "feat(cli): add which-db command to show resolved database path"
```

---

#### 24.3 projects Command

**Files:**
- Create: `packages/hzl-cli/src/commands/projects.ts`
- Test: `packages/hzl-cli/src/commands/projects.test.ts`

**Step 1-5:** Follow same TDD pattern. Lists all projects with task counts (excludes archived).

**Commit:**

```bash
git add packages/hzl-cli/src/commands/projects.ts packages/hzl-cli/src/commands/projects.test.ts
git commit -m "feat(cli): add projects command to list projects with task counts"
```

---

#### 24.4 rename-project Command

**Files:**
- Create: `packages/hzl-cli/src/commands/rename-project.ts`
- Test: `packages/hzl-cli/src/commands/rename-project.test.ts`

**Step 1-5:** Follow same TDD pattern. Renames project by emitting task_moved events, supports --force to merge.

**Commit:**

```bash
git add packages/hzl-cli/src/commands/rename-project.ts packages/hzl-cli/src/commands/rename-project.test.ts
git commit -m "feat(cli): add rename-project command with event emission"
```

---

### Task 25: Task Creation and Listing Commands ✅

#### 25.1-25.4 TaskService Methods

**Files:**
- Modify: `packages/hzl-core/src/services/task-service.ts`
- Test: `packages/hzl-core/src/services/task-service.test.ts`

Add methods:
- `createTask(projectName, title, options?)` - Creates task with optional parent, tags, estimate
- `listTasks(filters)` - Lists tasks with filters (project, status, parentId, tag, available)
- `getNextTask(projectName)` - Returns next available task (no blocking deps, oldest first)

---

#### 25.5 add Command

**Files:**
- Create: `packages/hzl-cli/src/commands/add.ts`
- Test: `packages/hzl-cli/src/commands/add.test.ts`

**Commit:**

```bash
git commit -m "feat(cli): add 'hzl add' command for task creation"
```

---

#### 25.6 list Command

**Files:**
- Create: `packages/hzl-cli/src/commands/list.ts`
- Test: `packages/hzl-cli/src/commands/list.test.ts`

Supports --project, --status, --parent, --tag, --available filters.

**Commit:**

```bash
git commit -m "feat(cli): add 'hzl list' command with filtering"
```

---

#### 25.7 next Command

**Files:**
- Create: `packages/hzl-cli/src/commands/next.ts`
- Test: `packages/hzl-cli/src/commands/next.test.ts`

**Commit:**

```bash
git commit -m "feat(cli): add 'hzl next' command for deterministic work selection"
```

---

### Task 26: Task Display and Update Commands ✅

#### 26.1-26.4 TaskService Methods

Add methods:
- `getTask(taskId)` - Returns task or null
- `getTaskWithDetails(taskId)` - Returns task with comments, checkpoints, recent history
- `getTaskHistory(taskId)` - Returns full event history
- `updateTask(taskId, updates)` - Updates title, estimate, tags
- `moveTask(taskId, newProject)` - Moves task to different project

---

#### 26.5-26.8 CLI Commands

**Commands:**
- `show` - Displays task details with comments, checkpoints, recent history
- `history` - Shows full event history for task
- `update` - Updates task fields (--title, --estimate, --tags, --priority, --desc)
- `move` - Moves task to different project

---

### Task 27: Task Workflow Commands ✅

#### 27.1-27.7 TaskService Methods

Add methods:
- `claimTask(taskId, owner, leaseDurationMs?)` - Claims task with lease
- `claimNextTask(projectName, owner)` - Claims next available task
- `completeTask(taskId)` - Marks task done
- `setTaskStatus(taskId, status)` - Changes task status
- `releaseTask(taskId)` - Releases claim
- `reopenTask(taskId)` - Reopens done/archived task
- `archiveTask(taskId)` - Archives task

---

#### 27.8-27.14 CLI Commands

**Commands:**
- `claim` - Claims task with optional --lease duration
- `claim-next` - Claims next available task
- `complete` - Marks task done
- `set-status` - Changes task status
- `release` - Releases claim
- `reopen` - Reopens done/archived task
- `archive` - Archives task

---

### Task 28: Steal and Stuck Commands ✅

#### 28.1-28.2 TaskService Methods

Add methods:
- `stealTask(taskId, newOwner, options)` - Steals task with --if-expired or --force
- `getStuckTasks(options)` - Lists tasks with expired leases

---

#### 28.3-28.4 CLI Commands

**Commands:**
- `steal` - Steals task with --if-expired (only if lease expired) or --force
- `stuck` - Lists stuck tasks with --project filter and --older-than duration

---

### Task 29: Dependency Commands ✅

#### 29.1 DependencyService

**Files:**
- Create: `packages/hzl-core/src/services/dependency-service.ts`
- Test: `packages/hzl-core/src/services/dependency-service.test.ts`

Methods:
- `addDependency(taskId, dependsOnId)` - Adds dependency, throws on cycle
- `removeDependency(taskId, dependsOnId)` - Removes dependency
- `getDependencies(taskId)` - Returns task IDs this task depends on
- `getDependents(taskId)` - Returns task IDs that depend on this task
- `wouldCreateCycle(taskId, dependsOnId)` - BFS cycle detection

---

#### 29.2 ValidationService

**Files:**
- Create: `packages/hzl-core/src/services/validation-service.ts`
- Test: `packages/hzl-core/src/services/validation-service.test.ts`

Methods:
- `validateProject(projectName)` - Returns ValidationResult with issues (cycles, missing deps, orphan parents, invalid states)

---

#### 29.3 CLI Commands

**Commands:**
- `add-dep <task-id> <depends-on-id>` - Adds dependency (fails if would create cycle)
- `remove-dep <task-id> <depends-on-id>` - Removes dependency
- `validate <project>` - Validates project integrity with --json and --strict options

---

### Task 30: Annotation Commands

#### 30.1 AnnotationService

**Files:**
- Create: `packages/hzl-core/src/services/annotation-service.ts`
- Test: `packages/hzl-core/src/services/annotation-service.test.ts`

Methods:
- `addComment(taskId, text, options?)` - Adds comment with optional author/agentId
- `getComments(taskId, options?)` - Returns comments with pagination
- `addCheckpoint(taskId, name, options?)` - Adds checkpoint with optional data
- `getCheckpoints(taskId)` - Returns checkpoints

---

#### 30.2 CLI Commands

**Commands:**
- `comment <task-id> <text>` - Adds comment with --author option
- `checkpoint <task-id> <name>` - Adds checkpoint with --data JSON option
- `checkpoints <task-id>` - Lists checkpoints with --json and --verbose options

---

### Task 31: Search Command

#### 31.1 SearchService

**Files:**
- Create: `packages/hzl-core/src/services/search-service.ts`
- Test: `packages/hzl-core/src/services/search-service.test.ts`

Methods:
- `search(query, options?)` - FTS5 full-text search with BM25 ranking
- `indexTask(taskId)` - Adds/updates task in search index
- `removeFromIndex(taskId)` - Removes task from index
- `rebuildIndex()` - Rebuilds entire FTS index

Features:
- Title matches ranked higher than description (10:1 weight)
- Supports prefix matching (auth*)
- Supports phrase search ("user login")
- Supports boolean operators (OR, NOT)
- Returns snippets with highlighted matches

---

#### 31.2 CLI search Command

**Files:**
- Create: `packages/hzl-cli/src/commands/search.ts`
- Test: `packages/hzl-cli/src/commands/search.test.ts`

Options: --project, --limit, --json, --verbose

---

### Task 32: Backup and Export Commands

#### 32.1-32.4 BackupService

**Files:**
- Create: `packages/hzl-core/src/services/backup-service.ts`
- Test: `packages/hzl-core/src/services/backup-service.test.ts`

Methods:
- `backup(destPath)` - SQLite backup API
- `restore(srcPath)` - Restores from backup
- `exportEvents(destPath)` - Exports events to JSONL
- `importEvents(srcPath)` - Imports events (idempotent via event_id)

---

#### 32.5 CLI Commands

**Commands:**
- `backup <dest>` - Backs up DB to file
- `restore <src>` - Restores DB from backup
- `export --output <file>` - Exports events to JSONL
- `import <file>` - Imports events from JSONL (idempotent)

---

### Task 33: Maintenance Commands

#### 33.1-33.3 MaintenanceService

**Files:**
- Create: `packages/hzl-core/src/services/maintenance-service.ts`
- Test: `packages/hzl-core/src/services/maintenance-service.test.ts`

Methods:
- `runDoctor()` - Returns DoctorResult (integrity_check + projection consistency)
- `rebuildProjections()` - Rebuilds all projections from events
- `compact()` - Runs VACUUM, returns space saved

---

#### 33.4 CLI Commands

**Commands:**
- `doctor` - Checks DB integrity and projection consistency
- `rebuild` - Rebuilds all projections from events
- `compact` - Runs VACUUM, reports space saved

---

### Task 34: Stats Command

#### 34.1 StatsService

**Files:**
- Create: `packages/hzl-core/src/services/stats-service.ts`
- Test: `packages/hzl-core/src/services/stats-service.test.ts`

Methods:
- `getStats(projectName?)` - Returns Stats object

Stats includes:
- Task counts by status (todo, in_progress, done, total)
- Average completion time (derived from events)
- Throughput (tasks completed per day/week)
- Tags distribution

---

#### 34.2 CLI stats Command

**Files:**
- Create: `packages/hzl-cli/src/commands/stats.ts`
- Test: `packages/hzl-cli/src/commands/stats.test.ts`

Options: --project, --json

---

### Phase 5 Summary Table

| Task | Commands/Services | Description |
|------|------------------|-------------|
| 23 | CLI framework | Types, config, errors, output, main entry |
| 24 | init, which-db, projects, rename-project | Basic commands |
| 25 | add, list, next | Task creation and listing |
| 26 | show, history, update, move | Task display and update |
| 27 | claim, claim-next, complete, set-status, release, reopen, archive | Workflow |
| 28 | steal, stuck | Lease management |
| 29 | add-dep, remove-dep, validate | Dependency management |
| 30 | comment, checkpoint, checkpoints | Annotations |
| 31 | search | Full-text search |
| 32 | backup, restore, export, import | Backup/export |
| 33 | doctor, rebuild, compact | Maintenance |
| 34 | stats | Statistics |

## Phase 6: Testing & QA

### Task 35: CLI Integration Tests ✅

Status: ✅

**Files:**
- Create: `packages/hzl-cli/src/__tests__/integration/cli-integration.test.ts`
- Create: `packages/hzl-cli/src/__tests__/integration/helpers.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-cli/src/__tests__/integration/helpers.ts
import { execSync, ExecSyncOptions } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface TestContext {
  tempDir: string;
  dbPath: string;
  cleanup: () => void;
}

export function createTestContext(): TestContext {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-integration-'));
  const dbPath = path.join(tempDir, 'test.db');
  return {
    tempDir,
    dbPath,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

export function hzl(ctx: TestContext, args: string, options?: ExecSyncOptions): string {
  const cmd = `node ${path.resolve(__dirname, '../../../dist/cli.js')} --db "${ctx.dbPath}" ${args}`;
  return execSync(cmd, { encoding: 'utf-8', ...options }).trim();
}

export function hzlJson<T>(ctx: TestContext, args: string): T {
  const output = hzl(ctx, `${args} --json`);
  return JSON.parse(output) as T;
}
```

```typescript
// packages/hzl-cli/src/__tests__/integration/cli-integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, hzl, hzlJson, TestContext } from './helpers.js';
import fs from 'fs';

describe('CLI Integration Tests', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  describe('init command', () => {
    it('creates database file', () => {
      hzl(ctx, 'init');
      expect(fs.existsSync(ctx.dbPath)).toBe(true);
    });

    it('is idempotent', () => {
      hzl(ctx, 'init');
      hzl(ctx, 'init'); // Run again
      expect(fs.existsSync(ctx.dbPath)).toBe(true);
    });

    it('returns JSON with created flag', () => {
      const result = hzlJson<{ path: string; created: boolean }>(ctx, 'init');
      expect(result.created).toBe(true);
      expect(result.path).toBe(ctx.dbPath);
    });
  });

  describe('which-db command', () => {
    it('returns resolved database path', () => {
      hzl(ctx, 'init');
      const result = hzlJson<{ path: string; source: string }>(ctx, 'which-db');
      expect(result.path).toBe(ctx.dbPath);
      expect(result.source).toBe('cli');
    });
  });

  describe('task lifecycle round-trip', () => {
    beforeEach(() => {
      hzl(ctx, 'init');
    });

    it('creates, lists, claims, completes, and archives a task', () => {
      // Create task
      const created = hzlJson<{ task_id: string; title: string }>(
        ctx,
        'add inbox "Test task" --priority 2 --tags urgent,backend'
      );
      expect(created.title).toBe('Test task');
      const taskId = created.task_id;

      // List tasks
      const listResult = hzlJson<{ tasks: any[] }>(ctx, 'list --project inbox');
      expect(listResult.tasks).toHaveLength(1);
      expect(listResult.tasks[0].status).toBe('backlog');

      // Set to ready
      hzl(ctx, `set-status ${taskId} ready`);
      const afterReady = hzlJson<{ status: string }>(ctx, `show ${taskId}`);
      expect(afterReady.status).toBe('ready');

      // Claim task
      const claimed = hzlJson<{ status: string; claimed_by_author: string }>(
        ctx,
        `claim ${taskId} --author agent-1 --lease 30m`
      );
      expect(claimed.status).toBe('in_progress');
      expect(claimed.claimed_by_author).toBe('agent-1');

      // Complete task
      const completed = hzlJson<{ status: string }>(ctx, `complete ${taskId}`);
      expect(completed.status).toBe('done');

      // Archive task
      const archived = hzlJson<{ status: string }>(ctx, `archive ${taskId}`);
      expect(archived.status).toBe('archived');
    });

    it('claim-next respects priority ordering', () => {
      // Create tasks with different priorities
      hzl(ctx, 'add inbox "Low priority" --priority 0');
      const high = hzlJson<{ task_id: string }>(ctx, 'add inbox "High priority" --priority 3');
      hzl(ctx, 'add inbox "Medium priority" --priority 1');

      // Set all to ready
      const tasks = hzlJson<{ tasks: { task_id: string }[] }>(ctx, 'list --project inbox');
      for (const task of tasks.tasks) {
        hzl(ctx, `set-status ${task.task_id} ready`);
      }

      // Claim next should get highest priority
      const claimed = hzlJson<{ task_id: string }>(ctx, 'claim-next inbox --author agent-1');
      expect(claimed.task_id).toBe(high.task_id);
    });

    it('claim-next respects dependency ordering', () => {
      const dep = hzlJson<{ task_id: string }>(ctx, 'add inbox "Dependency task"');
      const main = hzlJson<{ task_id: string }>(
        ctx,
        `add inbox "Main task" --depends-on ${dep.task_id}`
      );

      // Set both to ready
      hzl(ctx, `set-status ${dep.task_id} ready`);
      hzl(ctx, `set-status ${main.task_id} ready`);

      // Claim-next should skip main (has incomplete dep)
      const claimed = hzlJson<{ task_id: string }>(ctx, 'claim-next inbox --author agent-1');
      expect(claimed.task_id).toBe(dep.task_id);

      // Complete dep, now main should be claimable
      hzl(ctx, `complete ${dep.task_id}`);
      const claimedMain = hzlJson<{ task_id: string }>(ctx, 'claim-next inbox --author agent-1');
      expect(claimedMain.task_id).toBe(main.task_id);
    });
  });

  describe('dependency management round-trip', () => {
    beforeEach(() => {
      hzl(ctx, 'init');
    });

    it('adds and removes dependencies', () => {
      const task1 = hzlJson<{ task_id: string }>(ctx, 'add inbox "Task 1"');
      const task2 = hzlJson<{ task_id: string }>(ctx, 'add inbox "Task 2"');

      // Add dependency
      hzl(ctx, `add-dep ${task2.task_id} ${task1.task_id}`);
      const showTask2 = hzlJson<{ dependencies: string[] }>(ctx, `show ${task2.task_id}`);
      expect(showTask2.dependencies).toContain(task1.task_id);

      // Remove dependency
      hzl(ctx, `remove-dep ${task2.task_id} ${task1.task_id}`);
      const afterRemove = hzlJson<{ dependencies: string[] }>(ctx, `show ${task2.task_id}`);
      expect(afterRemove.dependencies).not.toContain(task1.task_id);
    });

    it('rejects cyclic dependencies', () => {
      const task1 = hzlJson<{ task_id: string }>(ctx, 'add inbox "Task 1"');
      const task2 = hzlJson<{ task_id: string }>(ctx, 'add inbox "Task 2"');

      hzl(ctx, `add-dep ${task2.task_id} ${task1.task_id}`);

      // Adding reverse dependency should fail
      expect(() => hzl(ctx, `add-dep ${task1.task_id} ${task2.task_id}`)).toThrow();
    });
  });

  describe('comment and checkpoint round-trip', () => {
    beforeEach(() => {
      hzl(ctx, 'init');
    });

    it('adds comments and retrieves them', () => {
      const task = hzlJson<{ task_id: string }>(ctx, 'add inbox "Test task"');

      hzl(ctx, `comment ${task.task_id} "First comment" --author user-1`);
      hzl(ctx, `comment ${task.task_id} "Second comment" --author user-2`);

      const details = hzlJson<{ comments: { text: string; author: string }[] }>(
        ctx,
        `show ${task.task_id} --verbose`
      );
      expect(details.comments).toHaveLength(2);
      expect(details.comments[0].text).toBe('First comment');
    });

    it('adds checkpoints and retrieves them', () => {
      const task = hzlJson<{ task_id: string }>(ctx, 'add inbox "Test task"');

      hzl(ctx, `checkpoint ${task.task_id} step1 --data '{"progress": 25}'`);
      hzl(ctx, `checkpoint ${task.task_id} step2 --data '{"progress": 50}'`);

      const checkpoints = hzlJson<{ checkpoints: { name: string; data: any }[] }>(
        ctx,
        `checkpoints ${task.task_id}`
      );
      expect(checkpoints.checkpoints).toHaveLength(2);
      expect(checkpoints.checkpoints[0].name).toBe('step1');
      expect(checkpoints.checkpoints[0].data.progress).toBe(25);
    });
  });

  describe('search round-trip', () => {
    beforeEach(() => {
      hzl(ctx, 'init');
    });

    it('indexes and finds tasks by title', () => {
      hzl(ctx, 'add inbox "Implement OAuth authentication"');
      hzl(ctx, 'add inbox "Write unit tests"');
      hzl(ctx, 'add inbox "Setup CI pipeline"');

      const results = hzlJson<{ tasks: { title: string }[] }>(ctx, 'search authentication');
      expect(results.tasks).toHaveLength(1);
      expect(results.tasks[0].title).toContain('OAuth');
    });

    it('finds tasks by description', () => {
      hzl(ctx, 'add inbox "Backend task" --desc "Implement REST API endpoints"');
      hzl(ctx, 'add inbox "Frontend task" --desc "Create React components"');

      const results = hzlJson<{ tasks: { title: string }[] }>(ctx, 'search REST');
      expect(results.tasks).toHaveLength(1);
      expect(results.tasks[0].title).toBe('Backend task');
    });
  });

  describe('project management round-trip', () => {
    beforeEach(() => {
      hzl(ctx, 'init');
    });

    it('lists projects with task counts', () => {
      hzl(ctx, 'add project-a "Task 1"');
      hzl(ctx, 'add project-a "Task 2"');
      hzl(ctx, 'add project-b "Task 3"');

      const projects = hzlJson<{ projects: { name: string; task_count: number }[] }>(
        ctx,
        'projects'
      );
      expect(projects.projects).toHaveLength(2);

      const projectA = projects.projects.find((p) => p.name === 'project-a');
      expect(projectA?.task_count).toBe(2);
    });

    it('moves tasks between projects', () => {
      const task = hzlJson<{ task_id: string }>(ctx, 'add project-a "Movable task"');

      hzl(ctx, `move ${task.task_id} project-b`);

      const afterMove = hzlJson<{ project: string }>(ctx, `show ${task.task_id}`);
      expect(afterMove.project).toBe('project-b');
    });

    it('renames project by moving all tasks', () => {
      hzl(ctx, 'add old-project "Task 1"');
      hzl(ctx, 'add old-project "Task 2"');

      hzl(ctx, 'rename-project old-project new-project');

      const projects = hzlJson<{ projects: { name: string }[] }>(ctx, 'projects');
      const names = projects.projects.map((p) => p.name);
      expect(names).toContain('new-project');
      expect(names).not.toContain('old-project');
    });
  });

  describe('history and event tracking', () => {
    beforeEach(() => {
      hzl(ctx, 'init');
    });

    it('shows full event history for a task', () => {
      const task = hzlJson<{ task_id: string }>(ctx, 'add inbox "Test task"');
      hzl(ctx, `set-status ${task.task_id} ready`);
      hzl(ctx, `claim ${task.task_id} --author agent-1`);
      hzl(ctx, `comment ${task.task_id} "Working on it"`);
      hzl(ctx, `complete ${task.task_id}`);

      const history = hzlJson<{ events: { type: string }[] }>(ctx, `history ${task.task_id}`);
      const eventTypes = history.events.map((e) => e.type);

      expect(eventTypes).toContain('task_created');
      expect(eventTypes).toContain('status_changed');
      expect(eventTypes).toContain('comment_added');
    });
  });

  describe('stats command', () => {
    beforeEach(() => {
      hzl(ctx, 'init');
    });

    it('returns task counts by status', () => {
      // Create tasks in various states
      const t1 = hzlJson<{ task_id: string }>(ctx, 'add inbox "Backlog task"');
      const t2 = hzlJson<{ task_id: string }>(ctx, 'add inbox "Ready task"');
      const t3 = hzlJson<{ task_id: string }>(ctx, 'add inbox "In progress task"');
      const t4 = hzlJson<{ task_id: string }>(ctx, 'add inbox "Done task"');

      hzl(ctx, `set-status ${t2.task_id} ready`);
      hzl(ctx, `set-status ${t3.task_id} ready`);
      hzl(ctx, `claim ${t3.task_id} --author agent-1`);
      hzl(ctx, `set-status ${t4.task_id} ready`);
      hzl(ctx, `claim ${t4.task_id} --author agent-1`);
      hzl(ctx, `complete ${t4.task_id}`);

      const stats = hzlJson<{
        by_status: { backlog: number; ready: number; in_progress: number; done: number };
      }>(ctx, 'stats --project inbox');

      expect(stats.by_status.backlog).toBe(1);
      expect(stats.by_status.ready).toBe(1);
      expect(stats.by_status.in_progress).toBe(1);
      expect(stats.by_status.done).toBe(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-cli && npm run build && npm test`
Expected: FAIL (commands not implemented yet)

**Step 3: Implementation note**

These tests drive the implementation of CLI commands. Run them after completing Tasks 24-34 to verify end-to-end functionality.

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-cli && npm run build && npm test`
Expected: PASS (after all CLI commands implemented)

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/__tests__/
git commit -m "test(cli): add CLI integration tests with round-trip scenarios"
```

---

### Task 36: Cross-Process Concurrency Stress Tests ✅

Status: ✅

**Files:**
- Create: `packages/hzl-core/src/__tests__/concurrency/stress.test.ts`
- Create: `packages/hzl-core/src/__tests__/concurrency/worker.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/__tests__/concurrency/worker.ts
import { parentPort, workerData } from 'worker_threads';
import { createConnection, TaskService, EventStore, ProjectionEngine } from '../../index.js';
import { TasksCurrentProjector } from '../../projections/tasks-current.js';
import { DependenciesProjector } from '../../projections/dependencies.js';
import { TagsProjector } from '../../projections/tags.js';

interface WorkerCommand {
  type: 'claim-next' | 'steal' | 'complete' | 'release';
  project?: string;
  taskId?: string;
  author: string;
  leaseMinutes?: number;
  ifExpired?: boolean;
  force?: boolean;
}

interface WorkerResult {
  success: boolean;
  taskId?: string;
  error?: string;
  operation: string;
}

const { dbPath, command } = workerData as { dbPath: string; command: WorkerCommand };

async function run(): Promise<WorkerResult> {
  const db = createConnection(dbPath);
  const eventStore = new EventStore(db);
  const engine = new ProjectionEngine(db);
  engine.register(new TasksCurrentProjector());
  engine.register(new DependenciesProjector());
  engine.register(new TagsProjector());
  const taskService = new TaskService(db, eventStore, engine);

  try {
    switch (command.type) {
      case 'claim-next': {
        const leaseUntil = command.leaseMinutes
          ? new Date(Date.now() + command.leaseMinutes * 60000).toISOString()
          : undefined;
        const task = taskService.claimNext({
          project: command.project,
          author: command.author,
          lease_until: leaseUntil,
        });
        db.close();
        return { success: !!task, taskId: task?.task_id, operation: 'claim-next' };
      }
      case 'steal': {
        const result = taskService.stealTask(command.taskId!, {
          ifExpired: command.ifExpired,
          force: command.force,
          author: command.author,
        });
        db.close();
        return { success: result.success, taskId: command.taskId, operation: 'steal', error: result.error };
      }
      case 'complete': {
        const task = taskService.completeTask(command.taskId!, { author: command.author });
        db.close();
        return { success: true, taskId: task.task_id, operation: 'complete' };
      }
      case 'release': {
        const task = taskService.releaseTask(command.taskId!, { author: command.author });
        db.close();
        return { success: true, taskId: task.task_id, operation: 'release' };
      }
      default:
        db.close();
        return { success: false, error: 'Unknown command', operation: command.type };
    }
  } catch (err: any) {
    db.close();
    return { success: false, error: err.message, operation: command.type };
  }
}

run().then((result) => parentPort?.postMessage(result));
```

```typescript
// packages/hzl-core/src/__tests__/concurrency/stress.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Worker } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { createConnection } from '../../db/connection.js';
import { EventStore } from '../../events/store.js';
import { ProjectionEngine } from '../../projections/engine.js';
import { TasksCurrentProjector } from '../../projections/tasks-current.js';
import { DependenciesProjector } from '../../projections/dependencies.js';
import { TagsProjector } from '../../projections/tags.js';
import { TaskService } from '../../services/task-service.js';
import { TaskStatus } from '../../events/types.js';

interface WorkerResult {
  success: boolean;
  taskId?: string;
  error?: string;
  operation: string;
}

function runWorker(dbPath: string, command: any): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'worker.js'), {
      workerData: { dbPath, command },
    });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}

describe('Concurrency Stress Tests', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;
  let taskService: TaskService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-stress-'));
    dbPath = path.join(tempDir, 'test.db');
    db = createConnection(dbPath);
    const eventStore = new EventStore(db);
    const engine = new ProjectionEngine(db);
    engine.register(new TasksCurrentProjector());
    engine.register(new DependenciesProjector());
    engine.register(new TagsProjector());
    taskService = new TaskService(db, eventStore, engine);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('claim-next contention', () => {
    it('ensures exactly one agent claims each task under high contention', async () => {
      // Setup: Create 10 ready tasks
      const taskIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const task = taskService.createTask({ title: `Task ${i}`, project: 'stress-test' });
        taskService.setStatus(task.task_id, TaskStatus.Ready);
        taskIds.push(task.task_id);
      }
      db.close();

      // Run 20 concurrent workers trying to claim-next
      const workerCount = 20;
      const promises: Promise<WorkerResult>[] = [];
      for (let i = 0; i < workerCount; i++) {
        promises.push(
          runWorker(dbPath, {
            type: 'claim-next',
            project: 'stress-test',
            author: `agent-${i}`,
            leaseMinutes: 5,
          })
        );
      }

      const results = await Promise.all(promises);

      // Verify: Exactly 10 successful claims (one per task)
      const successfulClaims = results.filter((r) => r.success);
      expect(successfulClaims).toHaveLength(10);

      // Verify: Each task claimed exactly once
      const claimedTaskIds = successfulClaims.map((r) => r.taskId);
      const uniqueClaimedIds = new Set(claimedTaskIds);
      expect(uniqueClaimedIds.size).toBe(10);

      // Verify: All original tasks are accounted for
      for (const taskId of taskIds) {
        expect(claimedTaskIds).toContain(taskId);
      }

      // Verify: 10 workers got nothing (no tasks left)
      const failedClaims = results.filter((r) => !r.success);
      expect(failedClaims).toHaveLength(10);
    });

    it('handles SQLITE_BUSY gracefully with retry logic', async () => {
      // Create a single task
      const task = taskService.createTask({ title: 'Contested task', project: 'stress-test' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      db.close();

      // 50 concurrent workers all trying to claim the same task via claim-next
      const workerCount = 50;
      const promises: Promise<WorkerResult>[] = [];
      for (let i = 0; i < workerCount; i++) {
        promises.push(
          runWorker(dbPath, {
            type: 'claim-next',
            project: 'stress-test',
            author: `agent-${i}`,
          })
        );
      }

      const results = await Promise.all(promises);

      // Exactly one should succeed
      const successfulClaims = results.filter((r) => r.success);
      expect(successfulClaims).toHaveLength(1);
      expect(successfulClaims[0].taskId).toBe(task.task_id);

      // No unhandled SQLITE_BUSY errors (all handled by retry logic)
      const busyErrors = results.filter((r) => r.error?.includes('SQLITE_BUSY'));
      expect(busyErrors).toHaveLength(0);
    });
  });

  describe('steal contention', () => {
    it('ensures exactly one agent steals an expired lease', async () => {
      // Create and claim a task with an expired lease
      const task = taskService.createTask({ title: 'Expired task', project: 'stress-test' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, {
        author: 'original-agent',
        lease_until: new Date(Date.now() - 60000).toISOString(), // Expired 1 minute ago
      });
      db.close();

      // 10 concurrent workers trying to steal with ifExpired
      const workerCount = 10;
      const promises: Promise<WorkerResult>[] = [];
      for (let i = 0; i < workerCount; i++) {
        promises.push(
          runWorker(dbPath, {
            type: 'steal',
            taskId: task.task_id,
            author: `stealer-${i}`,
            ifExpired: true,
          })
        );
      }

      const results = await Promise.all(promises);

      // Exactly one should succeed
      const successfulSteals = results.filter((r) => r.success);
      expect(successfulSteals).toHaveLength(1);
    });

    it('rejects steal when lease is not expired', async () => {
      // Create and claim a task with a future lease
      const task = taskService.createTask({ title: 'Active task', project: 'stress-test' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, {
        author: 'original-agent',
        lease_until: new Date(Date.now() + 3600000).toISOString(), // Expires in 1 hour
      });
      db.close();

      // Try to steal with ifExpired (should fail)
      const result = await runWorker(dbPath, {
        type: 'steal',
        taskId: task.task_id,
        author: 'stealer',
        ifExpired: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not expired');
    });
  });

  describe('mixed operations stress test', () => {
    it('handles concurrent claim, complete, release operations', async () => {
      // Create 20 ready tasks
      for (let i = 0; i < 20; i++) {
        const task = taskService.createTask({ title: `Task ${i}`, project: 'stress-test' });
        taskService.setStatus(task.task_id, TaskStatus.Ready);
      }
      db.close();

      // Wave 1: 10 agents claim tasks
      const claimPromises: Promise<WorkerResult>[] = [];
      for (let i = 0; i < 10; i++) {
        claimPromises.push(
          runWorker(dbPath, {
            type: 'claim-next',
            project: 'stress-test',
            author: `agent-${i}`,
            leaseMinutes: 5,
          })
        );
      }
      const claimResults = await Promise.all(claimPromises);
      const claimedTasks = claimResults.filter((r) => r.success).map((r) => r.taskId!);

      // Wave 2: Concurrently - 5 complete, 3 release, 2 more agents try to claim
      const wave2Promises: Promise<WorkerResult>[] = [];

      // 5 complete operations
      for (let i = 0; i < 5; i++) {
        wave2Promises.push(
          runWorker(dbPath, {
            type: 'complete',
            taskId: claimedTasks[i],
            author: `agent-${i}`,
          })
        );
      }

      // 3 release operations
      for (let i = 5; i < 8; i++) {
        wave2Promises.push(
          runWorker(dbPath, {
            type: 'release',
            taskId: claimedTasks[i],
            author: `agent-${i}`,
          })
        );
      }

      // 2 new claim-next attempts
      for (let i = 10; i < 12; i++) {
        wave2Promises.push(
          runWorker(dbPath, {
            type: 'claim-next',
            project: 'stress-test',
            author: `agent-${i}`,
          })
        );
      }

      const wave2Results = await Promise.all(wave2Promises);

      // Verify all operations completed without crashes
      const errors = wave2Results.filter((r) => r.error && !r.error.includes('not claimable'));
      expect(errors).toHaveLength(0);

      // Verify database is in consistent state
      const verifyDb = createConnection(dbPath);
      const taskCounts = verifyDb
        .prepare(
          `SELECT status, COUNT(*) as count FROM tasks_current
           WHERE project = 'stress-test' GROUP BY status`
        )
        .all() as { status: string; count: number }[];
      verifyDb.close();

      // Should have: 5 done, some ready (released + unclaimed), some in_progress
      const totalTasks = taskCounts.reduce((sum, row) => sum + row.count, 0);
      expect(totalTasks).toBe(20);
    });
  });

  describe('invariant preservation under concurrency', () => {
    it('never allows double-claiming the same task', async () => {
      const task = taskService.createTask({ title: 'Single task', project: 'stress-test' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      db.close();

      // 100 concurrent claim attempts on the same task
      const promises: Promise<WorkerResult>[] = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          runWorker(dbPath, {
            type: 'claim-next',
            project: 'stress-test',
            author: `agent-${i}`,
          })
        );
      }

      const results = await Promise.all(promises);
      const successCount = results.filter((r) => r.success).length;

      // Exactly one claim should succeed
      expect(successCount).toBe(1);

      // Verify task is claimed exactly once in DB
      const verifyDb = createConnection(dbPath);
      const taskRow = verifyDb
        .prepare('SELECT * FROM tasks_current WHERE task_id = ?')
        .get(task.task_id) as any;
      verifyDb.close();

      expect(taskRow.status).toBe('in_progress');
      expect(taskRow.claimed_by_author).toBeDefined();
    });

    it('maintains consistent event count under concurrent writes', async () => {
      // Create 10 tasks
      const taskIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const task = taskService.createTask({ title: `Task ${i}`, project: 'stress-test' });
        taskService.setStatus(task.task_id, TaskStatus.Ready);
        taskIds.push(task.task_id);
      }

      const initialEventCount = db
        .prepare('SELECT COUNT(*) as count FROM events')
        .get() as { count: number };
      db.close();

      // Concurrent claims
      const claimPromises = taskIds.map((taskId, i) =>
        runWorker(dbPath, {
          type: 'claim-next',
          project: 'stress-test',
          author: `agent-${i}`,
        })
      );
      await Promise.all(claimPromises);

      // Verify event count increased correctly
      const verifyDb = createConnection(dbPath);
      const finalEventCount = verifyDb
        .prepare('SELECT COUNT(*) as count FROM events')
        .get() as { count: number };

      // Should have exactly 10 new status_changed events (one per successful claim)
      const statusChangedEvents = verifyDb
        .prepare("SELECT COUNT(*) as count FROM events WHERE type = 'status_changed'")
        .get() as { count: number };
      verifyDb.close();

      // 10 tasks × 2 status changes (backlog→ready, ready→in_progress) = 20 status_changed events
      expect(statusChangedEvents.count).toBe(20);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL (worker file needs to be built)

**Step 3: Build worker and run tests**

Update `packages/hzl-core/vitest.config.ts` to include worker compilation.

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/__tests__/concurrency/
git commit -m "test(core): add cross-process concurrency stress tests for claim, steal operations"
```

---

### Task 37: Migration Upgrade Tests ✅

Status: ✅

**Files:**
- Create: `packages/hzl-core/src/__tests__/migrations/upgrade.test.ts`
- Create: `packages/hzl-core/src/__tests__/migrations/fixtures/v1-sample.sql`
- Create: `packages/hzl-core/src/db/migrations/v2.ts` (future migration placeholder)

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/__tests__/migrations/upgrade.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runMigrations, getCurrentVersion } from '../../db/migrations.js';
import { createConnection } from '../../db/connection.js';

describe('Migration Upgrade Tests', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-migration-'));
    dbPath = path.join(tempDir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('v1 schema creation', () => {
    it('creates all required tables', () => {
      const db = createConnection(dbPath);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain('events');
      expect(tableNames).toContain('tasks_current');
      expect(tableNames).toContain('task_dependencies');
      expect(tableNames).toContain('task_tags');
      expect(tableNames).toContain('task_comments');
      expect(tableNames).toContain('task_checkpoints');
      expect(tableNames).toContain('projection_state');
      expect(tableNames).toContain('schema_migrations');

      db.close();
    });

    it('creates all required indexes', () => {
      const db = createConnection(dbPath);

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
        .all() as { name: string }[];
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_events_task_id');
      expect(indexNames).toContain('idx_events_type');
      expect(indexNames).toContain('idx_tasks_current_project_status');
      expect(indexNames).toContain('idx_tasks_current_claim_next');
      expect(indexNames).toContain('idx_deps_depends_on');
      expect(indexNames).toContain('idx_task_tags_tag');

      db.close();
    });

    it('sets correct schema version', () => {
      const db = createConnection(dbPath);
      const version = getCurrentVersion(db);
      expect(version).toBe(1);
      db.close();
    });
  });

  describe('v1 fixture loading', () => {
    it('loads v1 fixture and verifies data integrity', () => {
      // Create DB with v1 schema
      const db = new Database(dbPath);
      
      // Load v1 fixture SQL
      const fixturePath = path.join(__dirname, 'fixtures', 'v1-sample.sql');
      const fixtureSql = fs.readFileSync(fixturePath, 'utf-8');
      db.exec(fixtureSql);
      db.close();

      // Reopen with migrations
      const migratedDb = createConnection(dbPath);

      // Verify events loaded correctly
      const eventCount = migratedDb
        .prepare('SELECT COUNT(*) as count FROM events')
        .get() as { count: number };
      expect(eventCount.count).toBeGreaterThan(0);

      // Verify tasks_current projection is populated
      const taskCount = migratedDb
        .prepare('SELECT COUNT(*) as count FROM tasks_current')
        .get() as { count: number };
      expect(taskCount.count).toBeGreaterThan(0);

      // Verify data relationships
      const taskWithDeps = migratedDb
        .prepare(`
          SELECT tc.task_id, COUNT(td.depends_on_id) as dep_count
          FROM tasks_current tc
          LEFT JOIN task_dependencies td ON tc.task_id = td.task_id
          GROUP BY tc.task_id
          HAVING dep_count > 0
        `)
        .all();
      expect(taskWithDeps.length).toBeGreaterThan(0);

      migratedDb.close();
    });
  });

  describe('v1 → v2 migration (future)', () => {
    it('preserves all existing data after upgrade', async () => {
      // Create DB with v1 data
      const db = createConnection(dbPath);
      
      // Insert test data
      db.exec(`
        INSERT INTO events (event_id, task_id, type, data, timestamp)
        VALUES 
          ('EVT001', 'TASK001', 'task_created', '{"title":"Test task","project":"inbox"}', '2026-01-01T00:00:00Z'),
          ('EVT002', 'TASK001', 'status_changed', '{"from":"backlog","to":"ready"}', '2026-01-01T00:01:00Z');
        
        INSERT INTO tasks_current (task_id, title, project, status, links, tags, metadata, created_at, updated_at, last_event_id)
        VALUES ('TASK001', 'Test task', 'inbox', 'ready', '[]', '["important"]', '{}', '2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z', 2);
        
        INSERT INTO task_tags (task_id, tag) VALUES ('TASK001', 'important');
      `);

      const preEventCount = db
        .prepare('SELECT COUNT(*) as count FROM events')
        .get() as { count: number };
      const preTaskCount = db
        .prepare('SELECT COUNT(*) as count FROM tasks_current')
        .get() as { count: number };
      
      db.close();

      // Run migrations (will apply v2 when it exists)
      const migratedDb = createConnection(dbPath);

      // Verify data preserved
      const postEventCount = migratedDb
        .prepare('SELECT COUNT(*) as count FROM events')
        .get() as { count: number };
      const postTaskCount = migratedDb
        .prepare('SELECT COUNT(*) as count FROM tasks_current')
        .get() as { count: number };

      expect(postEventCount.count).toBe(preEventCount.count);
      expect(postTaskCount.count).toBe(preTaskCount.count);

      // Verify specific data integrity
      const task = migratedDb
        .prepare('SELECT * FROM tasks_current WHERE task_id = ?')
        .get('TASK001') as any;
      expect(task.title).toBe('Test task');
      expect(task.status).toBe('ready');

      migratedDb.close();
    });

    it('handles empty database upgrade', () => {
      // Create empty v1 database
      const db = new Database(dbPath);
      db.exec(`
        CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
        INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-01-01T00:00:00Z');
      `);
      db.close();

      // Run migrations
      const migratedDb = createConnection(dbPath);
      const version = getCurrentVersion(migratedDb);
      
      // Should be at latest version
      expect(version).toBeGreaterThanOrEqual(1);
      migratedDb.close();
    });

    it('migration is idempotent', () => {
      const db = createConnection(dbPath);
      const version1 = getCurrentVersion(db);
      db.close();

      // Run migrations again
      const db2 = createConnection(dbPath);
      const version2 = getCurrentVersion(db2);
      db2.close();

      // Run migrations a third time
      const db3 = createConnection(dbPath);
      const version3 = getCurrentVersion(db3);
      db3.close();

      expect(version1).toBe(version2);
      expect(version2).toBe(version3);
    });
  });

  describe('migration rollback scenarios', () => {
    it('fails gracefully on corrupted schema_migrations table', () => {
      // Create DB with corrupted schema_migrations
      const db = new Database(dbPath);
      db.exec(`
        CREATE TABLE schema_migrations (version TEXT, applied_at TEXT);
        INSERT INTO schema_migrations (version, applied_at) VALUES ('not_a_number', '2026-01-01');
      `);
      db.close();

      // Should handle gracefully and recreate schema
      const migratedDb = createConnection(dbPath);
      const version = getCurrentVersion(migratedDb);
      expect(version).toBeGreaterThanOrEqual(1);
      migratedDb.close();
    });

    it('handles partial migration failure', () => {
      // This test verifies transaction atomicity
      const db = new Database(dbPath);
      runMigrations(db);

      // Simulate partial state by manually corrupting
      db.exec('DROP TABLE IF EXISTS task_search');
      db.close();

      // Reconnecting should detect and handle the issue
      // (In practice, this would trigger a rebuild or error)
      const reconnectedDb = createConnection(dbPath);
      
      // FTS5 table should be recreated
      const ftsTable = reconnectedDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='task_search'")
        .get();
      expect(ftsTable).toBeDefined();
      
      reconnectedDb.close();
    });
  });

  describe('schema version tracking', () => {
    it('records migration timestamps', () => {
      const db = createConnection(dbPath);
      
      const migrations = db
        .prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version')
        .all() as { version: number; applied_at: string }[];

      expect(migrations.length).toBeGreaterThan(0);
      for (const m of migrations) {
        expect(m.version).toBeGreaterThan(0);
        expect(new Date(m.applied_at).getTime()).not.toBeNaN();
      }

      db.close();
    });

    it('does not re-run already applied migrations', () => {
      const db = createConnection(dbPath);
      
      // Add a marker to detect if migration runs again
      db.exec("INSERT INTO projection_state (name, last_event_id, updated_at) VALUES ('test_marker', 999, '2026-01-01')");
      db.close();

      // Reopen (triggers migration check)
      const db2 = createConnection(dbPath);
      
      // Marker should still exist (migration didn't wipe it)
      const marker = db2
        .prepare("SELECT * FROM projection_state WHERE name = 'test_marker'")
        .get();
      expect(marker).toBeDefined();

      db2.close();
    });
  });
});
```

**Step 2: Create v1 fixture file**

```sql
-- packages/hzl-core/src/__tests__/migrations/fixtures/v1-sample.sql
-- V1 Schema Sample Data Fixture
-- This fixture contains sample data for testing migration upgrades

-- Schema migrations tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-01-01T00:00:00Z');

-- Events table with sample events
CREATE TABLE IF NOT EXISTS events (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id         TEXT NOT NULL UNIQUE,
    task_id          TEXT NOT NULL,
    type             TEXT NOT NULL,
    data             TEXT NOT NULL,
    author           TEXT,
    agent_id         TEXT,
    session_id       TEXT,
    correlation_id   TEXT,
    causation_id     TEXT,
    timestamp        TEXT NOT NULL
);

INSERT INTO events (event_id, task_id, type, data, author, agent_id, timestamp) VALUES
  ('EVT001', 'TASK001', 'task_created', '{"title":"Setup project","project":"onboarding","priority":2}', 'user-1', NULL, '2026-01-01T10:00:00Z'),
  ('EVT002', 'TASK001', 'status_changed', '{"from":"backlog","to":"ready"}', 'user-1', NULL, '2026-01-01T10:05:00Z'),
  ('EVT003', 'TASK002', 'task_created', '{"title":"Write documentation","project":"onboarding","depends_on":["TASK001"]}', 'user-1', NULL, '2026-01-01T10:10:00Z'),
  ('EVT004', 'TASK003', 'task_created', '{"title":"Code review","project":"onboarding","tags":["review","important"]}', 'user-1', NULL, '2026-01-01T10:15:00Z'),
  ('EVT005', 'TASK001', 'status_changed', '{"from":"ready","to":"in_progress"}', 'agent-1', 'AGENT001', '2026-01-01T11:00:00Z'),
  ('EVT006', 'TASK001', 'comment_added', '{"text":"Starting work on this"}', 'agent-1', 'AGENT001', '2026-01-01T11:01:00Z'),
  ('EVT007', 'TASK001', 'checkpoint_recorded', '{"name":"step1","data":{"progress":50}}', 'agent-1', 'AGENT001', '2026-01-01T11:30:00Z'),
  ('EVT008', 'TASK001', 'status_changed', '{"from":"in_progress","to":"done"}', 'agent-1', 'AGENT001', '2026-01-01T12:00:00Z');

-- Projection state
CREATE TABLE IF NOT EXISTS projection_state (
    name          TEXT PRIMARY KEY,
    last_event_id INTEGER NOT NULL DEFAULT 0,
    updated_at    TEXT NOT NULL
);
INSERT INTO projection_state (name, last_event_id, updated_at) VALUES
  ('tasks_current', 8, '2026-01-01T12:00:00Z'),
  ('dependencies', 8, '2026-01-01T12:00:00Z'),
  ('tags', 8, '2026-01-01T12:00:00Z');

-- Tasks current projection
CREATE TABLE IF NOT EXISTS tasks_current (
    task_id            TEXT PRIMARY KEY,
    title              TEXT NOT NULL,
    project            TEXT NOT NULL,
    status             TEXT NOT NULL,
    parent_id          TEXT,
    description        TEXT,
    links              TEXT NOT NULL DEFAULT '[]',
    tags               TEXT NOT NULL DEFAULT '[]',
    priority           INTEGER NOT NULL DEFAULT 0,
    due_at             TEXT,
    metadata           TEXT NOT NULL DEFAULT '{}',
    claimed_at         TEXT,
    claimed_by_author  TEXT,
    claimed_by_agent_id TEXT,
    lease_until        TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    last_event_id      INTEGER NOT NULL
);

INSERT INTO tasks_current (task_id, title, project, status, links, tags, priority, metadata, created_at, updated_at, last_event_id) VALUES
  ('TASK001', 'Setup project', 'onboarding', 'done', '[]', '[]', 2, '{}', '2026-01-01T10:00:00Z', '2026-01-01T12:00:00Z', 8),
  ('TASK002', 'Write documentation', 'onboarding', 'backlog', '[]', '[]', 0, '{}', '2026-01-01T10:10:00Z', '2026-01-01T10:10:00Z', 3),
  ('TASK003', 'Code review', 'onboarding', 'backlog', '[]', '["review","important"]', 0, '{}', '2026-01-01T10:15:00Z', '2026-01-01T10:15:00Z', 4);

-- Task dependencies
CREATE TABLE IF NOT EXISTS task_dependencies (
    task_id        TEXT NOT NULL,
    depends_on_id  TEXT NOT NULL,
    PRIMARY KEY (task_id, depends_on_id)
);
INSERT INTO task_dependencies (task_id, depends_on_id) VALUES ('TASK002', 'TASK001');

-- Task tags
CREATE TABLE IF NOT EXISTS task_tags (
    task_id TEXT NOT NULL,
    tag     TEXT NOT NULL,
    PRIMARY KEY (task_id, tag)
);
INSERT INTO task_tags (task_id, tag) VALUES ('TASK003', 'review'), ('TASK003', 'important');

-- Task comments
CREATE TABLE IF NOT EXISTS task_comments (
    event_rowid INTEGER PRIMARY KEY,
    task_id     TEXT NOT NULL,
    author      TEXT,
    agent_id    TEXT,
    text        TEXT NOT NULL,
    timestamp   TEXT NOT NULL
);
INSERT INTO task_comments (event_rowid, task_id, author, agent_id, text, timestamp) VALUES
  (6, 'TASK001', 'agent-1', 'AGENT001', 'Starting work on this', '2026-01-01T11:01:00Z');

-- Task checkpoints
CREATE TABLE IF NOT EXISTS task_checkpoints (
    event_rowid INTEGER PRIMARY KEY,
    task_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    data        TEXT NOT NULL DEFAULT '{}',
    timestamp   TEXT NOT NULL
);
INSERT INTO task_checkpoints (event_rowid, task_id, name, data, timestamp) VALUES
  (7, 'TASK001', 'step1', '{"progress":50}', '2026-01-01T11:30:00Z');

-- FTS5 search table
CREATE VIRTUAL TABLE IF NOT EXISTS task_search USING fts5(task_id UNINDEXED, title, description);
INSERT INTO task_search (task_id, title, description) VALUES
  ('TASK001', 'Setup project', ''),
  ('TASK002', 'Write documentation', ''),
  ('TASK003', 'Code review', '');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_task_id ON events(task_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_tasks_current_project_status ON tasks_current(project, status);
CREATE INDEX IF NOT EXISTS idx_deps_depends_on ON task_dependencies(depends_on_id);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags(tag, task_id);
```

**Step 3: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/hzl-core/src/__tests__/migrations/
git commit -m "test(core): add migration upgrade tests with v1 fixtures"
```

---

### Task 38: Import/Export Idempotency Tests + Backup/Restore Round-Trip Tests ✅

Status: ✅

**Files:**
- Create: `packages/hzl-core/src/__tests__/backup/backup-restore.test.ts`
- Create: `packages/hzl-core/src/__tests__/backup/import-export.test.ts`

**Step 1: Write the failing test for backup/restore**

```typescript
// packages/hzl-core/src/__tests__/backup/backup-restore.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createConnection } from '../../db/connection.js';
import { EventStore } from '../../events/store.js';
import { ProjectionEngine } from '../../projections/engine.js';
import { TasksCurrentProjector } from '../../projections/tasks-current.js';
import { DependenciesProjector } from '../../projections/dependencies.js';
import { TagsProjector } from '../../projections/tags.js';
import { SearchProjector } from '../../projections/search.js';
import { CommentsCheckpointsProjector } from '../../projections/comments-checkpoints.js';
import { TaskService } from '../../services/task-service.js';
import { BackupService } from '../../services/backup-service.js';
import { TaskStatus } from '../../events/types.js';
import Database from 'better-sqlite3';

describe('Backup/Restore Round-Trip Tests', () => {
  let tempDir: string;
  let dbPath: string;
  let backupPath: string;
  let db: Database.Database;
  let taskService: TaskService;
  let backupService: BackupService;

  function setupServices(database: Database.Database): { taskService: TaskService; backupService: BackupService } {
    const eventStore = new EventStore(database);
    const engine = new ProjectionEngine(database);
    engine.register(new TasksCurrentProjector());
    engine.register(new DependenciesProjector());
    engine.register(new TagsProjector());
    engine.register(new SearchProjector());
    engine.register(new CommentsCheckpointsProjector());
    return {
      taskService: new TaskService(database, eventStore, engine),
      backupService: new BackupService(database),
    };
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-backup-'));
    dbPath = path.join(tempDir, 'test.db');
    backupPath = path.join(tempDir, 'backup.db');
    db = createConnection(dbPath);
    const services = setupServices(db);
    taskService = services.taskService;
    backupService = services.backupService;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('backup', () => {
    it('creates a complete backup of the database', async () => {
      // Create sample data
      const task1 = taskService.createTask({ title: 'Task 1', project: 'inbox', tags: ['urgent'] });
      const task2 = taskService.createTask({ title: 'Task 2', project: 'inbox', depends_on: [task1.task_id] });
      taskService.setStatus(task1.task_id, TaskStatus.Ready);
      taskService.claimTask(task1.task_id, { author: 'agent-1' });
      taskService.addComment(task1.task_id, 'Working on it');
      taskService.addCheckpoint(task1.task_id, 'step1', { progress: 50 });

      // Perform backup
      await backupService.backup(backupPath);

      // Verify backup file exists
      expect(fs.existsSync(backupPath)).toBe(true);

      // Verify backup is a valid SQLite database
      const backupDb = new Database(backupPath, { readonly: true });
      const tables = backupDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[];
      expect(tables.map((t) => t.name)).toContain('events');
      expect(tables.map((t) => t.name)).toContain('tasks_current');
      backupDb.close();
    });

    it('backup is consistent (no partial writes)', async () => {
      // Create substantial data
      for (let i = 0; i < 100; i++) {
        taskService.createTask({ title: `Task ${i}`, project: 'inbox' });
      }

      await backupService.backup(backupPath);

      const backupDb = new Database(backupPath, { readonly: true });
      const eventCount = backupDb.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
      const taskCount = backupDb.prepare('SELECT COUNT(*) as count FROM tasks_current').get() as { count: number };

      // Event count should match task count (one task_created event per task)
      expect(eventCount.count).toBe(100);
      expect(taskCount.count).toBe(100);
      backupDb.close();
    });
  });

  describe('restore', () => {
    it('restores database to exact state from backup', async () => {
      // Create initial data
      const task1 = taskService.createTask({ title: 'Original task', project: 'inbox' });
      taskService.setStatus(task1.task_id, TaskStatus.Ready);
      taskService.addComment(task1.task_id, 'Original comment');

      // Create backup
      await backupService.backup(backupPath);

      // Modify database after backup
      taskService.createTask({ title: 'New task after backup', project: 'inbox' });
      taskService.completeTask(task1.task_id);

      // Close and delete original
      db.close();
      fs.unlinkSync(dbPath);

      // Restore from backup
      await backupService.restore(backupPath, dbPath);

      // Reopen and verify state matches backup
      const restoredDb = createConnection(dbPath);
      const restoredServices = setupServices(restoredDb);

      // Should have only original task
      const tasks = restoredDb
        .prepare('SELECT * FROM tasks_current')
        .all() as any[];
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Original task');
      expect(tasks[0].status).toBe('ready'); // Not 'done'

      // New task should not exist
      const newTaskCount = restoredDb
        .prepare("SELECT COUNT(*) as count FROM tasks_current WHERE title = 'New task after backup'")
        .get() as { count: number };
      expect(newTaskCount.count).toBe(0);

      restoredDb.close();
    });

    it('restore fails gracefully with invalid backup file', async () => {
      // Create invalid backup file
      const invalidBackupPath = path.join(tempDir, 'invalid.db');
      fs.writeFileSync(invalidBackupPath, 'not a valid sqlite database');

      await expect(backupService.restore(invalidBackupPath, dbPath)).rejects.toThrow();
    });

    it('restore fails gracefully with non-existent backup file', async () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.db');
      await expect(backupService.restore(nonExistentPath, dbPath)).rejects.toThrow();
    });
  });

  describe('round-trip integrity', () => {
    it('preserves all data types through backup/restore cycle', async () => {
      // Create data with all field types
      const task = taskService.createTask({
        title: 'Complex task',
        project: 'test-project',
        description: 'A detailed description with special chars: "quotes" & <brackets>',
        tags: ['tag1', 'tag2', 'tag-with-dash'],
        priority: 3,
        due_at: '2026-12-31T23:59:59Z',
        metadata: { key1: 'value1', nested: { a: 1, b: [1, 2, 3] } },
        links: ['https://example.com', '/path/to/file.md'],
      });

      // Add relationships and annotations
      const dep = taskService.createTask({ title: 'Dependency', project: 'test-project' });
      taskService.setStatus(dep.task_id, TaskStatus.Ready);
      taskService.claimTask(dep.task_id, { author: 'agent', lease_until: '2026-02-01T00:00:00Z' });
      taskService.addComment(task.task_id, 'Comment with unicode: 你好世界 🎉');
      taskService.addCheckpoint(task.task_id, 'checkpoint1', { data: { complex: true } });

      // Backup
      await backupService.backup(backupPath);
      db.close();

      // Restore to new location
      const restorePath = path.join(tempDir, 'restored.db');
      await backupService.restore(backupPath, restorePath);

      // Verify all data
      const restoredDb = createConnection(restorePath);

      // Verify task fields
      const restoredTask = restoredDb
        .prepare('SELECT * FROM tasks_current WHERE task_id = ?')
        .get(task.task_id) as any;

      expect(restoredTask.title).toBe('Complex task');
      expect(restoredTask.description).toBe('A detailed description with special chars: "quotes" & <brackets>');
      expect(JSON.parse(restoredTask.tags)).toEqual(['tag1', 'tag2', 'tag-with-dash']);
      expect(restoredTask.priority).toBe(3);
      expect(restoredTask.due_at).toBe('2026-12-31T23:59:59Z');
      expect(JSON.parse(restoredTask.metadata)).toEqual({ key1: 'value1', nested: { a: 1, b: [1, 2, 3] } });
      expect(JSON.parse(restoredTask.links)).toEqual(['https://example.com', '/path/to/file.md']);

      // Verify claim data
      const claimedTask = restoredDb
        .prepare('SELECT * FROM tasks_current WHERE task_id = ?')
        .get(dep.task_id) as any;
      expect(claimedTask.claimed_by_author).toBe('agent');
      expect(claimedTask.lease_until).toBe('2026-02-01T00:00:00Z');

      // Verify comment with unicode
      const comment = restoredDb
        .prepare('SELECT * FROM task_comments WHERE task_id = ?')
        .get(task.task_id) as any;
      expect(comment.text).toBe('Comment with unicode: 你好世界 🎉');

      // Verify checkpoint
      const checkpoint = restoredDb
        .prepare('SELECT * FROM task_checkpoints WHERE task_id = ?')
        .get(task.task_id) as any;
      expect(checkpoint.name).toBe('checkpoint1');
      expect(JSON.parse(checkpoint.data)).toEqual({ data: { complex: true } });

      restoredDb.close();
    });

    it('preserves event ordering through backup/restore', async () => {
      // Create events in specific order
      const task = taskService.createTask({ title: 'Task', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });
      taskService.addComment(task.task_id, 'Comment 1');
      taskService.addComment(task.task_id, 'Comment 2');
      taskService.addCheckpoint(task.task_id, 'step1');
      taskService.completeTask(task.task_id);

      // Get original event order
      const originalEvents = db
        .prepare('SELECT event_id, type FROM events ORDER BY id')
        .all() as { event_id: string; type: string }[];

      // Backup and restore
      await backupService.backup(backupPath);
      db.close();

      const restorePath = path.join(tempDir, 'restored.db');
      await backupService.restore(backupPath, restorePath);

      const restoredDb = createConnection(restorePath);
      const restoredEvents = restoredDb
        .prepare('SELECT event_id, type FROM events ORDER BY id')
        .all() as { event_id: string; type: string }[];

      // Events should be in same order with same IDs
      expect(restoredEvents).toEqual(originalEvents);

      restoredDb.close();
    });
  });
});
```

**Step 2: Write the failing test for import/export**

```typescript
// packages/hzl-core/src/__tests__/backup/import-export.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { createConnection } from '../../db/connection.js';
import { EventStore } from '../../events/store.js';
import { ProjectionEngine } from '../../projections/engine.js';
import { TasksCurrentProjector } from '../../projections/tasks-current.js';
import { DependenciesProjector } from '../../projections/dependencies.js';
import { TagsProjector } from '../../projections/tags.js';
import { SearchProjector } from '../../projections/search.js';
import { CommentsCheckpointsProjector } from '../../projections/comments-checkpoints.js';
import { TaskService } from '../../services/task-service.js';
import { BackupService } from '../../services/backup-service.js';
import { TaskStatus } from '../../events/types.js';
import Database from 'better-sqlite3';

async function readJsonlFile(filePath: string): Promise<any[]> {
  const lines: any[] = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) {
      lines.push(JSON.parse(line));
    }
  }
  return lines;
}

describe('Import/Export Idempotency Tests', () => {
  let tempDir: string;
  let dbPath: string;
  let exportPath: string;
  let db: Database.Database;
  let eventStore: EventStore;
  let taskService: TaskService;
  let backupService: BackupService;

  function setupServices(database: Database.Database): { eventStore: EventStore; taskService: TaskService; backupService: BackupService } {
    const eventStore = new EventStore(database);
    const engine = new ProjectionEngine(database);
    engine.register(new TasksCurrentProjector());
    engine.register(new DependenciesProjector());
    engine.register(new TagsProjector());
    engine.register(new SearchProjector());
    engine.register(new CommentsCheckpointsProjector());
    return {
      eventStore,
      taskService: new TaskService(database, eventStore, engine),
      backupService: new BackupService(database),
    };
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-export-'));
    dbPath = path.join(tempDir, 'test.db');
    exportPath = path.join(tempDir, 'events.jsonl');
    db = createConnection(dbPath);
    const services = setupServices(db);
    eventStore = services.eventStore;
    taskService = services.taskService;
    backupService = services.backupService;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('export', () => {
    it('exports all events to JSONL format', async () => {
      // Create sample data
      const task1 = taskService.createTask({ title: 'Task 1', project: 'inbox' });
      taskService.setStatus(task1.task_id, TaskStatus.Ready);
      taskService.addComment(task1.task_id, 'A comment');

      await backupService.exportEvents(exportPath);

      // Verify file exists and is valid JSONL
      expect(fs.existsSync(exportPath)).toBe(true);
      const events = await readJsonlFile(exportPath);

      expect(events.length).toBe(3); // task_created, status_changed, comment_added
      expect(events[0].type).toBe('task_created');
      expect(events[1].type).toBe('status_changed');
      expect(events[2].type).toBe('comment_added');
    });

    it('exports events with all fields preserved', async () => {
      const task = taskService.createTask({
        title: 'Full task',
        project: 'test',
        description: 'Description',
        tags: ['tag1'],
      }, {
        author: 'user-1',
        agent_id: 'AGENT001',
        session_id: 'SESSION001',
        correlation_id: 'CORR001',
      });

      await backupService.exportEvents(exportPath);
      const events = await readJsonlFile(exportPath);

      const taskCreatedEvent = events[0];
      expect(taskCreatedEvent.event_id).toBeDefined();
      expect(taskCreatedEvent.task_id).toBe(task.task_id);
      expect(taskCreatedEvent.type).toBe('task_created');
      expect(taskCreatedEvent.data.title).toBe('Full task');
      expect(taskCreatedEvent.author).toBe('user-1');
      expect(taskCreatedEvent.agent_id).toBe('AGENT001');
      expect(taskCreatedEvent.session_id).toBe('SESSION001');
      expect(taskCreatedEvent.correlation_id).toBe('CORR001');
      expect(taskCreatedEvent.timestamp).toBeDefined();
    });

    it('exports events in chronological order', async () => {
      const task = taskService.createTask({ title: 'Task', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent' });
      taskService.completeTask(task.task_id);

      await backupService.exportEvents(exportPath);
      const events = await readJsonlFile(exportPath);

      // Verify order
      expect(events[0].type).toBe('task_created');
      expect(events[1].type).toBe('status_changed');
      expect(events[1].data.to).toBe('ready');
      expect(events[2].type).toBe('status_changed');
      expect(events[2].data.to).toBe('in_progress');
      expect(events[3].type).toBe('status_changed');
      expect(events[3].data.to).toBe('done');

      // Verify timestamps are increasing
      for (let i = 1; i < events.length; i++) {
        expect(new Date(events[i].timestamp).getTime())
          .toBeGreaterThanOrEqual(new Date(events[i - 1].timestamp).getTime());
      }
    });
  });

  describe('import', () => {
    it('imports events to empty database', async () => {
      // Create and export data
      const task = taskService.createTask({ title: 'Task', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      await backupService.exportEvents(exportPath);
      db.close();

      // Import to new database
      const newDbPath = path.join(tempDir, 'new.db');
      const newDb = createConnection(newDbPath);
      const newServices = setupServices(newDb);

      const result = await newServices.backupService.importEvents(exportPath);

      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);

      // Verify data imported correctly
      const events = newDb.prepare('SELECT * FROM events ORDER BY id').all() as any[];
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('task_created');
      expect(events[1].type).toBe('status_changed');

      newDb.close();
    });

    it('is idempotent - duplicate imports are skipped', async () => {
      // Create and export data
      const task = taskService.createTask({ title: 'Task', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      await backupService.exportEvents(exportPath);
      db.close();

      // Import to new database
      const newDbPath = path.join(tempDir, 'new.db');
      const newDb = createConnection(newDbPath);
      const newServices = setupServices(newDb);

      // First import
      const result1 = await newServices.backupService.importEvents(exportPath);
      expect(result1.imported).toBe(2);
      expect(result1.skipped).toBe(0);

      // Second import (should skip all)
      const result2 = await newServices.backupService.importEvents(exportPath);
      expect(result2.imported).toBe(0);
      expect(result2.skipped).toBe(2);

      // Third import (still idempotent)
      const result3 = await newServices.backupService.importEvents(exportPath);
      expect(result3.imported).toBe(0);
      expect(result3.skipped).toBe(2);

      // Verify no duplicate events
      const eventCount = newDb.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
      expect(eventCount.count).toBe(2);

      newDb.close();
    });

    it('handles partial imports (some events already exist)', async () => {
      // Create initial data
      const task1 = taskService.createTask({ title: 'Task 1', project: 'inbox' });
      await backupService.exportEvents(exportPath);

      // Add more data
      const task2 = taskService.createTask({ title: 'Task 2', project: 'inbox' });
      
      // Export again (now has both tasks)
      const exportPath2 = path.join(tempDir, 'events2.jsonl');
      await backupService.exportEvents(exportPath2);
      db.close();

      // Import to new database with only first export
      const newDbPath = path.join(tempDir, 'new.db');
      const newDb = createConnection(newDbPath);
      const newServices = setupServices(newDb);

      // Import first export
      await newServices.backupService.importEvents(exportPath);

      // Import second export (should add only new events)
      const result = await newServices.backupService.importEvents(exportPath2);
      expect(result.imported).toBe(1); // Only task2's event
      expect(result.skipped).toBe(1); // task1's event already exists

      newDb.close();
    });

    it('handles malformed JSONL gracefully', async () => {
      // Create file with mixed valid/invalid lines
      const malformedPath = path.join(tempDir, 'malformed.jsonl');
      fs.writeFileSync(malformedPath, `
{"event_id":"EVT1","task_id":"TASK1","type":"task_created","data":{"title":"Valid","project":"inbox"},"timestamp":"2026-01-01T00:00:00Z"}
not valid json
{"event_id":"EVT2","task_id":"TASK2","type":"task_created","data":{"title":"Also valid","project":"inbox"},"timestamp":"2026-01-01T00:01:00Z"}
`);

      const result = await backupService.importEvents(malformedPath);

      // Should import valid lines, skip invalid
      expect(result.imported).toBe(2);
      expect(result.errors).toBe(1);
    });
  });

  describe('round-trip integrity', () => {
    it('export then import produces identical event store', async () => {
      // Create comprehensive test data
      const task1 = taskService.createTask({
        title: 'Complex task',
        project: 'test',
        description: 'Description with unicode: 日本語',
        tags: ['tag1', 'tag2'],
        priority: 2,
        metadata: { key: 'value' },
      });
      const task2 = taskService.createTask({
        title: 'Dependent task',
        project: 'test',
        depends_on: [task1.task_id],
      });
      taskService.setStatus(task1.task_id, TaskStatus.Ready);
      taskService.claimTask(task1.task_id, { author: 'agent-1', lease_until: '2026-02-01T00:00:00Z' });
      taskService.addComment(task1.task_id, 'Comment with emoji 🎉');
      taskService.addCheckpoint(task1.task_id, 'step1', { progress: 50 });
      taskService.completeTask(task1.task_id);

      // Export
      await backupService.exportEvents(exportPath);

      // Get original events
      const originalEvents = db
        .prepare('SELECT event_id, task_id, type, data, author, agent_id, timestamp FROM events ORDER BY id')
        .all() as any[];
      db.close();

      // Import to fresh database
      const newDbPath = path.join(tempDir, 'new.db');
      const newDb = createConnection(newDbPath);
      const newServices = setupServices(newDb);
      await newServices.backupService.importEvents(exportPath);

      // Get imported events
      const importedEvents = newDb
        .prepare('SELECT event_id, task_id, type, data, author, agent_id, timestamp FROM events ORDER BY id')
        .all() as any[];

      // Compare event by event
      expect(importedEvents.length).toBe(originalEvents.length);
      for (let i = 0; i < originalEvents.length; i++) {
        expect(importedEvents[i].event_id).toBe(originalEvents[i].event_id);
        expect(importedEvents[i].task_id).toBe(originalEvents[i].task_id);
        expect(importedEvents[i].type).toBe(originalEvents[i].type);
        expect(importedEvents[i].data).toBe(originalEvents[i].data);
        expect(importedEvents[i].author).toBe(originalEvents[i].author);
        expect(importedEvents[i].timestamp).toBe(originalEvents[i].timestamp);
      }

      newDb.close();
    });

    it('rebuilding projections after import produces consistent state', async () => {
      // Create test data
      const task1 = taskService.createTask({ title: 'Task 1', project: 'inbox', tags: ['urgent'] });
      const task2 = taskService.createTask({ title: 'Task 2', project: 'inbox', depends_on: [task1.task_id] });
      taskService.setStatus(task1.task_id, TaskStatus.Ready);
      taskService.claimTask(task1.task_id, { author: 'agent' });
      taskService.addComment(task1.task_id, 'Comment');
      taskService.completeTask(task1.task_id);

      // Get original projection state
      const originalTasks = db.prepare('SELECT * FROM tasks_current ORDER BY task_id').all() as any[];
      const originalDeps = db.prepare('SELECT * FROM task_dependencies ORDER BY task_id').all() as any[];
      const originalTags = db.prepare('SELECT * FROM task_tags ORDER BY task_id, tag').all() as any[];
      const originalComments = db.prepare('SELECT * FROM task_comments ORDER BY event_rowid').all() as any[];

      // Export
      await backupService.exportEvents(exportPath);
      db.close();

      // Import to fresh database
      const newDbPath = path.join(tempDir, 'new.db');
      const newDb = createConnection(newDbPath);
      const newServices = setupServices(newDb);
      await newServices.backupService.importEvents(exportPath);

      // Note: importEvents should rebuild projections automatically
      // If not, call: rebuildAllProjections(newDb, engine)

      // Compare projections
      const importedTasks = newDb.prepare('SELECT * FROM tasks_current ORDER BY task_id').all() as any[];
      const importedDeps = newDb.prepare('SELECT * FROM task_dependencies ORDER BY task_id').all() as any[];
      const importedTags = newDb.prepare('SELECT * FROM task_tags ORDER BY task_id, tag').all() as any[];
      const importedComments = newDb.prepare('SELECT * FROM task_comments ORDER BY event_rowid').all() as any[];

      expect(importedTasks.length).toBe(originalTasks.length);
      expect(importedDeps.length).toBe(originalDeps.length);
      expect(importedTags.length).toBe(originalTags.length);
      expect(importedComments.length).toBe(originalComments.length);

      // Verify task data matches
      for (let i = 0; i < originalTasks.length; i++) {
        expect(importedTasks[i].task_id).toBe(originalTasks[i].task_id);
        expect(importedTasks[i].title).toBe(originalTasks[i].title);
        expect(importedTasks[i].status).toBe(originalTasks[i].status);
        expect(importedTasks[i].tags).toBe(originalTasks[i].tags);
      }

      newDb.close();
    });
  });

  describe('edge cases', () => {
    it('handles empty database export', async () => {
      await backupService.exportEvents(exportPath);

      const events = await readJsonlFile(exportPath);
      expect(events).toHaveLength(0);
    });

    it('handles very large event data', async () => {
      // Create task with large metadata
      const largeMetadata: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        largeMetadata[`key${i}`] = 'x'.repeat(100);
      }
      const task = taskService.createTask({
        title: 'Large task',
        project: 'inbox',
        metadata: largeMetadata,
      });

      await backupService.exportEvents(exportPath);
      db.close();

      // Import to new database
      const newDbPath = path.join(tempDir, 'new.db');
      const newDb = createConnection(newDbPath);
      const newServices = setupServices(newDb);
      const result = await newServices.backupService.importEvents(exportPath);

      expect(result.imported).toBe(1);

      // Verify large metadata preserved
      const importedTask = newDb
        .prepare('SELECT * FROM tasks_current WHERE task_id = ?')
        .get(task.task_id) as any;
      const importedMetadata = JSON.parse(importedTask.metadata);
      expect(Object.keys(importedMetadata).length).toBe(1000);

      newDb.close();
    });

    it('handles special characters in event data', async () => {
      const task = taskService.createTask({
        title: 'Task with "quotes" and \\backslashes\\ and \nnewlines',
        project: 'inbox',
        description: 'Unicode: 你好 🌍 العربية',
      });
      taskService.addComment(task.task_id, 'Comment with\ttabs\nand\r\nwindows newlines');

      await backupService.exportEvents(exportPath);
      db.close();

      const newDbPath = path.join(tempDir, 'new.db');
      const newDb = createConnection(newDbPath);
      const newServices = setupServices(newDb);
      await newServices.backupService.importEvents(exportPath);

      const importedTask = newDb
        .prepare('SELECT * FROM tasks_current WHERE task_id = ?')
        .get(task.task_id) as any;
      expect(importedTask.title).toBe('Task with "quotes" and \\backslashes\\ and \nnewlines');
      expect(importedTask.description).toBe('Unicode: 你好 🌍 العربية');

      newDb.close();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL (BackupService methods not implemented)

**Step 3: Implementation note**

These tests drive the implementation of BackupService. Run after implementing Task 32.

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/__tests__/backup/
git commit -m "test(core): add import/export idempotency and backup/restore round-trip tests"
```

---

### Task 39: Projection Rebuild Equivalence Tests ✅

**Files:**
- Create: `packages/hzl-core/src/__tests__/projections/rebuild-equivalence.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/__tests__/projections/rebuild-equivalence.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createConnection } from '../../db/connection.js';
import { EventStore } from '../../events/store.js';
import { ProjectionEngine } from '../../projections/engine.js';
import { TasksCurrentProjector } from '../../projections/tasks-current.js';
import { DependenciesProjector } from '../../projections/dependencies.js';
import { TagsProjector } from '../../projections/tags.js';
import { SearchProjector } from '../../projections/search.js';
import { CommentsCheckpointsProjector } from '../../projections/comments-checkpoints.js';
import { rebuildAllProjections } from '../../projections/rebuild.js';
import { TaskService } from '../../services/task-service.js';
import { TaskStatus } from '../../events/types.js';

describe('Projection Rebuild Equivalence Tests', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;
  let eventStore: EventStore;
  let projectionEngine: ProjectionEngine;
  let taskService: TaskService;

  function setupProjectors(engine: ProjectionEngine): void {
    engine.register(new TasksCurrentProjector());
    engine.register(new DependenciesProjector());
    engine.register(new TagsProjector());
    engine.register(new SearchProjector());
    engine.register(new CommentsCheckpointsProjector());
  }

  function captureProjectionState(database: Database.Database): {
    tasks: any[];
    dependencies: any[];
    tags: any[];
    comments: any[];
    checkpoints: any[];
    search: any[];
  } {
    return {
      tasks: database.prepare('SELECT * FROM tasks_current ORDER BY task_id').all(),
      dependencies: database.prepare('SELECT * FROM task_dependencies ORDER BY task_id, depends_on_id').all(),
      tags: database.prepare('SELECT * FROM task_tags ORDER BY task_id, tag').all(),
      comments: database.prepare('SELECT * FROM task_comments ORDER BY event_rowid').all(),
      checkpoints: database.prepare('SELECT * FROM task_checkpoints ORDER BY event_rowid').all(),
      search: database.prepare('SELECT task_id, title, description FROM task_search ORDER BY task_id').all(),
    };
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-rebuild-'));
    dbPath = path.join(tempDir, 'test.db');
    db = createConnection(dbPath);
    eventStore = new EventStore(db);
    projectionEngine = new ProjectionEngine(db);
    setupProjectors(projectionEngine);
    taskService = new TaskService(db, eventStore, projectionEngine);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('incremental vs full rebuild equivalence', () => {
    it('full rebuild produces identical state to incremental application', () => {
      // Build up state incrementally (normal operation)
      const task1 = taskService.createTask({
        title: 'Task 1',
        project: 'inbox',
        tags: ['urgent', 'backend'],
        priority: 2,
      });
      const task2 = taskService.createTask({
        title: 'Task 2',
        project: 'inbox',
        depends_on: [task1.task_id],
      });

      taskService.setStatus(task1.task_id, TaskStatus.Ready);
      taskService.claimTask(task1.task_id, { author: 'agent-1', lease_until: '2026-02-01T00:00:00Z' });
      taskService.addComment(task1.task_id, 'Working on it');
      taskService.addCheckpoint(task1.task_id, 'step1', { progress: 50 });
      taskService.completeTask(task1.task_id);

      taskService.setStatus(task2.task_id, TaskStatus.Ready);
      taskService.claimTask(task2.task_id, { author: 'agent-2' });

      // Capture incremental state
      const incrementalState = captureProjectionState(db);

      // Clear all projections
      db.exec('DELETE FROM tasks_current');
      db.exec('DELETE FROM task_dependencies');
      db.exec('DELETE FROM task_tags');
      db.exec('DELETE FROM task_comments');
      db.exec('DELETE FROM task_checkpoints');
      db.exec('DELETE FROM task_search');
      db.exec('DELETE FROM projection_state');

      // Rebuild from events
      rebuildAllProjections(db, projectionEngine);

      // Capture rebuilt state
      const rebuiltState = captureProjectionState(db);

      // Compare states
      expect(rebuiltState.tasks).toEqual(incrementalState.tasks);
      expect(rebuiltState.dependencies).toEqual(incrementalState.dependencies);
      expect(rebuiltState.tags).toEqual(incrementalState.tags);
      expect(rebuiltState.comments).toEqual(incrementalState.comments);
      expect(rebuiltState.checkpoints).toEqual(incrementalState.checkpoints);
      expect(rebuiltState.search).toEqual(incrementalState.search);
    });

    it('handles complex event sequences correctly', () => {
      // Create many tasks with various operations
      const tasks: string[] = [];
      for (let i = 0; i < 10; i++) {
        const task = taskService.createTask({
          title: `Task ${i}`,
          project: i % 2 === 0 ? 'project-a' : 'project-b',
          tags: [`tag${i % 3}`],
          priority: i % 4,
        });
        tasks.push(task.task_id);
      }

      // Add dependencies (create a chain)
      for (let i = 1; i < tasks.length; i++) {
        // Task i depends on task i-1
        db.prepare('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)').run(tasks[i], tasks[i - 1]);
      }

      // Various operations
      taskService.setStatus(tasks[0], TaskStatus.Ready);
      taskService.claimTask(tasks[0], { author: 'agent-1' });
      taskService.addComment(tasks[0], 'Comment 1');
      taskService.addComment(tasks[0], 'Comment 2');
      taskService.addCheckpoint(tasks[0], 'checkpoint1');
      taskService.completeTask(tasks[0]);

      taskService.setStatus(tasks[1], TaskStatus.Ready);
      taskService.claimTask(tasks[1], { author: 'agent-2' });
      taskService.releaseTask(tasks[1], { reason: 'Blocked' });
      taskService.claimTask(tasks[1], { author: 'agent-3' });

      // Archive a task
      taskService.archiveTask(tasks[5], { reason: 'No longer needed' });

      // Capture state
      const originalState = captureProjectionState(db);

      // Rebuild
      db.exec('DELETE FROM tasks_current');
      db.exec('DELETE FROM task_dependencies');
      db.exec('DELETE FROM task_tags');
      db.exec('DELETE FROM task_comments');
      db.exec('DELETE FROM task_checkpoints');
      db.exec('DELETE FROM task_search');
      db.exec('DELETE FROM projection_state');
      rebuildAllProjections(db, projectionEngine);

      const rebuiltState = captureProjectionState(db);

      expect(rebuiltState.tasks).toEqual(originalState.tasks);
      expect(rebuiltState.comments).toEqual(originalState.comments);
      expect(rebuiltState.checkpoints).toEqual(originalState.checkpoints);
    });
  });

  describe('partial corruption recovery', () => {
    it('recovers from corrupted tasks_current projection', () => {
      // Create valid state
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      // Corrupt tasks_current
      db.exec('DELETE FROM tasks_current');

      // Verify corrupted
      const corruptedCount = db.prepare('SELECT COUNT(*) as count FROM tasks_current').get() as { count: number };
      expect(corruptedCount.count).toBe(0);

      // Rebuild
      rebuildAllProjections(db, projectionEngine);

      // Verify recovered
      const recoveredTask = db.prepare('SELECT * FROM tasks_current WHERE task_id = ?').get(task.task_id) as any;
      expect(recoveredTask).toBeDefined();
      expect(recoveredTask.status).toBe('ready');
    });

    it('recovers from corrupted dependencies projection', () => {
      const task1 = taskService.createTask({ title: 'Task 1', project: 'inbox' });
      const task2 = taskService.createTask({ title: 'Task 2', project: 'inbox', depends_on: [task1.task_id] });

      // Corrupt dependencies
      db.exec('DELETE FROM task_dependencies');

      // Rebuild
      rebuildAllProjections(db, projectionEngine);

      // Verify recovered
      const dep = db.prepare('SELECT * FROM task_dependencies WHERE task_id = ?').get(task2.task_id);
      expect(dep).toBeDefined();
    });

    it('recovers from corrupted tags projection', () => {
      const task = taskService.createTask({ title: 'Tagged', project: 'inbox', tags: ['tag1', 'tag2'] });

      // Corrupt tags
      db.exec('DELETE FROM task_tags');

      // Rebuild
      rebuildAllProjections(db, projectionEngine);

      // Verify recovered
      const tags = db.prepare('SELECT tag FROM task_tags WHERE task_id = ? ORDER BY tag').all(task.task_id) as { tag: string }[];
      expect(tags.map(t => t.tag)).toEqual(['tag1', 'tag2']);
    });

    it('recovers from corrupted search index', () => {
      const task = taskService.createTask({
        title: 'Searchable task',
        project: 'inbox',
        description: 'With description',
      });

      // Corrupt search index
      db.exec('DELETE FROM task_search');

      // Rebuild
      rebuildAllProjections(db, projectionEngine);

      // Verify search works
      const results = db.prepare("SELECT task_id FROM task_search WHERE task_search MATCH 'Searchable'").all() as { task_id: string }[];
      expect(results.map(r => r.task_id)).toContain(task.task_id);
    });
  });

  describe('rebuild idempotency', () => {
    it('multiple rebuilds produce identical results', () => {
      // Create state
      const task = taskService.createTask({ title: 'Task', project: 'inbox', tags: ['tag'] });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.addComment(task.task_id, 'Comment');

      // First rebuild
      db.exec('DELETE FROM tasks_current');
      db.exec('DELETE FROM task_tags');
      db.exec('DELETE FROM task_comments');
      db.exec('DELETE FROM projection_state');
      rebuildAllProjections(db, projectionEngine);
      const state1 = captureProjectionState(db);

      // Second rebuild
      db.exec('DELETE FROM tasks_current');
      db.exec('DELETE FROM task_tags');
      db.exec('DELETE FROM task_comments');
      db.exec('DELETE FROM projection_state');
      rebuildAllProjections(db, projectionEngine);
      const state2 = captureProjectionState(db);

      // Third rebuild
      db.exec('DELETE FROM tasks_current');
      db.exec('DELETE FROM task_tags');
      db.exec('DELETE FROM task_comments');
      db.exec('DELETE FROM projection_state');
      rebuildAllProjections(db, projectionEngine);
      const state3 = captureProjectionState(db);

      expect(state1).toEqual(state2);
      expect(state2).toEqual(state3);
    });
  });

  describe('projection_state tracking', () => {
    it('updates projection_state after rebuild', () => {
      taskService.createTask({ title: 'Task', project: 'inbox' });

      // Clear and rebuild
      db.exec('DELETE FROM tasks_current');
      db.exec('DELETE FROM projection_state');
      rebuildAllProjections(db, projectionEngine);

      // Check projection_state
      const states = db.prepare('SELECT * FROM projection_state ORDER BY name').all() as { name: string; last_event_id: number }[];
      expect(states.length).toBeGreaterThan(0);

      // All projectors should have same last_event_id
      const lastEventIds = states.map(s => s.last_event_id);
      const uniqueIds = new Set(lastEventIds);
      expect(uniqueIds.size).toBe(1); // All should match
    });

    it('incremental rebuild from last known position', () => {
      // Create initial state
      const task1 = taskService.createTask({ title: 'Task 1', project: 'inbox' });

      // Record position
      const position1 = db.prepare('SELECT MAX(id) as max_id FROM events').get() as { max_id: number };

      // Add more events
      const task2 = taskService.createTask({ title: 'Task 2', project: 'inbox' });
      taskService.setStatus(task1.task_id, TaskStatus.Ready);

      // Manually set projection_state to simulate partial state
      db.exec('DELETE FROM projection_state');
      db.prepare('INSERT INTO projection_state (name, last_event_id, updated_at) VALUES (?, ?, ?)').run('tasks_current', position1.max_id, new Date().toISOString());

      // Get events since position
      const newEvents = projectionEngine.getEventsSince(position1.max_id, 1000);
      expect(newEvents.length).toBe(2); // task2 created + task1 status changed

      // Apply only new events
      for (const event of newEvents) {
        projectionEngine.applyEvent(event);
      }

      // Verify state is correct
      const task1State = db.prepare('SELECT status FROM tasks_current WHERE task_id = ?').get(task1.task_id) as { status: string };
      expect(task1State.status).toBe('ready');
    });
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/hzl-core/src/__tests__/projections/rebuild-equivalence.test.ts
git commit -m "test(core): add projection rebuild equivalence tests"
```

---

### Task 40: Property-Based Tests ✅

**Files:**
- Create: `packages/hzl-core/src/__tests__/properties/invariants.test.ts`
- Update: `packages/hzl-core/package.json` (add fast-check dependency)

**Step 1: Install fast-check**

Add to `packages/hzl-core/package.json` devDependencies:
```json
"fast-check": "^3.15.0"
```

Run: `npm install`

**Step 2: Write the failing test**

```typescript
// packages/hzl-core/src/__tests__/properties/invariants.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createConnection } from '../../db/connection.js';
import { EventStore } from '../../events/store.js';
import { ProjectionEngine } from '../../projections/engine.js';
import { TasksCurrentProjector } from '../../projections/tasks-current.js';
import { DependenciesProjector } from '../../projections/dependencies.js';
import { TagsProjector } from '../../projections/tags.js';
import { rebuildAllProjections } from '../../projections/rebuild.js';
import { TaskService } from '../../services/task-service.js';
import { ValidationService } from '../../services/validation-service.js';
import { EventType, TaskStatus } from '../../events/types.js';

// Arbitraries for generating test data
const taskTitleArb = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0);
const projectNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-z0-9-]+$/.test(s));
const tagArb = fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-z0-9-]+$/.test(s));
const priorityArb = fc.integer({ min: 0, max: 3 });
const authorArb = fc.string({ minLength: 1, maxLength: 50 });

// Command types for state machine testing
type TaskCommand =
  | { type: 'create'; title: string; project: string; tags: string[]; priority: number }
  | { type: 'setReady'; taskIndex: number }
  | { type: 'claim'; taskIndex: number; author: string }
  | { type: 'complete'; taskIndex: number }
  | { type: 'release'; taskIndex: number }
  | { type: 'archive'; taskIndex: number }
  | { type: 'addDep'; taskIndex: number; depIndex: number };

describe('Property-Based Tests', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;
  let taskService: TaskService;
  let validationService: ValidationService;

  function setupServices(): void {
    db = createConnection(dbPath);
    const eventStore = new EventStore(db);
    const engine = new ProjectionEngine(db);
    engine.register(new TasksCurrentProjector());
    engine.register(new DependenciesProjector());
    engine.register(new TagsProjector());
    taskService = new TaskService(db, eventStore, engine);
    validationService = new ValidationService(db);
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-property-'));
    dbPath = path.join(tempDir, 'test.db');
    setupServices();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('event replay determinism', () => {
    it('replaying same events always produces same state', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              title: taskTitleArb,
              project: projectNameArb,
              tags: fc.array(tagArb, { maxLength: 5 }),
              priority: priorityArb,
            }),
            { minLength: 1, maxLength: 20 }
          ),
          (taskSpecs) => {
            // Create tasks
            const taskIds: string[] = [];
            for (const spec of taskSpecs) {
              try {
                const task = taskService.createTask({
                  title: spec.title,
                  project: spec.project || 'inbox',
                  tags: spec.tags,
                  priority: spec.priority,
                });
                taskIds.push(task.task_id);
              } catch {
                // Skip invalid inputs
              }
            }

            if (taskIds.length === 0) return true;

            // Capture state
            const state1 = db.prepare('SELECT task_id, title, project, status, tags, priority FROM tasks_current ORDER BY task_id').all();

            // Clear projections and rebuild
            db.exec('DELETE FROM tasks_current');
            db.exec('DELETE FROM task_tags');
            db.exec('DELETE FROM projection_state');

            const eventStore = new EventStore(db);
            const engine = new ProjectionEngine(db);
            engine.register(new TasksCurrentProjector());
            engine.register(new TagsProjector());
            rebuildAllProjections(db, engine);

            // Capture rebuilt state
            const state2 = db.prepare('SELECT task_id, title, project, status, tags, priority FROM tasks_current ORDER BY task_id').all();

            // States must be identical
            return JSON.stringify(state1) === JSON.stringify(state2);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('invariant: no duplicate task IDs', () => {
    it('task IDs are always unique', () => {
      fc.assert(
        fc.property(
          fc.array(taskTitleArb, { minLength: 1, maxLength: 50 }),
          (titles) => {
            const taskIds = new Set<string>();
            for (const title of titles) {
              try {
                const task = taskService.createTask({ title, project: 'inbox' });
                if (taskIds.has(task.task_id)) {
                  return false; // Duplicate found!
                }
                taskIds.add(task.task_id);
              } catch {
                // Skip
              }
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('invariant: valid status transitions', () => {
    it('status transitions follow state machine rules', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              fc.constant('create'),
              fc.constant('setReady'),
              fc.constant('claim'),
              fc.constant('complete'),
              fc.constant('release'),
              fc.constant('archive')
            ),
            { minLength: 1, maxLength: 30 }
          ),
          (actions) => {
            const taskIds: string[] = [];
            const taskStates: Map<string, TaskStatus> = new Map();

            for (const action of actions) {
              try {
                switch (action) {
                  case 'create': {
                    const task = taskService.createTask({ title: 'Task', project: 'inbox' });
                    taskIds.push(task.task_id);
                    taskStates.set(task.task_id, TaskStatus.Backlog);
                    break;
                  }
                  case 'setReady': {
                    if (taskIds.length === 0) break;
                    const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                    const currentStatus = taskStates.get(taskId);
                    if (currentStatus === TaskStatus.Backlog) {
                      taskService.setStatus(taskId, TaskStatus.Ready);
                      taskStates.set(taskId, TaskStatus.Ready);
                    }
                    break;
                  }
                  case 'claim': {
                    if (taskIds.length === 0) break;
                    const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                    const currentStatus = taskStates.get(taskId);
                    if (currentStatus === TaskStatus.Ready) {
                      taskService.claimTask(taskId, { author: 'agent' });
                      taskStates.set(taskId, TaskStatus.InProgress);
                    }
                    break;
                  }
                  case 'complete': {
                    if (taskIds.length === 0) break;
                    const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                    const currentStatus = taskStates.get(taskId);
                    if (currentStatus === TaskStatus.InProgress) {
                      taskService.completeTask(taskId);
                      taskStates.set(taskId, TaskStatus.Done);
                    }
                    break;
                  }
                  case 'release': {
                    if (taskIds.length === 0) break;
                    const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                    const currentStatus = taskStates.get(taskId);
                    if (currentStatus === TaskStatus.InProgress) {
                      taskService.releaseTask(taskId);
                      taskStates.set(taskId, TaskStatus.Ready);
                    }
                    break;
                  }
                  case 'archive': {
                    if (taskIds.length === 0) break;
                    const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                    const currentStatus = taskStates.get(taskId);
                    if (currentStatus !== TaskStatus.Archived) {
                      taskService.archiveTask(taskId);
                      taskStates.set(taskId, TaskStatus.Archived);
                    }
                    break;
                  }
                }
              } catch {
                // Invalid transitions should throw, which is expected
              }
            }

            // Verify all tasks have valid statuses
            for (const taskId of taskIds) {
              const task = taskService.getTaskById(taskId);
              if (task) {
                const validStatuses = Object.values(TaskStatus);
                if (!validStatuses.includes(task.status)) {
                  return false;
                }
              }
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('invariant: no dependency cycles', () => {
    it('adding dependencies never creates cycles', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              taskIndex: fc.integer({ min: 0, max: 9 }),
              depIndex: fc.integer({ min: 0, max: 9 }),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          (depAttempts) => {
            // Create 10 tasks
            const taskIds: string[] = [];
            for (let i = 0; i < 10; i++) {
              const task = taskService.createTask({ title: `Task ${i}`, project: 'inbox' });
              taskIds.push(task.task_id);
            }

            // Try to add dependencies
            for (const { taskIndex, depIndex } of depAttempts) {
              if (taskIndex === depIndex) continue; // Skip self-deps
              const taskId = taskIds[taskIndex];
              const depId = taskIds[depIndex];
              try {
                // This should either succeed or throw on cycle
                db.prepare('INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)').run(taskId, depId);
              } catch {
                // Cycle detected (expected)
              }
            }

            // Verify no cycles exist
            const validation = validationService.validate();
            return validation.cycles.length === 0;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('invariant: claim requires ready status', () => {
    it('only ready tasks can be claimed', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              fc.constant('backlog'),
              fc.constant('ready'),
              fc.constant('in_progress'),
              fc.constant('done'),
              fc.constant('archived')
            ),
            { minLength: 1, maxLength: 10 }
          ),
          (statuses) => {
            for (const status of statuses) {
              const task = taskService.createTask({ title: 'Task', project: 'inbox' });

              // Set up task in desired status
              try {
                if (status !== 'backlog') {
                  taskService.setStatus(task.task_id, TaskStatus.Ready);
                }
                if (status === 'in_progress') {
                  taskService.claimTask(task.task_id, { author: 'agent' });
                }
                if (status === 'done') {
                  taskService.setStatus(task.task_id, TaskStatus.Ready);
                  taskService.claimTask(task.task_id, { author: 'agent' });
                  taskService.completeTask(task.task_id);
                }
                if (status === 'archived') {
                  taskService.archiveTask(task.task_id);
                }
              } catch {
                continue;
              }

              // Try to claim
              const canClaim = status === 'ready';
              try {
                taskService.claimTask(task.task_id, { author: 'new-agent' });
                if (!canClaim) {
                  return false; // Should not have been able to claim
                }
              } catch {
                if (canClaim) {
                  return false; // Should have been able to claim
                }
              }
            }
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('invariant: event count matches operations', () => {
    it('event count equals number of successful operations', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          (taskCount) => {
            let operationCount = 0;

            for (let i = 0; i < taskCount; i++) {
              try {
                taskService.createTask({ title: `Task ${i}`, project: 'inbox' });
                operationCount++;
              } catch {
                // Skip
              }
            }

            const eventCount = db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
            return eventCount.count === operationCount;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('invariant: projection consistency', () => {
    it('tasks_current always reflects latest event state', () => {
      fc.assert(
        fc.property(
          fc.array(taskTitleArb, { minLength: 1, maxLength: 20 }),
          (titles) => {
            const taskIds: string[] = [];
            for (const title of titles) {
              try {
                const task = taskService.createTask({ title, project: 'inbox' });
                taskIds.push(task.task_id);
              } catch {
                // Skip
              }
            }

            // Verify each task exists in projection
            for (const taskId of taskIds) {
              const inProjection = db.prepare('SELECT COUNT(*) as count FROM tasks_current WHERE task_id = ?').get(taskId) as { count: number };
              if (inProjection.count !== 1) {
                return false;
              }
            }

            // Verify no orphan projections
            const projectionCount = db.prepare('SELECT COUNT(*) as count FROM tasks_current').get() as { count: number };
            return projectionCount.count === taskIds.length;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
```

**Step 3: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/hzl-core/src/__tests__/properties/
git add packages/hzl-core/package.json
git commit -m "test(core): add property-based tests for invariants and determinism"
```

---

### Task 41: Sample Project Command ✅

**Files:**
- Create: `packages/hzl-cli/src/commands/sample-project.ts`
- Test: `packages/hzl-cli/src/commands/sample-project.test.ts`
- Create: `packages/hzl-core/src/fixtures/sample-data.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-cli/src/commands/sample-project.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runSampleProjectCreate, runSampleProjectReset } from './sample-project.js';
import { createConnection } from 'hzl-core';

describe('sample-project command', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-sample-'));
    dbPath = path.join(tempDir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('creates sample project with tasks in various states', async () => {
      const result = await runSampleProjectCreate({ dbPath, json: false });

      expect(result.project).toBe('sample-project');
      expect(result.tasksCreated).toBeGreaterThan(0);

      // Verify tasks exist
      const db = createConnection(dbPath);
      const tasks = db.prepare("SELECT * FROM tasks_current WHERE project = 'sample-project'").all() as any[];
      expect(tasks.length).toBeGreaterThan(0);

      // Verify variety of statuses
      const statuses = new Set(tasks.map((t) => t.status));
      expect(statuses.size).toBeGreaterThan(1);

      db.close();
    });

    it('creates tasks with dependencies', async () => {
      await runSampleProjectCreate({ dbPath, json: false });

      const db = createConnection(dbPath);
      const deps = db.prepare('SELECT * FROM task_dependencies').all();
      expect(deps.length).toBeGreaterThan(0);
      db.close();
    });

    it('creates tasks with tags and comments', async () => {
      await runSampleProjectCreate({ dbPath, json: false });

      const db = createConnection(dbPath);
      const tags = db.prepare('SELECT * FROM task_tags').all();
      const comments = db.prepare('SELECT * FROM task_comments').all();

      expect(tags.length).toBeGreaterThan(0);
      expect(comments.length).toBeGreaterThan(0);
      db.close();
    });

    it('is idempotent (does not duplicate on second run)', async () => {
      await runSampleProjectCreate({ dbPath, json: false });
      const result2 = await runSampleProjectCreate({ dbPath, json: false });

      expect(result2.skipped).toBe(true);

      const db = createConnection(dbPath);
      const taskCount = db.prepare("SELECT COUNT(*) as count FROM tasks_current WHERE project = 'sample-project'").get() as { count: number };
      // Should not have doubled
      expect(taskCount.count).toBeLessThan(100);
      db.close();
    });

    it('returns JSON output when requested', async () => {
      const result = await runSampleProjectCreate({ dbPath, json: true });
      expect(typeof result.project).toBe('string');
      expect(typeof result.tasksCreated).toBe('number');
    });
  });

  describe('reset', () => {
    it('deletes and recreates sample project', async () => {
      // Create first
      await runSampleProjectCreate({ dbPath, json: false });

      const db1 = createConnection(dbPath);
      const originalTasks = db1.prepare("SELECT task_id FROM tasks_current WHERE project = 'sample-project'").all() as { task_id: string }[];
      const originalIds = originalTasks.map((t) => t.task_id);
      db1.close();

      // Reset
      const result = await runSampleProjectReset({ dbPath, json: false });
      expect(result.deleted).toBeGreaterThan(0);
      expect(result.created).toBeGreaterThan(0);

      // Verify new task IDs
      const db2 = createConnection(dbPath);
      const newTasks = db2.prepare("SELECT task_id FROM tasks_current WHERE project = 'sample-project'").all() as { task_id: string }[];
      const newIds = newTasks.map((t) => t.task_id);
      db2.close();

      // Should have different IDs (freshly created)
      const overlap = newIds.filter((id) => originalIds.includes(id));
      expect(overlap.length).toBe(0);
    });

    it('handles reset when project does not exist', async () => {
      const result = await runSampleProjectReset({ dbPath, json: false });
      expect(result.deleted).toBe(0);
      expect(result.created).toBeGreaterThan(0);
    });
  });
});
```

**Step 2: Create sample data fixture**

```typescript
// packages/hzl-core/src/fixtures/sample-data.ts
export interface SampleTask {
  title: string;
  description?: string;
  tags?: string[];
  priority?: number;
  depends_on_indices?: number[]; // Indices into the task array
  status?: 'backlog' | 'ready' | 'in_progress' | 'done';
  comments?: string[];
  checkpoints?: { name: string; data?: Record<string, unknown> }[];
}

export const SAMPLE_TASKS: SampleTask[] = [
  // Epic: Authentication
  {
    title: 'Design authentication flow',
    description: 'Create wireframes and flow diagrams for user authentication including login, signup, password reset, and OAuth.',
    tags: ['epic', 'design', 'auth'],
    priority: 3,
    status: 'done',
    comments: ['Completed initial designs', 'Stakeholder approved'],
  },
  {
    title: 'Implement user registration API',
    description: 'POST /api/auth/register endpoint with email verification',
    tags: ['backend', 'auth', 'api'],
    priority: 2,
    depends_on_indices: [0],
    status: 'done',
    checkpoints: [
      { name: 'endpoint-created', data: { method: 'POST', path: '/api/auth/register' } },
      { name: 'tests-passing', data: { coverage: 95 } },
    ],
  },
  {
    title: 'Implement login API',
    description: 'POST /api/auth/login with JWT token generation',
    tags: ['backend', 'auth', 'api'],
    priority: 2,
    depends_on_indices: [0],
    status: 'in_progress',
    comments: ['Working on token refresh logic'],
  },
  {
    title: 'Add OAuth2 Google provider',
    description: 'Enable "Sign in with Google" using OAuth2 flow',
    tags: ['backend', 'auth', 'oauth'],
    priority: 1,
    depends_on_indices: [1, 2],
    status: 'ready',
  },
  {
    title: 'Build login UI component',
    description: 'React component for login form with validation',
    tags: ['frontend', 'auth', 'ui'],
    priority: 2,
    depends_on_indices: [2],
    status: 'ready',
  },

  // Epic: Dashboard
  {
    title: 'Design dashboard layout',
    description: 'Main dashboard with widgets for key metrics',
    tags: ['epic', 'design', 'dashboard'],
    priority: 2,
    status: 'done',
  },
  {
    title: 'Implement dashboard API',
    description: 'GET /api/dashboard endpoint returning aggregated metrics',
    tags: ['backend', 'dashboard', 'api'],
    priority: 2,
    depends_on_indices: [5],
    status: 'ready',
  },
  {
    title: 'Build metrics widget component',
    description: 'Reusable widget showing key metric with trend indicator',
    tags: ['frontend', 'dashboard', 'ui'],
    priority: 1,
    depends_on_indices: [5],
    status: 'backlog',
  },
  {
    title: 'Add real-time updates to dashboard',
    description: 'WebSocket connection for live metric updates',
    tags: ['frontend', 'backend', 'dashboard', 'realtime'],
    priority: 1,
    depends_on_indices: [6, 7],
    status: 'backlog',
  },

  // Epic: Search
  {
    title: 'Design search experience',
    description: 'Search UI/UX including filters, suggestions, and results display',
    tags: ['epic', 'design', 'search'],
    priority: 2,
    status: 'ready',
  },
  {
    title: 'Implement search indexing',
    description: 'Background job to index content for full-text search',
    tags: ['backend', 'search', 'jobs'],
    priority: 2,
    depends_on_indices: [9],
    status: 'backlog',
  },
  {
    title: 'Build search API',
    description: 'GET /api/search with pagination and filters',
    tags: ['backend', 'search', 'api'],
    priority: 2,
    depends_on_indices: [10],
    status: 'backlog',
  },
  {
    title: 'Create search results component',
    description: 'React component displaying search results with highlighting',
    tags: ['frontend', 'search', 'ui'],
    priority: 1,
    depends_on_indices: [9, 11],
    status: 'backlog',
  },

  // Standalone tasks
  {
    title: 'Set up CI/CD pipeline',
    description: 'GitHub Actions workflow for testing, linting, and deployment',
    tags: ['devops', 'ci'],
    priority: 3,
    status: 'done',
  },
  {
    title: 'Configure monitoring and alerting',
    description: 'Set up Datadog/Prometheus for application monitoring',
    tags: ['devops', 'monitoring'],
    priority: 2,
    depends_on_indices: [13],
    status: 'ready',
  },
  {
    title: 'Write API documentation',
    description: 'OpenAPI spec and developer guide',
    tags: ['docs', 'api'],
    priority: 1,
    status: 'backlog',
  },
  {
    title: 'Performance optimization audit',
    description: 'Profile and optimize slow endpoints',
    tags: ['backend', 'performance'],
    priority: 1,
    status: 'backlog',
  },
  {
    title: 'Security audit',
    description: 'Review authentication, authorization, and data protection',
    tags: ['security', 'audit'],
    priority: 3,
    depends_on_indices: [1, 2, 3],
    status: 'backlog',
  },
];

export const SAMPLE_PROJECT_NAME = 'sample-project';
```

**Step 3: Implement sample-project command**

```typescript
// packages/hzl-cli/src/commands/sample-project.ts
import { Command } from 'commander';
import {
  createConnection,
  EventStore,
  ProjectionEngine,
  TasksCurrentProjector,
  DependenciesProjector,
  TagsProjector,
  SearchProjector,
  CommentsCheckpointsProjector,
  TaskService,
  TaskStatus,
  SAMPLE_TASKS,
  SAMPLE_PROJECT_NAME,
} from 'hzl-core';
import { resolveDbPath } from '../config.js';
import { formatOutput, printSuccess } from '../output.js';
import type { GlobalOptions } from '../types.js';

export interface SampleProjectCreateResult {
  project: string;
  tasksCreated: number;
  skipped: boolean;
}

export interface SampleProjectResetResult {
  project: string;
  deleted: number;
  created: number;
}

function setupServices(dbPath: string) {
  const db = createConnection(dbPath);
  const eventStore = new EventStore(db);
  const engine = new ProjectionEngine(db);
  engine.register(new TasksCurrentProjector());
  engine.register(new DependenciesProjector());
  engine.register(new TagsProjector());
  engine.register(new SearchProjector());
  engine.register(new CommentsCheckpointsProjector());
  const taskService = new TaskService(db, eventStore, engine);
  return { db, taskService };
}

export async function runSampleProjectCreate(options: {
  dbPath: string;
  json: boolean;
}): Promise<SampleProjectCreateResult> {
  const { db, taskService } = setupServices(options.dbPath);

  // Check if sample project already exists
  const existingTasks = db
    .prepare(`SELECT COUNT(*) as count FROM tasks_current WHERE project = ?`)
    .get(SAMPLE_PROJECT_NAME) as { count: number };

  if (existingTasks.count > 0) {
    db.close();
    const result: SampleProjectCreateResult = {
      project: SAMPLE_PROJECT_NAME,
      tasksCreated: 0,
      skipped: true,
    };
    if (options.json) {
      console.log(formatOutput(result, true));
    } else {
      printSuccess(`Sample project '${SAMPLE_PROJECT_NAME}' already exists with ${existingTasks.count} tasks. Use 'sample-project reset' to recreate.`);
    }
    return result;
  }

  // Create tasks
  const taskIds: string[] = [];
  for (const spec of SAMPLE_TASKS) {
    const dependsOn = spec.depends_on_indices?.map((i) => taskIds[i]).filter(Boolean) || [];

    const task = taskService.createTask({
      title: spec.title,
      project: SAMPLE_PROJECT_NAME,
      description: spec.description,
      tags: spec.tags,
      priority: spec.priority ?? 0,
      depends_on: dependsOn,
    });
    taskIds.push(task.task_id);

    // Set status if not backlog
    if (spec.status && spec.status !== 'backlog') {
      if (spec.status === 'ready' || spec.status === 'in_progress' || spec.status === 'done') {
        taskService.setStatus(task.task_id, TaskStatus.Ready);
      }
      if (spec.status === 'in_progress' || spec.status === 'done') {
        taskService.claimTask(task.task_id, { author: 'sample-agent' });
      }
      if (spec.status === 'done') {
        taskService.completeTask(task.task_id);
      }
    }

    // Add comments
    if (spec.comments) {
      for (const comment of spec.comments) {
        taskService.addComment(task.task_id, comment, { author: 'sample-user' });
      }
    }

    // Add checkpoints
    if (spec.checkpoints) {
      for (const cp of spec.checkpoints) {
        taskService.addCheckpoint(task.task_id, cp.name, cp.data);
      }
    }
  }

  db.close();

  const result: SampleProjectCreateResult = {
    project: SAMPLE_PROJECT_NAME,
    tasksCreated: taskIds.length,
    skipped: false,
  };

  if (options.json) {
    console.log(formatOutput(result, true));
  } else {
    printSuccess(`Created sample project '${SAMPLE_PROJECT_NAME}' with ${taskIds.length} tasks`);
  }

  return result;
}

export async function runSampleProjectReset(options: {
  dbPath: string;
  json: boolean;
}): Promise<SampleProjectResetResult> {
  const { db, taskService } = setupServices(options.dbPath);

  // Delete existing sample project tasks
  const existingTasks = db
    .prepare(`SELECT task_id FROM tasks_current WHERE project = ?`)
    .all(SAMPLE_PROJECT_NAME) as { task_id: string }[];

  for (const task of existingTasks) {
    taskService.archiveTask(task.task_id);
  }

  // Actually delete the archived tasks (for clean reset)
  db.prepare(`DELETE FROM tasks_current WHERE project = ?`).run(SAMPLE_PROJECT_NAME);
  db.prepare(`DELETE FROM task_tags WHERE task_id IN (SELECT task_id FROM tasks_current WHERE project = ?)`).run(SAMPLE_PROJECT_NAME);

  db.close();

  // Create fresh
  const createResult = await runSampleProjectCreate({ dbPath: options.dbPath, json: false });

  const result: SampleProjectResetResult = {
    project: SAMPLE_PROJECT_NAME,
    deleted: existingTasks.length,
    created: createResult.tasksCreated,
  };

  if (options.json) {
    console.log(formatOutput(result, true));
  } else {
    printSuccess(`Reset sample project: deleted ${result.deleted} tasks, created ${result.created} new tasks`);
  }

  return result;
}

export function createSampleProjectCommand(): Command {
  const cmd = new Command('sample-project')
    .description('Manage sample project for testing and demos');

  cmd
    .command('create')
    .description('Create a sample project with example tasks')
    .action(async function (this: Command) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      await runSampleProjectCreate({
        dbPath: resolveDbPath(globalOpts.db),
        json: globalOpts.json ?? false,
      });
    });

  cmd
    .command('reset')
    .description('Delete and recreate the sample project')
    .action(async function (this: Command) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      await runSampleProjectReset({
        dbPath: resolveDbPath(globalOpts.db),
        json: globalOpts.json ?? false,
      });
    });

  return cmd;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-cli && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/commands/sample-project.ts packages/hzl-cli/src/commands/sample-project.test.ts
git add packages/hzl-core/src/fixtures/
git commit -m "feat(cli): add sample-project create/reset commands for testing and demos"
```

---

## Phase 7: CI/CD & Release

### Task 42: GitHub Actions CI Workflow ✅

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`

**Step 1: Write the CI workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-and-typecheck:
    name: Lint & Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run typecheck
        run: npm run typecheck

      - name: Run lint
        run: npm run lint

      - name: Check formatting
        run: npm run format:check

  test:
    name: Test (${{ matrix.os }}, Node ${{ matrix.node }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: ['20', '22']

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build packages
        run: npm run build

      - name: Run tests
        run: npm run test:ci

      - name: Upload coverage (ubuntu, node 20 only)
        if: matrix.os == 'ubuntu-latest' && matrix.node == '20'
        uses: codecov/codecov-action@v4
        with:
          files: ./packages/hzl-core/coverage/lcov.info,./packages/hzl-cli/coverage/lcov.info
          fail_ci_if_error: false

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint-and-typecheck, test]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build all packages
        run: npm run build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: |
            packages/hzl-core/dist
            packages/hzl-cli/dist
          retention-days: 7
```

**Step 2: Write the release workflow**

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write
  packages: write

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: npm ci

      - name: Build all packages
        run: npm run build

      - name: Run tests
        run: npm run test:ci

      - name: Publish hzl-core to npm
        working-directory: packages/hzl-core
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Publish hzl-cli to npm
        working-directory: packages/hzl-cli
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Generate changelog
        id: changelog
        uses: orhun/git-cliff-action@v3
        with:
          config: cliff.toml
          args: --latest --strip header

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          body: ${{ steps.changelog.outputs.content }}
          draft: false
          prerelease: ${{ contains(github.ref, '-alpha') || contains(github.ref, '-beta') || contains(github.ref, '-rc') }}
```

**Step 3: Create git-cliff configuration for changelog**

```toml
# cliff.toml
[changelog]
header = """
# Changelog\n
All notable changes to this project will be documented in this file.\n
"""
body = """
{% if version %}\
    ## [{{ version | trim_start_matches(pat="v") }}] - {{ timestamp | date(format="%Y-%m-%d") }}
{% else %}\
    ## [unreleased]
{% endif %}\
{% for group, commits in commits | group_by(attribute="group") %}
    ### {{ group | striptags | trim | upper_first }}
    {% for commit in commits %}
        - {% if commit.scope %}*({{ commit.scope }})* {% endif %}\
            {{ commit.message | upper_first }}\
            {% if commit.github.username %} by @{{ commit.github.username }}{%- endif %}\
    {% endfor %}
{% endfor %}\n
"""
footer = ""
trim = true

[git]
conventional_commits = true
filter_unconventional = true
split_commits = false
commit_parsers = [
    { message = "^feat", group = "Features" },
    { message = "^fix", group = "Bug Fixes" },
    { message = "^doc", group = "Documentation" },
    { message = "^perf", group = "Performance" },
    { message = "^refactor", group = "Refactor" },
    { message = "^style", group = "Styling" },
    { message = "^test", group = "Testing" },
    { message = "^chore\\(release\\)", skip = true },
    { message = "^chore", group = "Miscellaneous Tasks" },
    { body = ".*security", group = "Security" },
]
filter_commits = false
tag_pattern = "v[0-9].*"
```

**Step 4: Update package.json scripts for CI**

Add to root `package.json`:
```json
{
  "scripts": {
    "test:ci": "npm run test --workspaces --if-present -- --run --coverage"
  }
}
```

**Step 5: Create dependabot configuration**

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      dev-dependencies:
        patterns:
          - "@types/*"
          - "typescript"
          - "vitest"
          - "eslint*"
          - "prettier"
      production-dependencies:
        patterns:
          - "*"
        exclude-patterns:
          - "@types/*"
          - "typescript"
          - "vitest"
          - "eslint*"
          - "prettier"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "monthly"
```

**Step 6: Commit**

```bash
git add .github/
git add cliff.toml
git commit -m "ci: add GitHub Actions workflows for CI and release"
```

---

### Task 43: Core Library Public API Export ✅

**Files:**
- Create: `packages/hzl-core/src/index.ts`
- Test: `packages/hzl-core/src/index.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-core/src/index.test.ts
import { describe, it, expect } from 'vitest';
import * as hzlCore from './index.js';

describe('hzl-core public API', () => {
  describe('database exports', () => {
    it('exports createConnection', () => {
      expect(hzlCore.createConnection).toBeDefined();
      expect(typeof hzlCore.createConnection).toBe('function');
    });

    it('exports getDefaultDbPath', () => {
      expect(hzlCore.getDefaultDbPath).toBeDefined();
      expect(typeof hzlCore.getDefaultDbPath).toBe('function');
    });

    it('exports withWriteTransaction', () => {
      expect(hzlCore.withWriteTransaction).toBeDefined();
      expect(typeof hzlCore.withWriteTransaction).toBe('function');
    });

    it('exports runMigrations', () => {
      expect(hzlCore.runMigrations).toBeDefined();
      expect(typeof hzlCore.runMigrations).toBe('function');
    });
  });

  describe('event exports', () => {
    it('exports EventStore class', () => {
      expect(hzlCore.EventStore).toBeDefined();
    });

    it('exports EventType enum', () => {
      expect(hzlCore.EventType).toBeDefined();
      expect(hzlCore.EventType.TaskCreated).toBe('task_created');
    });

    it('exports TaskStatus enum', () => {
      expect(hzlCore.TaskStatus).toBeDefined();
      expect(hzlCore.TaskStatus.Ready).toBe('ready');
    });

    it('exports validateEventData', () => {
      expect(hzlCore.validateEventData).toBeDefined();
      expect(typeof hzlCore.validateEventData).toBe('function');
    });
  });

  describe('projection exports', () => {
    it('exports ProjectionEngine class', () => {
      expect(hzlCore.ProjectionEngine).toBeDefined();
    });

    it('exports all projector classes', () => {
      expect(hzlCore.TasksCurrentProjector).toBeDefined();
      expect(hzlCore.DependenciesProjector).toBeDefined();
      expect(hzlCore.TagsProjector).toBeDefined();
      expect(hzlCore.SearchProjector).toBeDefined();
      expect(hzlCore.CommentsCheckpointsProjector).toBeDefined();
    });

    it('exports rebuildAllProjections', () => {
      expect(hzlCore.rebuildAllProjections).toBeDefined();
      expect(typeof hzlCore.rebuildAllProjections).toBe('function');
    });
  });

  describe('service exports', () => {
    it('exports TaskService class', () => {
      expect(hzlCore.TaskService).toBeDefined();
    });

    it('exports ValidationService class', () => {
      expect(hzlCore.ValidationService).toBeDefined();
    });

    it('exports SearchService class', () => {
      expect(hzlCore.SearchService).toBeDefined();
    });

    it('exports BackupService class', () => {
      expect(hzlCore.BackupService).toBeDefined();
    });

    it('exports error classes', () => {
      expect(hzlCore.TaskNotFoundError).toBeDefined();
      expect(hzlCore.TaskNotClaimableError).toBeDefined();
      expect(hzlCore.DependenciesNotDoneError).toBeDefined();
    });
  });

  describe('utility exports', () => {
    it('exports generateId', () => {
      expect(hzlCore.generateId).toBeDefined();
      expect(typeof hzlCore.generateId).toBe('function');
    });

    it('exports isValidId', () => {
      expect(hzlCore.isValidId).toBeDefined();
      expect(typeof hzlCore.isValidId).toBe('function');
    });
  });

  describe('fixture exports', () => {
    it('exports SAMPLE_TASKS', () => {
      expect(hzlCore.SAMPLE_TASKS).toBeDefined();
      expect(Array.isArray(hzlCore.SAMPLE_TASKS)).toBe(true);
    });

    it('exports SAMPLE_PROJECT_NAME', () => {
      expect(hzlCore.SAMPLE_PROJECT_NAME).toBeDefined();
      expect(typeof hzlCore.SAMPLE_PROJECT_NAME).toBe('string');
    });
  });

  describe('type exports', () => {
    // Type exports are verified at compile time, but we can check
    // that the module structure is correct
    it('module has expected export count', () => {
      const exportKeys = Object.keys(hzlCore);
      // Should have a reasonable number of exports (not too few, not too many)
      expect(exportKeys.length).toBeGreaterThan(15);
      expect(exportKeys.length).toBeLessThan(100);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/hzl-core && npm test`
Expected: FAIL (index.ts doesn't export everything yet)

**Step 3: Implement the barrel export**

```typescript
// packages/hzl-core/src/index.ts
/**
 * HZL Core - Task coordination for AI agent swarms
 *
 * This module provides the core business logic for the HZL task management system,
 * including event sourcing, projections, and task coordination services.
 *
 * @packageDocumentation
 */

// ============================================================================
// Database
// ============================================================================

export {
  createConnection,
  getDefaultDbPath,
  withWriteTransaction,
} from './db/connection.js';

export { runMigrations, getCurrentVersion } from './db/migrations.js';

// ============================================================================
// Events
// ============================================================================

export {
  EventStore,
  type AppendEventInput,
  type PersistedEventEnvelope,
  type GetByTaskIdOptions,
} from './events/store.js';

export {
  EventType,
  TaskStatus,
  validateEventData,
  EventSchemas,
  type EventEnvelope,
  type TaskCreatedData,
  type StatusChangedData,
  type CommentAddedData,
  type CheckpointRecordedData,
} from './events/types.js';

// ============================================================================
// Projections
// ============================================================================

export {
  ProjectionEngine,
} from './projections/engine.js';

export {
  type Projector,
  type ProjectionState,
} from './projections/types.js';

export { TasksCurrentProjector } from './projections/tasks-current.js';
export { DependenciesProjector } from './projections/dependencies.js';
export { TagsProjector } from './projections/tags.js';
export { SearchProjector } from './projections/search.js';
export { CommentsCheckpointsProjector } from './projections/comments-checkpoints.js';

export { rebuildAllProjections } from './projections/rebuild.js';

// ============================================================================
// Services
// ============================================================================

export {
  TaskService,
  TaskNotFoundError,
  TaskNotClaimableError,
  DependenciesNotDoneError,
  type CreateTaskInput,
  type EventContext,
  type Task,
  type ClaimTaskOptions,
  type ClaimNextOptions,
  type StealOptions,
  type StealResult,
  type StuckTask,
  type AvailableTask,
  type Comment,
  type Checkpoint,
} from './services/task-service.js';

export {
  ValidationService,
  type CycleNode,
  type MissingDep,
  type ValidationIssue,
  type ValidationResult,
} from './services/validation-service.js';

export {
  SearchService,
  type SearchTaskResult,
  type SearchResult,
  type SearchOptions,
} from './services/search-service.js';

export {
  BackupService,
  type BackupResult,
  type RestoreResult,
  type ExportResult,
  type ImportResult,
} from './services/backup-service.js';

// ============================================================================
// Utilities
// ============================================================================

export { generateId, isValidId } from './utils/id.js';

// ============================================================================
// Fixtures
// ============================================================================

export {
  SAMPLE_TASKS,
  SAMPLE_PROJECT_NAME,
  type SampleTask,
} from './fixtures/sample-data.js';
```

**Step 4: Run test to verify it passes**

Run: `cd packages/hzl-core && npm test`
Expected: PASS

**Step 5: Update package.json exports field**

Update `packages/hzl-core/package.json`:

```json
{
  "name": "hzl-core",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": [
    "dist",
    "README.md"
  ]
}
```

**Step 6: Commit**

```bash
git add packages/hzl-core/src/index.ts packages/hzl-core/src/index.test.ts
git add packages/hzl-core/package.json
git commit -m "feat(core): add public API barrel export with full type definitions"
```

---

### Task 44: CLI Package Configuration ✅

**Files:**
- Update: `packages/hzl-cli/package.json`
- Create: `packages/hzl-cli/src/index.ts`
- Test: `packages/hzl-cli/src/index.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/hzl-cli/src/index.test.ts (update existing)
import { describe, it, expect } from 'vitest';
import * as hzlCli from './index.js';

describe('hzl-cli public API', () => {
  it('exports createProgram', () => {
    expect(hzlCli.createProgram).toBeDefined();
    expect(typeof hzlCli.createProgram).toBe('function');
  });

  it('exports run', () => {
    expect(hzlCli.run).toBeDefined();
    expect(typeof hzlCli.run).toBe('function');
  });

  it('exports CLIError', () => {
    expect(hzlCli.CLIError).toBeDefined();
  });

  it('exports ExitCode', () => {
    expect(hzlCli.ExitCode).toBeDefined();
    expect(hzlCli.ExitCode.Success).toBe(0);
  });

  it('exports config utilities', () => {
    expect(hzlCli.resolveDbPath).toBeDefined();
    expect(hzlCli.loadConfig).toBeDefined();
  });

  it('exports output utilities', () => {
    expect(hzlCli.formatOutput).toBeDefined();
    expect(hzlCli.printSuccess).toBeDefined();
    expect(hzlCli.printError).toBeDefined();
    expect(hzlCli.printTable).toBeDefined();
  });
});
```

**Step 2: Update package.json**

```json
{
  "name": "hzl-cli",
  "version": "0.1.0",
  "description": "CLI for HZL - Task coordination for AI agent swarms",
  "type": "module",
  "bin": {
    "hzl": "dist/cli.js"
  },
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": [
    "dist",
    "README.md"
  ],
  "keywords": [
    "cli",
    "task-management",
    "ai-agents",
    "event-sourcing",
    "sqlite"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/your-org/hzl.git",
    "directory": "packages/hzl-cli"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "hzl-core": "workspace:*",
    "commander": "^12.0.0"
  }
}
```

**Step 3: Commit**

```bash
git add packages/hzl-cli/package.json packages/hzl-cli/src/index.ts packages/hzl-cli/src/index.test.ts
git commit -m "feat(cli): add package configuration for npm publishing"
```

---

### Task 45: Root Package Configuration

**Files:**
- Update: `package.json` (root)
- Create: `README.md` (update)
- Create: `CONTRIBUTING.md`

**Step 1: Update root package.json**

```json
{
  "name": "hzl-workspace",
  "private": true,
  "description": "HZL - Task coordination system for AI agent swarms",
  "workspaces": ["packages/*"],
  "engines": {
    "node": ">=20.0.0"
  },
  "packageManager": "npm@10.0.0",
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "test:ci": "npm run test --workspaces --if-present -- --run --coverage",
    "test:watch": "npm run test --workspaces --if-present -- --watch",
    "typecheck": "tsc -b packages/*/tsconfig.json",
    "lint": "eslint \"packages/*/src/**/*.ts\"",
    "lint:fix": "eslint \"packages/*/src/**/*.ts\" --fix",
    "format": "prettier -w .",
    "format:check": "prettier -c .",
    "clean": "rm -rf packages/*/dist packages/*/.turbo",
    "prepare": "npm run build",
    "version:patch": "npm version patch --workspaces --include-workspace-root",
    "version:minor": "npm version minor --workspaces --include-workspace-root",
    "version:major": "npm version major --workspaces --include-workspace-root"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0",
    "eslint": "^8.56.0",
    "@typescript-eslint/parser": "^6.19.0",
    "@typescript-eslint/eslint-plugin": "^6.19.0",
    "prettier": "^3.2.0"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/your-org/hzl.git"
  },
  "license": "MIT",
  "bugs": {
    "url": "https://github.com/your-org/hzl/issues"
  },
  "homepage": "https://github.com/your-org/hzl#readme"
}
```

**Step 2: Create CONTRIBUTING.md**

```markdown
# Contributing to HZL

Thank you for your interest in contributing to HZL!

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/hzl.git
   cd hzl
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build all packages:
   ```bash
   npm run build
   ```

4. Run tests:
   ```bash
   npm test
   ```

## Project Structure

```
hzl/
├── packages/
│   ├── hzl-core/     # Core business logic, SQLite, events, projections
│   └── hzl-cli/      # CLI wrapper over hzl-core
├── docs/
│   └── plans/        # Implementation plans
└── .github/
    └── workflows/    # CI/CD configuration
```

## Development Workflow

1. Create a feature branch from `main`
2. Make your changes following the existing code style
3. Write tests for new functionality
4. Ensure all tests pass: `npm test`
5. Ensure code is formatted: `npm run format:check`
6. Ensure types are correct: `npm run typecheck`
7. Ensure linting passes: `npm run lint`
8. Submit a pull request

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat(scope): add new feature`
- `fix(scope): fix bug`
- `docs(scope): update documentation`
- `test(scope): add tests`
- `refactor(scope): refactor code`
- `chore(scope): maintenance tasks`

Scopes: `core`, `cli`, `ci`, `docs`

## Testing

- Unit tests: `npm test`
- Watch mode: `npm run test:watch`
- Coverage: `npm run test:ci`

## Code Style

- We use Prettier for formatting
- We use ESLint for linting
- Run `npm run format` to auto-format
- Run `npm run lint:fix` to auto-fix lint issues

## Questions?

Open an issue or start a discussion on GitHub.
```

**Step 3: Commit**

```bash
git add package.json CONTRIBUTING.md
git commit -m "chore: add root package configuration and contributing guide"
```

---

### Phase 7 Summary Table

| Task | Files | Description |
|------|-------|-------------|
| 42 | `.github/workflows/ci.yml`, `release.yml`, `dependabot.yml`, `cliff.toml` | CI/CD workflows, changelog generation, dependency updates |
| 43 | `packages/hzl-core/src/index.ts` | Core library barrel export with full public API |
| 44 | `packages/hzl-cli/package.json`, `src/index.ts` | CLI package configuration for npm publishing |
| 45 | `package.json` (root), `CONTRIBUTING.md` | Root package config and contribution guide |

---

## Future Phase: Web Dashboard (Server + UI)

> **Note:** Deferred. Implement after CLI is stable and battle-tested.

- hzl-server scaffolding (Fastify HTTP server calling hzl-core directly)
- Read API: GET /tasks, GET /tasks/:id, GET /tasks/:id/history, GET /projects, GET /stats, GET /stuck, GET /search
- Write API: POST /tasks, PATCH /tasks/:id, POST /tasks/:id/claim, POST /claim-next, POST /tasks/:id/complete, POST /tasks/:id/release, POST /tasks/:id/steal, POST /tasks/:id/comment, POST /tasks/:id/checkpoint
- Live updates: SSE endpoint for events since last id (GET /events/stream?since=N)
- hzl-web scaffolding (Vite + React) + routing + project switcher
- Kanban board view + filters (tags/status/priority) + "Next up" view
- Task detail panel (history timeline, comments, checkpoints)
- Stuck tasks view + basic analytics dashboard
- Search bar + result list

---

## Appendix: Key Invariants (Enforced by TaskService)

These invariants MUST be tested and MUST hold under concurrent access:

**Status Transitions:**
- `backlog` → `ready` (explicit)
- `ready` → `in_progress` (via claim, requires deps done)
- `in_progress` → `done` (via complete)
- `in_progress` → `ready` (via release, with reason)
- `done` → `ready` or `backlog` (via reopen)
- Any → `archived` (via archive)

**Claim Requirements:**
- Task status MUST be `ready`
- ALL tasks in `depends_on` MUST have status `done`

**Dependency Integrity:**
- No self-dependencies (`task_id != depends_on_id`)
- No cycles (reject at write time via DFS/BFS check)

**Claim-Next Selection Policy:**
1. Filter: status=ready AND all deps done
2. Sort: priority DESC, created_at ASC, task_id ASC (stable tie-break)
3. Select first, claim atomically in same transaction

**Leases:**
- When `--lease` provided, store `lease_until` timestamp
- `steal --if-expired` only succeeds if `lease_until < now` (unless `--force`)
- All checked within single transaction
