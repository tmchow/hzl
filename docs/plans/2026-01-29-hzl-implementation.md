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

### Task 1: Initialize TypeScript Monorepo (Core + CLI)

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

### Task 3: Database Connection Manager & Write Transaction Helper

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

### Task 5: Event Types & Zod Validation Schemas

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

### Task 6: Event Store with Canonical Timestamps & Pagination

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

## Summary: Remaining Tasks (7-40)

### Phase 3: Projections (First-Class Incremental System)

All projections apply events in the same transaction as event writes to ensure immediate consistency.

- **Task 7:** ProjectionEngine + Projector interface + projection_state tracking
- **Task 8:** TasksCurrentProjector (create/status/move/update + claim lease fields)
- **Task 9:** DependenciesProjector (add/remove deps, enforce no self-deps)
- **Task 10:** TagsProjector (task_tags for fast tag filtering)
- **Task 11:** CommentsAndCheckpointsProjector (task_comments + task_checkpoints)
- **Task 12:** SearchProjector (FTS5 task_search for full-text search)
- **Task 13:** Rebuild API: drop projections, replay from events, verify consistency

### Phase 4: Core Services

All writes use BEGIN IMMEDIATE + append event(s) + apply projections in one transaction.

- **Task 14:** TaskService - create task (emit task_created + apply projections atomically)
- **Task 15:** TaskService - claim task (atomic): verify claimable (ready + deps done), emit status_changed(ready→in_progress) with optional lease_until
- **Task 16:** TaskService - claim-next (atomic): select claimable by priority DESC, created_at ASC, task_id ASC, then claim in same transaction
- **Task 17:** TaskService - complete, release, archive, reopen (status transitions with invariants)
- **Task 18:** Lease support: lease_until storage, steal-if-expired (enforced in single transaction), stuck detection helpers
- **Task 19:** Availability checker (all deps done) + tag-aware "next" query helpers
- **Task 20:** Validate API: cycles detection, missing deps check, projection consistency verification
- **Task 21:** TaskService - comments and checkpoints APIs
- **Task 22:** SearchService - full-text search over tasks (title/description)

### Phase 5: CLI (Full Command Surface)

- **Task 23:** CLI framework: global options (--db, --json), config resolution (env vars + ~/.hzl/config.json), error handling
- **Task 24:** init / which-db / projects / rename-project
- **Task 25:** add / list (filters: project/status/parent/tag/available) / next
- **Task 26:** show (current state + recent history + comments + checkpoints) / history (full event history) / update / move
- **Task 27:** claim / claim-next / complete / set-status / release / reopen / archive
- **Task 28:** steal (--if-expired, --force) / stuck (--project, --older-than)
- **Task 29:** add-dep / remove-dep / validate (cycles, missing tasks, invalid states)
- **Task 30:** comment / checkpoint / checkpoints
- **Task 31:** search (full-text search with JSON output)
- **Task 32:** backup / restore / export (--jsonl) / import (idempotent via event_id)
- **Task 33:** doctor (integrity_check + projection consistency) / rebuild / compact
- **Task 34:** stats (durations, throughput derived from events)

### Phase 6: Testing & QA

- **Task 35:** CLI integration tests (real file DB, round-trip commands)
- **Task 36:** Cross-process concurrency stress tests (claim, claim-next, steal-if-expired using child processes)
- **Task 37:** Migration upgrade tests (v1 → v2 fixtures)
- **Task 38:** Import/export idempotency tests + backup/restore round-trip tests
- **Task 39:** Projection rebuild equivalence tests (incremental vs full rebuild)
- **Task 40:** Property-based tests (event replay determinism, invariants hold for all valid event sequences)
- **Task 41:** Sample project command (`hzl sample-project create/reset`)

### Phase 7: CI/CD

- **Task 42:** GitHub Actions workflow (Linux/macOS/Windows matrix, cache native deps, typecheck/lint/test/format)
- **Task 43:** Core library index.ts export (public API surface)

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
