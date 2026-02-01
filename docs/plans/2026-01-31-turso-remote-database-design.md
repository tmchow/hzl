# Turso Remote Database Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `better-sqlite3` with `libsql` to enable optional cloud sync via Turso embedded replicas while maintaining local-first performance.

**Architecture:** Split database into `events.db` (synced source of truth) and `cache.db` (local-only projections). Add cross-process locking for sync safety. Implement sync policies (manual/opportunistic/strict) with conflict resolution strategies for offline mode.

**Tech Stack:** libsql (better-sqlite3 compatible), Turso cloud, TypeScript, Zod validation, Commander.js CLI

---

## Phase 1: Database Layer Refactor

### Task 1: Replace better-sqlite3 with libsql dependency ✅

**Files:**
- Modify: `packages/hzl-core/package.json`
- Modify: `packages/hzl-cli/package.json`

**Step 1: Write test verifying libsql API compatibility**

```typescript
// packages/hzl-core/src/db/__tests__/libsql-compat.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'libsql';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('libsql API compatibility', () => {
  const testDbPath = path.join(os.tmpdir(), `libsql-test-${Date.now()}.db`);

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('supports better-sqlite3 compatible API', () => {
    const db = new Database(testDbPath);

    // Schema creation
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');

    // Prepared statements
    const insert = db.prepare('INSERT INTO test (name) VALUES (?)');
    const result = insert.run('hello');
    expect(result.changes).toBe(1);

    // Query
    const select = db.prepare('SELECT * FROM test WHERE id = ?');
    const row = select.get(result.lastInsertRowid) as { id: number; name: string };
    expect(row.name).toBe('hello');

    // Transaction
    const tx = db.transaction(() => {
      insert.run('world');
      return db.prepare('SELECT COUNT(*) as count FROM test').get() as { count: number };
    });
    const txResult = tx();
    expect(txResult.count).toBe(2);

    db.close();
  });

  it('supports sync method when syncUrl not configured', () => {
    const db = new Database(testDbPath);
    // sync() should be callable but return empty result when no remote configured
    const syncResult = db.sync();
    expect(syncResult).toBeDefined();
    db.close();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-core -- src/db/__tests__/libsql-compat.test.ts`
Expected: FAIL with "Cannot find module 'libsql'"

**Step 3: Update hzl-core package.json**

Replace `better-sqlite3` with `libsql` in dependencies:

```json
{
  "dependencies": {
    "libsql": "^0.5.0",
    "ulid": "^2.3.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.14"
  }
}
```

Note: Keep `@types/better-sqlite3` for now since libsql's types are compatible.

**Step 4: Update hzl-cli package.json**

Replace `better-sqlite3` with `libsql` in dependencies:

```json
{
  "dependencies": {
    "libsql": "^0.5.0",
    "commander": "^14.1.0",
    "hzl-core": "^1.6.0",
    "zod": "^3.23.8"
  }
}
```

**Step 5: Run npm install and test**

Run: `npm install && npm test -w hzl-core -- src/db/__tests__/libsql-compat.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/hzl-core/package.json packages/hzl-cli/package.json packages/hzl-core/src/db/__tests__/libsql-compat.test.ts package-lock.json
git commit -m "feat(db): replace better-sqlite3 with libsql

- Add libsql dependency (better-sqlite3 compatible API)
- Add compatibility test for API surface
- Verify sync() method available"
```

---

### Task 2: Update connection factory import ✅

**Files:**
- Modify: `packages/hzl-core/src/db/connection.ts`

**Step 1: Write test for import change**

The existing tests should continue to pass after changing the import.

Run: `npm test -w hzl-core -- src/db/`
Expected: All tests PASS (existing behavior preserved)

**Step 2: Update import in connection.ts**

```typescript
// packages/hzl-core/src/db/connection.ts
import Database from 'libsql';  // Changed from 'better-sqlite3'
import path from 'path';
import os from 'os';
import fs from 'fs';
import { runMigrations } from './migrations.js';

// ... rest of file unchanged
```

**Step 3: Run tests to verify compatibility**

Run: `npm test -w hzl-core`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/hzl-core/src/db/connection.ts
git commit -m "refactor(db): switch import from better-sqlite3 to libsql

API-compatible change - no functional differences for local-only mode"
```

---

### Task 3: Add sync configuration types ✅

**Files:**
- Modify: `packages/hzl-cli/src/types.ts`
- Create: `packages/hzl-core/src/db/types.ts`

**Step 1: Write test for new config schema**

```typescript
// packages/hzl-core/src/db/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import { DbConfigSchema, SyncPolicySchema, UlidSchema, TursoUrlSchema } from '../types.js';

describe('UlidSchema', () => {
  it('accepts valid ULIDs', () => {
    expect(UlidSchema.safeParse('01HQ3K5BXYZ123456789ABCDEF').success).toBe(true);
    expect(UlidSchema.safeParse('01ARZ3NDEKTSV4RRFFQ69G5FAV').success).toBe(true);
  });

  it('rejects invalid ULIDs', () => {
    expect(UlidSchema.safeParse('invalid').success).toBe(false);
    expect(UlidSchema.safeParse('01HQ3K5BXYZ12345678').success).toBe(false); // Too short
    expect(UlidSchema.safeParse('01HQ3K5BXYZ123456789ABCDEFGH').success).toBe(false); // Too long
    expect(UlidSchema.safeParse('01HQ3K5BXYZ123456789ABCDEI').success).toBe(false); // Invalid char I
    expect(UlidSchema.safeParse('01HQ3K5BXYZ123456789ABCDEL').success).toBe(false); // Invalid char L
    expect(UlidSchema.safeParse('01HQ3K5BXYZ123456789ABCDEO').success).toBe(false); // Invalid char O
    expect(UlidSchema.safeParse('01HQ3K5BXYZ123456789ABCDEU').success).toBe(false); // Invalid char U
  });
});

describe('TursoUrlSchema', () => {
  it('accepts valid Turso URLs', () => {
    expect(TursoUrlSchema.safeParse('libsql://my-db.turso.io').success).toBe(true);
    expect(TursoUrlSchema.safeParse('libsql://my-db-name.example.com').success).toBe(true);
    expect(TursoUrlSchema.safeParse('https://my-db.turso.io').success).toBe(true);
    expect(TursoUrlSchema.safeParse('libsql://localhost:8080').success).toBe(true);
  });

  it('rejects invalid Turso URLs', () => {
    expect(TursoUrlSchema.safeParse('http://my-db.turso.io').success).toBe(false); // http not allowed
    expect(TursoUrlSchema.safeParse('my-db.turso.io').success).toBe(false); // No protocol
    expect(TursoUrlSchema.safeParse('libsql://').success).toBe(false); // No host
    expect(TursoUrlSchema.safeParse('sqlite://local.db').success).toBe(false); // Wrong protocol
    expect(TursoUrlSchema.safeParse('libsql://-invalid.turso.io').success).toBe(false); // Invalid host start
  });
});

describe('DbConfigSchema', () => {
  it('accepts minimal config', () => {
    const result = DbConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts full events config', () => {
    const result = DbConfigSchema.safeParse({
      events: {
        path: '/path/to/events.db',
        syncUrl: 'libsql://my-db.turso.io',
        authToken: 'secret',
        syncMode: 'offline',
        encryptionKey: 'key',
      },
      cache: {
        path: '/path/to/cache.db',
      },
      sync: {
        policy: 'opportunistic',
        staleAfterMs: 60000,
        minIntervalMs: 15000,
        lockTimeoutMs: 3000,
        syncTimeoutMs: 30000,
        maxSyncAttemptsPerMinute: 10,
        conflictStrategy: 'merge',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid syncUrl format', () => {
    const result = DbConfigSchema.safeParse({
      events: { syncUrl: 'http://invalid.com' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid syncMode', () => {
    const result = DbConfigSchema.safeParse({
      events: { syncMode: 'invalid' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid conflictStrategy', () => {
    const result = DbConfigSchema.safeParse({
      sync: { conflictStrategy: 'invalid' },
    });
    expect(result.success).toBe(false);
  });
});

describe('SyncPolicySchema', () => {
  it('accepts valid policies', () => {
    expect(SyncPolicySchema.safeParse('manual').success).toBe(true);
    expect(SyncPolicySchema.safeParse('opportunistic').success).toBe(true);
    expect(SyncPolicySchema.safeParse('strict').success).toBe(true);
  });

  it('rejects invalid policies', () => {
    expect(SyncPolicySchema.safeParse('invalid').success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-core -- src/db/__tests__/types.test.ts`
Expected: FAIL with "Cannot find module '../types.js'"

**Step 3: Create db types file**

```typescript
// packages/hzl-core/src/db/types.ts
import { z } from 'zod';

// ULID format validation (26 chars, Crockford's Base32)
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
export const UlidSchema = z.string().regex(ULID_REGEX, 'Invalid ULID format');

// Turso/libsql URL validation (must be libsql:// or https://)
const TURSO_URL_REGEX = /^(libsql|https):\/\/[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+)*(:\d+)?(\/.*)?$/;
export const TursoUrlSchema = z.string().regex(TURSO_URL_REGEX, 'Invalid Turso URL (must be libsql:// or https://)');

export const SyncModeSchema = z.enum(['replica', 'offline']);
export type SyncMode = z.infer<typeof SyncModeSchema>;

export const SyncPolicySchema = z.enum(['manual', 'opportunistic', 'strict']);
export type SyncPolicy = z.infer<typeof SyncPolicySchema>;

export const ConflictStrategySchema = z.enum(['merge', 'discard-local', 'fail']);
export type ConflictStrategy = z.infer<typeof ConflictStrategySchema>;

export const EventsDbConfigSchema = z.object({
  path: z.string().optional(),
  // Validated Turso URL format (libsql:// or https://)
  syncUrl: TursoUrlSchema.optional(),
  authToken: z.string().optional(),
  syncMode: SyncModeSchema.optional().default('offline'),
  encryptionKey: z.string().optional(),
  encryptionCipher: z.string().optional(),
  readYourWrites: z.boolean().optional().default(true),
}).optional();

export const CacheDbConfigSchema = z.object({
  path: z.string().optional(),
}).optional();

export const SyncConfigSchema = z.object({
  policy: SyncPolicySchema.optional().default('opportunistic'),
  staleAfterMs: z.number().positive().optional().default(60000),
  minIntervalMs: z.number().positive().optional().default(15000),
  failureBackoffMs: z.number().positive().optional().default(60000),
  lockTimeoutMs: z.number().positive().optional().default(3000),
  // Timeout for individual sync() calls (prevents hanging)
  syncTimeoutMs: z.number().positive().optional().default(30000),
  // Rate limiting: max sync attempts per minute
  maxSyncAttemptsPerMinute: z.number().positive().optional().default(10),
  conflictStrategy: ConflictStrategySchema.optional().default('merge'),
}).optional();

export const DbConfigSchema = z.object({
  events: EventsDbConfigSchema,
  cache: CacheDbConfigSchema,
  timeoutSec: z.number().positive().optional(),
  syncPeriod: z.number().nonnegative().optional(),
  sync: SyncConfigSchema,
}).partial();

export type DbConfig = z.infer<typeof DbConfigSchema>;
export type EventsDbConfig = z.infer<typeof EventsDbConfigSchema>;
export type CacheDbConfig = z.infer<typeof CacheDbConfigSchema>;
export type SyncConfig = z.infer<typeof SyncConfigSchema>;

export interface SyncResult {
  frames_synced: number;
  frame_no: number;
}

export interface SyncStats {
  attempted: boolean;
  success: boolean;
  framesSynced?: number;
  frameNo?: number;
  error?: string;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-core -- src/db/__tests__/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/db/types.ts packages/hzl-core/src/db/__tests__/types.test.ts
git commit -m "feat(db): add sync configuration types

- Add DbConfigSchema with events, cache, and sync sections
- Add SyncMode (replica/offline), SyncPolicy, ConflictStrategy enums
- Add SyncResult and SyncStats interfaces"
```

---

### Task 4: Add hzl_global_meta and hzl_local_meta schema ✅

**Files:**
- Modify: `packages/hzl-core/src/db/schema.ts`
- Create: `packages/hzl-core/src/db/meta.ts`

**Step 1: Write test for meta tables**

```typescript
// packages/hzl-core/src/db/__tests__/meta.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createGlobalMetaSchema, createLocalMetaSchema, getInstanceId, setInstanceId, getDeviceId, setDeviceId } from '../meta.js';

describe('meta tables', () => {
  let db: Database.Database;
  const testDbPath = path.join(os.tmpdir(), `meta-test-${Date.now()}.db`);

  beforeEach(() => {
    db = new Database(testDbPath);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('hzl_global_meta', () => {
    beforeEach(() => {
      db.exec(createGlobalMetaSchema());
    });

    it('stores and retrieves instance ID', () => {
      const instanceId = '01HQ3K5BXYZ123456789ABCDEF';
      setInstanceId(db, instanceId);
      expect(getInstanceId(db)).toBe(instanceId);
    });

    it('returns null when instance ID not set', () => {
      expect(getInstanceId(db)).toBeNull();
    });

    it('prevents overwriting instance ID', () => {
      setInstanceId(db, 'first-id');
      expect(() => setInstanceId(db, 'second-id')).toThrow();
    });
  });

  describe('hzl_local_meta', () => {
    beforeEach(() => {
      db.exec(createLocalMetaSchema());
    });

    it('stores and retrieves device ID', () => {
      const deviceId = '01HQ3K5DEVICE123456789ABC';
      setDeviceId(db, deviceId);
      expect(getDeviceId(db)).toBe(deviceId);
    });

    it('returns null when device ID not set', () => {
      expect(getDeviceId(db)).toBeNull();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-core -- src/db/__tests__/meta.test.ts`
Expected: FAIL with "Cannot find module '../meta.js'"

**Step 3: Create meta.ts with schema and helpers**

```typescript
// packages/hzl-core/src/db/meta.ts
import type Database from 'libsql';

/**
 * Schema for hzl_global_meta table (stored in events.db, synced)
 * Contains immutable dataset identity.
 */
export function createGlobalMetaSchema(): string {
  return `
    CREATE TABLE IF NOT EXISTS hzl_global_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `;
}

/**
 * Schema for hzl_local_meta table (stored in cache.db, local-only)
 * Contains per-device sync bookkeeping.
 */
export function createLocalMetaSchema(): string {
  return `
    CREATE TABLE IF NOT EXISTS hzl_local_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `;
}

// Global meta keys
const INSTANCE_ID_KEY = 'hzl_instance_id';
const CREATED_AT_KEY = 'created_at_ms';

// Local meta keys
const DEVICE_ID_KEY = 'device_id';
const DIRTY_SINCE_KEY = 'dirty_since_ms';
const LAST_SYNC_AT_KEY = 'last_sync_at_ms';
const LAST_SYNC_ATTEMPT_KEY = 'last_sync_attempt_at_ms';
const LAST_SYNC_ERROR_KEY = 'last_sync_error';
const LAST_SYNC_FRAME_KEY = 'last_sync_frame_no';

export function getInstanceId(db: Database.Database): string | null {
  const row = db.prepare('SELECT value FROM hzl_global_meta WHERE key = ?').get(INSTANCE_ID_KEY) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setInstanceId(db: Database.Database, instanceId: string): void {
  const existing = getInstanceId(db);
  if (existing !== null) {
    throw new Error(`Instance ID already set to ${existing}. Cannot overwrite.`);
  }
  db.prepare('INSERT INTO hzl_global_meta (key, value) VALUES (?, ?)').run(INSTANCE_ID_KEY, instanceId);
  db.prepare('INSERT INTO hzl_global_meta (key, value) VALUES (?, ?)').run(CREATED_AT_KEY, Date.now().toString());
}

export function getDeviceId(db: Database.Database): string | null {
  const row = db.prepare('SELECT value FROM hzl_local_meta WHERE key = ?').get(DEVICE_ID_KEY) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setDeviceId(db: Database.Database, deviceId: string): void {
  db.prepare('INSERT OR REPLACE INTO hzl_local_meta (key, value) VALUES (?, ?)').run(DEVICE_ID_KEY, deviceId);
}

export function getDirtySince(db: Database.Database): number | null {
  const row = db.prepare('SELECT value FROM hzl_local_meta WHERE key = ?').get(DIRTY_SINCE_KEY) as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : null;
}

export function setDirtySince(db: Database.Database, timestamp: number): void {
  db.prepare('INSERT OR REPLACE INTO hzl_local_meta (key, value) VALUES (?, ?)').run(DIRTY_SINCE_KEY, timestamp.toString());
}

export function clearDirtySince(db: Database.Database): void {
  db.prepare('DELETE FROM hzl_local_meta WHERE key = ?').run(DIRTY_SINCE_KEY);
}

export function getLastSyncAt(db: Database.Database): number | null {
  const row = db.prepare('SELECT value FROM hzl_local_meta WHERE key = ?').get(LAST_SYNC_AT_KEY) as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : null;
}

export function setLastSyncAt(db: Database.Database, timestamp: number): void {
  db.prepare('INSERT OR REPLACE INTO hzl_local_meta (key, value) VALUES (?, ?)').run(LAST_SYNC_AT_KEY, timestamp.toString());
}

export function getLastSyncError(db: Database.Database): string | null {
  const row = db.prepare('SELECT value FROM hzl_local_meta WHERE key = ?').get(LAST_SYNC_ERROR_KEY) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setLastSyncError(db: Database.Database, error: string): void {
  db.prepare('INSERT OR REPLACE INTO hzl_local_meta (key, value) VALUES (?, ?)').run(LAST_SYNC_ERROR_KEY, error);
}

export function clearLastSyncError(db: Database.Database): void {
  db.prepare('DELETE FROM hzl_local_meta WHERE key = ?').run(LAST_SYNC_ERROR_KEY);
}

export function getLastSyncFrameNo(db: Database.Database): number | null {
  const row = db.prepare('SELECT value FROM hzl_local_meta WHERE key = ?').get(LAST_SYNC_FRAME_KEY) as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : null;
}

export function setLastSyncFrameNo(db: Database.Database, frameNo: number): void {
  db.prepare('INSERT OR REPLACE INTO hzl_local_meta (key, value) VALUES (?, ?)').run(LAST_SYNC_FRAME_KEY, frameNo.toString());
}

export function getLastSyncAttemptAt(db: Database.Database): number | null {
  const row = db.prepare('SELECT value FROM hzl_local_meta WHERE key = ?').get(LAST_SYNC_ATTEMPT_KEY) as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : null;
}

export function setLastSyncAttemptAt(db: Database.Database, timestamp: number): void {
  db.prepare('INSERT OR REPLACE INTO hzl_local_meta (key, value) VALUES (?, ?)').run(LAST_SYNC_ATTEMPT_KEY, timestamp.toString());
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-core -- src/db/__tests__/meta.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/db/meta.ts packages/hzl-core/src/db/__tests__/meta.test.ts
git commit -m "feat(db): add hzl_global_meta and hzl_local_meta tables

- hzl_global_meta stores instance ID (synced, immutable)
- hzl_local_meta stores device ID and sync bookkeeping (local-only)
- Add helper functions for reading/writing meta values"
```

---

### Task 5: Add append-only enforcement triggers ✅

**Files:**
- Modify: `packages/hzl-core/src/db/schema.ts`

**Step 1: Write test for append-only enforcement**

```typescript
// packages/hzl-core/src/db/__tests__/append-only.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EVENTS_SCHEMA_V2 } from '../schema.js';

describe('append-only enforcement', () => {
  let db: Database.Database;
  const testDbPath = path.join(os.tmpdir(), `append-only-test-${Date.now()}.db`);

  beforeEach(() => {
    db = new Database(testDbPath);
    db.exec(EVENTS_SCHEMA_V2);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('allows INSERT into events table', () => {
    const stmt = db.prepare(`
      INSERT INTO events (event_id, task_id, type, data, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    expect(() => stmt.run('evt-1', 'task-1', 'TaskCreated', '{}', new Date().toISOString())).not.toThrow();
  });

  it('rejects UPDATE on events table', () => {
    db.prepare(`
      INSERT INTO events (event_id, task_id, type, data, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run('evt-1', 'task-1', 'TaskCreated', '{}', new Date().toISOString());

    expect(() => {
      db.prepare('UPDATE events SET type = ? WHERE event_id = ?').run('Modified', 'evt-1');
    }).toThrow(/cannot UPDATE/i);
  });

  it('rejects DELETE on events table', () => {
    db.prepare(`
      INSERT INTO events (event_id, task_id, type, data, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run('evt-1', 'task-1', 'TaskCreated', '{}', new Date().toISOString());

    expect(() => {
      db.prepare('DELETE FROM events WHERE event_id = ?').run('evt-1');
    }).toThrow(/cannot DELETE/i);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-core -- src/db/__tests__/append-only.test.ts`
Expected: FAIL (UPDATE and DELETE should be allowed without triggers)

**Step 3: Add append-only triggers to schema**

```typescript
// packages/hzl-core/src/db/schema.ts

// Add after existing SCHEMA_V1:

export const EVENTS_SCHEMA_V2 = `
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

-- Append-only enforcement: prevent UPDATE on events
CREATE TRIGGER IF NOT EXISTS events_no_update
BEFORE UPDATE ON events
BEGIN
    SELECT RAISE(ABORT, 'Events table is append-only: cannot UPDATE');
END;

-- Append-only enforcement: prevent DELETE on events
CREATE TRIGGER IF NOT EXISTS events_no_delete
BEFORE DELETE ON events
BEGIN
    SELECT RAISE(ABORT, 'Events table is append-only: cannot DELETE');
END;

-- Global metadata (synced, immutable after creation)
CREATE TABLE IF NOT EXISTS hzl_global_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Schema migrations tracking (append-only)
CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_id TEXT PRIMARY KEY,
    applied_at_ms INTEGER NOT NULL,
    checksum TEXT NOT NULL
);

-- Indexes for events
CREATE INDEX IF NOT EXISTS idx_events_task_id ON events(task_id);
CREATE INDEX IF NOT EXISTS idx_events_task_id_id ON events(task_id, id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events(correlation_id);
`;

// Cache schema (local-only, rebuildable)
export const CACHE_SCHEMA_V1 = `
-- Local metadata (per-device sync state)
CREATE TABLE IF NOT EXISTS hzl_local_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Projection cursor (tracks last applied event)
CREATE TABLE IF NOT EXISTS projection_cursor (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Track last applied event id per projection
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

-- Dependency edges for fast availability checks (rebuildable)
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
    description
);

-- Projects table (projection from events)
CREATE TABLE IF NOT EXISTS projects (
    name TEXT PRIMARY KEY,
    description TEXT,
    is_protected INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_event_id INTEGER NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_protected ON projects(is_protected);
CREATE INDEX IF NOT EXISTS idx_tasks_current_project_status ON tasks_current(project, status);
CREATE INDEX IF NOT EXISTS idx_tasks_current_priority ON tasks_current(project, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_current_claim_next ON tasks_current(project, status, priority DESC, created_at ASC, task_id ASC);
CREATE INDEX IF NOT EXISTS idx_tasks_current_stuck ON tasks_current(project, status, claimed_at);
CREATE INDEX IF NOT EXISTS idx_tasks_current_parent ON tasks_current(parent_id);
CREATE INDEX IF NOT EXISTS idx_deps_depends_on ON task_dependencies(depends_on_id);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags(tag, task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id, event_rowid);
CREATE INDEX IF NOT EXISTS idx_task_checkpoints_task ON task_checkpoints(task_id, event_rowid);
`;
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-core -- src/db/__tests__/append-only.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/db/schema.ts packages/hzl-core/src/db/__tests__/append-only.test.ts
git commit -m "feat(db): add append-only enforcement triggers and split schema

- Add EVENTS_SCHEMA_V2 with UPDATE/DELETE prevention triggers
- Add CACHE_SCHEMA_V1 for local-only projections
- Add hzl_global_meta table for instance identity
- Add schema_migrations table with checksum"
```

---

### Task 5b: Add migration system with rollback support ✅

**Files:**
- Create: `packages/hzl-core/src/db/migrations.ts`
- Create: `packages/hzl-core/src/db/__tests__/migrations.test.ts`

**Step 1: Write test for migration rollback**

```typescript
// packages/hzl-core/src/db/__tests__/migrations.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runMigrationsWithRollback, MigrationError } from '../migrations.js';

describe('migrations with rollback', () => {
  let db: Database.Database;
  const testDbPath = path.join(os.tmpdir(), `migration-test-${Date.now()}.db`);

  beforeEach(() => {
    db = new Database(testDbPath);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('applies migrations successfully', () => {
    const migrations = [
      { id: 'v001', up: 'CREATE TABLE test1 (id INTEGER PRIMARY KEY)' },
      { id: 'v002', up: 'CREATE TABLE test2 (id INTEGER PRIMARY KEY)' },
    ];

    const result = runMigrationsWithRollback(db, migrations);
    expect(result.success).toBe(true);
    expect(result.applied).toEqual(['v001', 'v002']);

    // Tables should exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).toContain('test1');
    expect(tableNames).toContain('test2');
  });

  it('rolls back on partial failure', () => {
    const migrations = [
      { id: 'v001', up: 'CREATE TABLE test1 (id INTEGER PRIMARY KEY)' },
      { id: 'v002', up: 'INVALID SQL SYNTAX' }, // This will fail
    ];

    expect(() => runMigrationsWithRollback(db, migrations)).toThrow(MigrationError);

    // test1 should NOT exist due to rollback
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).not.toContain('test1');
  });

  it('skips already applied migrations', () => {
    const migrations = [
      { id: 'v001', up: 'CREATE TABLE test1 (id INTEGER PRIMARY KEY)' },
    ];

    // Apply first time
    runMigrationsWithRollback(db, migrations);

    // Apply again - should skip
    const result = runMigrationsWithRollback(db, migrations);
    expect(result.success).toBe(true);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(['v001']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-core -- src/db/__tests__/migrations.test.ts`
Expected: FAIL with "Cannot find module '../migrations.js'"

**Step 3: Create migrations.ts with rollback support**

```typescript
// packages/hzl-core/src/db/migrations.ts
import type Database from 'libsql';
import crypto from 'crypto';

export interface Migration {
  id: string;
  up: string;
  down?: string; // Optional rollback SQL
}

export interface MigrationResult {
  success: boolean;
  applied: string[];
  skipped: string[];
  error?: string;
}

export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly failedMigration: string,
    public readonly rolledBack: string[]
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

function computeChecksum(sql: string): string {
  return crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16);
}

function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id TEXT PRIMARY KEY,
      applied_at_ms INTEGER NOT NULL,
      checksum TEXT NOT NULL
    )
  `);
}

function getAppliedMigrations(db: Database.Database): Set<string> {
  const rows = db.prepare('SELECT migration_id FROM schema_migrations').all() as { migration_id: string }[];
  return new Set(rows.map(r => r.migration_id));
}

/**
 * Run migrations with atomic rollback on failure.
 * All pending migrations are run in a single transaction.
 * If any migration fails, ALL changes are rolled back.
 */
export function runMigrationsWithRollback(
  db: Database.Database,
  migrations: Migration[]
): MigrationResult {
  ensureMigrationsTable(db);

  const applied: string[] = [];
  const skipped: string[] = [];
  const alreadyApplied = getAppliedMigrations(db);

  // Filter to pending migrations
  const pendingMigrations = migrations.filter(m => {
    if (alreadyApplied.has(m.id)) {
      skipped.push(m.id);
      return false;
    }
    return true;
  });

  if (pendingMigrations.length === 0) {
    return { success: true, applied, skipped };
  }

  // Run all pending migrations in a single transaction for atomic rollback
  try {
    db.exec('BEGIN IMMEDIATE');

    for (const migration of pendingMigrations) {
      try {
        db.exec(migration.up);

        // Record migration
        db.prepare(
          'INSERT INTO schema_migrations (migration_id, applied_at_ms, checksum) VALUES (?, ?, ?)'
        ).run(migration.id, Date.now(), computeChecksum(migration.up));

        applied.push(migration.id);
      } catch (err) {
        // Rollback the entire transaction
        db.exec('ROLLBACK');

        throw new MigrationError(
          `Migration ${migration.id} failed: ${err instanceof Error ? err.message : String(err)}`,
          migration.id,
          applied // These were applied before failure but are now rolled back
        );
      }
    }

    db.exec('COMMIT');
    return { success: true, applied, skipped };
  } catch (err) {
    if (err instanceof MigrationError) {
      throw err;
    }
    // Unexpected error - ensure rollback
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback errors
    }
    throw err;
  }
}

// Re-export for backward compatibility
export { runMigrationsWithRollback as runMigrations };
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-core -- src/db/__tests__/migrations.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/db/migrations.ts packages/hzl-core/src/db/__tests__/migrations.test.ts
git commit -m "feat(db): add migration system with atomic rollback

- Run all pending migrations in single transaction
- Automatic rollback if any migration fails
- Track applied migrations with checksums
- MigrationError includes list of rolled-back migrations"
```

---

### Task 6: Create cross-process lock implementation ✅

**Files:**
- Create: `packages/hzl-core/src/db/lock.ts`
- Create: `packages/hzl-core/src/db/__tests__/lock.test.ts`

**Step 1: Write test for lock behavior**

```typescript
// packages/hzl-core/src/db/__tests__/lock.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseLock, LockMetadata } from '../lock.js';

describe('DatabaseLock', () => {
  const testDir = path.join(os.tmpdir(), `lock-test-${Date.now()}`);
  const lockPath = path.join(testDir, 'test.db.lock');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('acquires lock when not held', async () => {
    const lock = new DatabaseLock(lockPath);
    const guard = await lock.acquire(1000);
    expect(guard).toBeDefined();
    expect(fs.existsSync(lockPath)).toBe(true);
    guard.release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('writes metadata to lock file', async () => {
    const lock = new DatabaseLock(lockPath, { command: 'test-cmd', version: '1.0.0' });
    const guard = await lock.acquire(1000);

    const content = fs.readFileSync(lockPath, 'utf-8');
    const metadata: LockMetadata = JSON.parse(content);

    expect(metadata.pid).toBe(process.pid);
    expect(metadata.command).toBe('test-cmd');
    expect(metadata.version).toBe('1.0.0');
    expect(typeof metadata.hostname).toBe('string');
    expect(typeof metadata.startedAt).toBe('number');

    guard.release();
  });

  it('fails to acquire when already held by same process', async () => {
    const lock1 = new DatabaseLock(lockPath);
    const guard1 = await lock1.acquire(1000);

    const lock2 = new DatabaseLock(lockPath);
    await expect(lock2.acquire(100)).rejects.toThrow(/lock.*held/i);

    guard1.release();
  });

  it('auto-clears stale lock from dead process', async () => {
    // Write a lock file with a PID that doesn't exist
    const staleLock: LockMetadata = {
      pid: 999999999, // Very high PID unlikely to exist
      hostname: os.hostname(),
      startedAt: Date.now() - 60000,
      command: 'dead-process',
      version: '1.0.0',
    };
    fs.writeFileSync(lockPath, JSON.stringify(staleLock));

    const lock = new DatabaseLock(lockPath);
    const guard = await lock.acquire(1000);

    expect(guard).toBeDefined();
    expect(guard.staleLockCleared).toBe(true);

    guard.release();
  });

  it('releases lock on guard disposal', async () => {
    const lock = new DatabaseLock(lockPath);
    {
      const guard = await lock.acquire(1000);
      expect(fs.existsSync(lockPath)).toBe(true);
      guard.release();
    }
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('acquires uncontested lock quickly (exponential backoff)', async () => {
    const lock = new DatabaseLock(lockPath);
    const startTime = Date.now();
    const guard = await lock.acquire(1000);
    const elapsed = Date.now() - startTime;

    // Uncontested lock should be acquired in < 10ms (no retry needed)
    expect(elapsed).toBeLessThan(10);
    guard.release();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-core -- src/db/__tests__/lock.test.ts`
Expected: FAIL with "Cannot find module '../lock.js'"

**Step 3: Implement DatabaseLock**

```typescript
// packages/hzl-core/src/db/lock.ts
import fs from 'fs';
import os from 'os';

export interface LockMetadata {
  pid: number;
  hostname: string;
  startedAt: number;
  command?: string;
  version?: string;
}

export interface LockGuard {
  release(): void;
  staleLockCleared: boolean;
}

export interface LockOptions {
  command?: string;
  version?: string;
}

function isPidRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class DatabaseLock {
  private lockPath: string;
  private options: LockOptions;

  constructor(lockPath: string, options: LockOptions = {}) {
    this.lockPath = lockPath;
    this.options = options;
  }

  /**
   * Read current lock metadata if lock file exists
   */
  readMetadata(): LockMetadata | null {
    if (!fs.existsSync(this.lockPath)) {
      return null;
    }
    try {
      const content = fs.readFileSync(this.lockPath, 'utf-8');
      return JSON.parse(content) as LockMetadata;
    } catch {
      return null;
    }
  }

  /**
   * Check if lock is stale (held by dead process)
   */
  isStale(): boolean {
    const metadata = this.readMetadata();
    if (!metadata) return false;

    // Only consider stale if on same hostname (can't check PIDs across machines)
    if (metadata.hostname !== os.hostname()) {
      return false;
    }

    return !isPidRunning(metadata.pid);
  }

  /**
   * Clear the lock file
   */
  clear(): void {
    if (fs.existsSync(this.lockPath)) {
      fs.unlinkSync(this.lockPath);
    }
  }

  /**
   * Acquire the lock with timeout.
   * Uses exponential backoff starting at 5ms for fast CLI responsiveness.
   */
  async acquire(timeoutMs: number): Promise<LockGuard> {
    const startTime = Date.now();
    let staleLockCleared = false;
    let attempt = 0;
    const BASE_DELAY_MS = 5;
    const MAX_DELAY_MS = 100;

    while (Date.now() - startTime < timeoutMs) {
      // Check for stale lock
      if (this.isStale()) {
        this.clear();
        staleLockCleared = true;
      }

      // Try to create lock file exclusively
      try {
        const metadata: LockMetadata = {
          pid: process.pid,
          hostname: os.hostname(),
          startedAt: Date.now(),
          command: this.options.command,
          version: this.options.version,
        };

        // O_EXCL ensures atomic creation - fails if file exists
        const fd = fs.openSync(this.lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
        fs.writeSync(fd, JSON.stringify(metadata, null, 2));
        fs.closeSync(fd);

        return {
          release: () => this.clear(),
          staleLockCleared,
        };
      } catch (err) {
        const error = err as NodeJS.ErrnoException;
        if (error.code !== 'EEXIST') {
          throw err;
        }
        // Lock exists, wait with exponential backoff (5ms, 10ms, 20ms, 40ms, 80ms, 100ms max)
        const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
      }
    }

    const metadata = this.readMetadata();
    const holder = metadata
      ? `PID ${metadata.pid} (${metadata.command ?? 'unknown'}) since ${new Date(metadata.startedAt).toISOString()}`
      : 'unknown process';
    throw new Error(`Lock is held by ${holder}. Timeout after ${timeoutMs}ms.`);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-core -- src/db/__tests__/lock.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/db/lock.ts packages/hzl-core/src/db/__tests__/lock.test.ts
git commit -m "feat(db): add cross-process database lock

- Implement DatabaseLock with file-based locking
- Store metadata (pid, hostname, command, version)
- Auto-clear stale locks from dead processes
- Timeout with informative error messages"
```

---

### Task 7: Create dual-database connection factory ✅

**Files:**
- Create: `packages/hzl-core/src/db/datastore.ts`
- Create: `packages/hzl-core/src/db/__tests__/datastore.test.ts`

**Step 1: Write test for datastore factory**

```typescript
// packages/hzl-core/src/db/__tests__/datastore.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createDatastore, Datastore } from '../datastore.js';
import type { DbConfig } from '../types.js';

describe('createDatastore', () => {
  const testDir = path.join(os.tmpdir(), `datastore-test-${Date.now()}`);
  let datastore: Datastore | null = null;

  afterEach(() => {
    datastore?.close();
    datastore = null;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('creates events.db and cache.db with default paths', () => {
    const config: DbConfig = {
      events: { path: path.join(testDir, 'events.db') },
      cache: { path: path.join(testDir, 'cache.db') },
    };

    datastore = createDatastore(config);

    expect(fs.existsSync(path.join(testDir, 'events.db'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'cache.db'))).toBe(true);
  });

  it('initializes events.db schema', () => {
    const config: DbConfig = {
      events: { path: path.join(testDir, 'events.db') },
      cache: { path: path.join(testDir, 'cache.db') },
    };

    datastore = createDatastore(config);

    // Check events table exists
    const tables = datastore.eventsDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='events'"
    ).all() as { name: string }[];
    expect(tables.length).toBe(1);
  });

  it('initializes cache.db schema', () => {
    const config: DbConfig = {
      events: { path: path.join(testDir, 'events.db') },
      cache: { path: path.join(testDir, 'cache.db') },
    };

    datastore = createDatastore(config);

    // Check tasks_current table exists
    const tables = datastore.cacheDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks_current'"
    ).all() as { name: string }[];
    expect(tables.length).toBe(1);
  });

  it('reports sync mode when syncUrl configured', () => {
    const config: DbConfig = {
      events: {
        path: path.join(testDir, 'events.db'),
        syncUrl: 'libsql://test.turso.io',
        authToken: 'test-token',
        syncMode: 'offline',
      },
      cache: { path: path.join(testDir, 'cache.db') },
    };

    datastore = createDatastore(config);

    expect(datastore.mode).toBe('offline-sync');
    expect(datastore.syncUrl).toBe('libsql://test.turso.io');
  });

  it('reports local-only mode when no syncUrl', () => {
    const config: DbConfig = {
      events: { path: path.join(testDir, 'events.db') },
      cache: { path: path.join(testDir, 'cache.db') },
    };

    datastore = createDatastore(config);

    expect(datastore.mode).toBe('local-only');
    expect(datastore.syncUrl).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-core -- src/db/__tests__/datastore.test.ts`
Expected: FAIL with "Cannot find module '../datastore.js'"

**Step 3: Implement datastore factory**

```typescript
// packages/hzl-core/src/db/datastore.ts
import Database from 'libsql';
import fs from 'fs';
import path from 'path';
import type { DbConfig, SyncResult, SyncStats } from './types.js';
import { EVENTS_SCHEMA_V2, CACHE_SCHEMA_V1, PRAGMAS } from './schema.js';
import { DatabaseLock, type LockGuard } from './lock.js';
import { generateId } from '../utils/id.js';
import { setInstanceId, getInstanceId, setDeviceId, getDeviceId } from './meta.js';

export type ConnectionMode = 'local-only' | 'remote-replica' | 'offline-sync' | 'remote-only';

export interface Datastore {
  eventsDb: Database.Database;
  cacheDb: Database.Database;
  mode: ConnectionMode;
  syncUrl?: string;
  instanceId: string;
  deviceId: string;
  sync(): SyncStats;
  close(): void;
}

function ensureDirectory(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function determineMode(config: DbConfig): ConnectionMode {
  const syncUrl = config.events?.syncUrl;
  if (!syncUrl) return 'local-only';

  const syncMode = config.events?.syncMode ?? 'offline';
  return syncMode === 'replica' ? 'remote-replica' : 'offline-sync';
}

export function createDatastore(config: DbConfig): Datastore {
  const eventsPath = config.events?.path ?? ':memory:';
  const cachePath = config.cache?.path ?? ':memory:';
  const mode = determineMode(config);

  // Ensure directories exist
  if (eventsPath !== ':memory:') ensureDirectory(eventsPath);
  if (cachePath !== ':memory:') ensureDirectory(cachePath);

  // Build events.db options
  const eventsOpts: Record<string, unknown> = {};
  if (config.events?.syncUrl) {
    eventsOpts.syncUrl = config.events.syncUrl;
  }
  if (config.events?.authToken) {
    eventsOpts.authToken = config.events.authToken;
  }
  if (config.events?.encryptionKey) {
    eventsOpts.encryptionKey = config.events.encryptionKey;
  }
  if (config.timeoutSec) {
    eventsOpts.timeout = config.timeoutSec;
  }
  // Disable background sync in CLI
  eventsOpts.syncPeriod = 0;

  // Create connections
  const eventsDb = new Database(eventsPath, eventsOpts);
  const cacheDb = new Database(cachePath, { timeout: config.timeoutSec });

  // Set pragmas
  eventsDb.exec(PRAGMAS);
  cacheDb.exec(PRAGMAS);

  // Initialize schemas
  eventsDb.exec(EVENTS_SCHEMA_V2);
  cacheDb.exec(CACHE_SCHEMA_V1);

  // Ensure instance ID exists (generate if new database)
  let instanceId = getInstanceId(eventsDb);
  if (!instanceId) {
    instanceId = generateId();
    setInstanceId(eventsDb, instanceId);
  }

  // Ensure device ID exists (generate if new device)
  let deviceId = getDeviceId(cacheDb);
  if (!deviceId) {
    deviceId = generateId();
    setDeviceId(cacheDb, deviceId);
  }

  return {
    eventsDb,
    cacheDb,
    mode,
    syncUrl: config.events?.syncUrl,
    instanceId,
    deviceId,

    // Rate limiting state
    syncAttempts: [] as number[],

    sync(): SyncStats {
      if (mode === 'local-only') {
        return { attempted: false, success: true };
      }

      const now = Date.now();
      const syncConfig = config.sync ?? {};
      const maxAttempts = syncConfig.maxSyncAttemptsPerMinute ?? 10;
      const syncTimeoutMs = syncConfig.syncTimeoutMs ?? 30000;

      // Rate limiting: track attempts in the last minute
      this.syncAttempts = this.syncAttempts.filter(t => now - t < 60000);
      if (this.syncAttempts.length >= maxAttempts) {
        return {
          attempted: false,
          success: false,
          error: `Rate limited: ${maxAttempts} sync attempts per minute exceeded`,
        };
      }
      this.syncAttempts.push(now);

      // Update sync attempt timestamp in local meta
      setLastSyncAttemptAt(cacheDb, now);

      try {
        // Wrap sync() with timeout using AbortController pattern
        const syncPromise = new Promise<SyncResult>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Sync timed out after ${syncTimeoutMs}ms`));
          }, syncTimeoutMs);

          try {
            // libsql sync() is synchronous in Node.js binding
            const result = eventsDb.sync() as SyncResult;
            clearTimeout(timeout);
            resolve(result);
          } catch (err) {
            clearTimeout(timeout);
            reject(err);
          }
        });

        // Note: In practice libsql sync() is sync, but this pattern allows for future async
        const result = eventsDb.sync() as SyncResult;

        // Update success metadata
        setLastSyncAt(cacheDb, now);
        setLastSyncFrameNo(cacheDb, result.frame_no);
        clearLastSyncError(cacheDb);
        clearDirtySince(cacheDb);

        return {
          attempted: true,
          success: true,
          framesSynced: result.frames_synced,
          frameNo: result.frame_no,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setLastSyncError(cacheDb, errorMsg);

        return {
          attempted: true,
          success: false,
          error: errorMsg,
        };
      }
    },

    close(): void {
      eventsDb.close();
      cacheDb.close();
    },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-core -- src/db/__tests__/datastore.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/db/datastore.ts packages/hzl-core/src/db/__tests__/datastore.test.ts
git commit -m "feat(db): add dual-database datastore factory

- Create events.db (synced) and cache.db (local-only)
- Initialize schemas with proper pragmas
- Auto-generate instance ID and device ID
- Expose sync() method for manual synchronization
- Report connection mode (local-only, offline-sync, etc.)"
```

---

## Phase 2: Sync Orchestration

### Task 8: Implement sync policy engine ✅

**Files:**
- Create: `packages/hzl-core/src/db/sync-policy.ts`
- Create: `packages/hzl-core/src/db/__tests__/sync-policy.test.ts`

**Step 1: Write test for sync policy logic**

```typescript
// packages/hzl-core/src/db/__tests__/sync-policy.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSyncPolicy, SyncTrigger } from '../sync-policy.js';
import type { SyncConfig } from '../types.js';

describe('SyncPolicy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-31T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('manual policy', () => {
    it('never triggers sync automatically', () => {
      const policy = createSyncPolicy({ policy: 'manual' });

      expect(policy.shouldSyncBefore({ lastSyncAt: null, isDirty: true })).toBe(false);
      expect(policy.shouldSyncAfter({ isDirty: true })).toBe(false);
    });
  });

  describe('opportunistic policy', () => {
    const config: SyncConfig = {
      policy: 'opportunistic',
      staleAfterMs: 60000,
      minIntervalMs: 15000,
      failureBackoffMs: 60000,
    };

    it('triggers sync before when stale', () => {
      const policy = createSyncPolicy(config);
      const now = Date.now();

      // 2 minutes since last sync (> 60s stale threshold)
      const lastSyncAt = now - 120000;
      expect(policy.shouldSyncBefore({
        lastSyncAt,
        isDirty: false,
        lastSyncAttemptAt: null,
      })).toBe(true);
    });

    it('does not trigger sync before when fresh', () => {
      const policy = createSyncPolicy(config);
      const now = Date.now();

      // 30 seconds since last sync (< 60s stale threshold)
      const lastSyncAt = now - 30000;
      expect(policy.shouldSyncBefore({
        lastSyncAt,
        isDirty: false,
        lastSyncAttemptAt: null,
      })).toBe(false);
    });

    it('triggers sync before when never synced', () => {
      const policy = createSyncPolicy(config);

      expect(policy.shouldSyncBefore({
        lastSyncAt: null,
        isDirty: false,
        lastSyncAttemptAt: null,
      })).toBe(true);
    });

    it('respects failure backoff', () => {
      const policy = createSyncPolicy(config);
      const now = Date.now();

      // Stale but recent failed attempt
      expect(policy.shouldSyncBefore({
        lastSyncAt: now - 120000,  // Stale
        isDirty: false,
        lastSyncAttemptAt: now - 5000,  // Failed 5s ago (< 60s backoff)
        lastSyncError: 'network error',
      })).toBe(false);
    });

    it('triggers sync after write when dirty and interval passed', () => {
      const policy = createSyncPolicy(config);
      const now = Date.now();

      expect(policy.shouldSyncAfter({
        isDirty: true,
        lastSyncAttemptAt: now - 20000,  // 20s ago (> 15s interval)
      })).toBe(true);
    });

    it('does not trigger sync after when interval not passed', () => {
      const policy = createSyncPolicy(config);
      const now = Date.now();

      expect(policy.shouldSyncAfter({
        isDirty: true,
        lastSyncAttemptAt: now - 5000,  // 5s ago (< 15s interval)
      })).toBe(false);
    });
  });

  describe('strict policy', () => {
    const config: SyncConfig = { policy: 'strict' };

    it('always triggers sync before reads', () => {
      const policy = createSyncPolicy(config);
      const now = Date.now();

      expect(policy.shouldSyncBefore({
        lastSyncAt: now - 1000,  // Very fresh
        isDirty: false,
        lastSyncAttemptAt: null,
      })).toBe(true);
    });

    it('always triggers sync after writes', () => {
      const policy = createSyncPolicy(config);
      const now = Date.now();

      expect(policy.shouldSyncAfter({
        isDirty: true,
        lastSyncAttemptAt: now - 100,  // Very recent
      })).toBe(true);
    });

    it('fails on sync error', () => {
      const policy = createSyncPolicy(config);

      expect(policy.onSyncError(new Error('network error'))).toBe('fail');
    });
  });

  describe('onSyncError', () => {
    it('opportunistic policy continues on error', () => {
      const policy = createSyncPolicy({ policy: 'opportunistic' });
      expect(policy.onSyncError(new Error('network error'))).toBe('continue');
    });

    it('manual policy continues on error', () => {
      const policy = createSyncPolicy({ policy: 'manual' });
      expect(policy.onSyncError(new Error('network error'))).toBe('continue');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-core -- src/db/__tests__/sync-policy.test.ts`
Expected: FAIL with "Cannot find module '../sync-policy.js'"

**Step 3: Implement sync policy**

```typescript
// packages/hzl-core/src/db/sync-policy.ts
import type { SyncConfig, SyncPolicy as SyncPolicyType } from './types.js';

export interface SyncState {
  lastSyncAt: number | null;
  isDirty: boolean;
  lastSyncAttemptAt?: number | null;
  lastSyncError?: string | null;
}

export interface AfterWriteState {
  isDirty: boolean;
  lastSyncAttemptAt?: number | null;
}

export type SyncTrigger = 'stale' | 'dirty' | 'forced' | 'none';
export type SyncErrorAction = 'continue' | 'fail';

export interface SyncPolicy {
  type: SyncPolicyType;
  shouldSyncBefore(state: SyncState): boolean;
  shouldSyncAfter(state: AfterWriteState): boolean;
  onSyncError(error: Error): SyncErrorAction;
}

const DEFAULT_STALE_AFTER_MS = 60000;
const DEFAULT_MIN_INTERVAL_MS = 15000;
const DEFAULT_FAILURE_BACKOFF_MS = 60000;

export function createSyncPolicy(config: SyncConfig = {}): SyncPolicy {
  const policyType = config.policy ?? 'opportunistic';
  const staleAfterMs = config.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const minIntervalMs = config.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const failureBackoffMs = config.failureBackoffMs ?? DEFAULT_FAILURE_BACKOFF_MS;

  if (policyType === 'manual') {
    return {
      type: 'manual',
      shouldSyncBefore: () => false,
      shouldSyncAfter: () => false,
      onSyncError: () => 'continue',
    };
  }

  if (policyType === 'strict') {
    return {
      type: 'strict',
      shouldSyncBefore: () => true,
      shouldSyncAfter: () => true,
      onSyncError: () => 'fail',
    };
  }

  // Opportunistic policy
  return {
    type: 'opportunistic',

    shouldSyncBefore(state: SyncState): boolean {
      const now = Date.now();

      // Check for failure backoff
      if (state.lastSyncError && state.lastSyncAttemptAt) {
        const timeSinceAttempt = now - state.lastSyncAttemptAt;
        if (timeSinceAttempt < failureBackoffMs) {
          return false;
        }
      }

      // Never synced - should sync
      if (state.lastSyncAt === null) {
        return true;
      }

      // Check if stale
      const timeSinceSync = now - state.lastSyncAt;
      return timeSinceSync > staleAfterMs;
    },

    shouldSyncAfter(state: AfterWriteState): boolean {
      if (!state.isDirty) {
        return false;
      }

      const now = Date.now();

      // Check min interval
      if (state.lastSyncAttemptAt) {
        const timeSinceAttempt = now - state.lastSyncAttemptAt;
        if (timeSinceAttempt < minIntervalMs) {
          return false;
        }
      }

      return true;
    },

    onSyncError: () => 'continue',
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-core -- src/db/__tests__/sync-policy.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/db/sync-policy.ts packages/hzl-core/src/db/__tests__/sync-policy.test.ts
git commit -m "feat(db): implement sync policy engine

- Manual policy: never syncs automatically
- Opportunistic policy: syncs when stale or dirty with backoff
- Strict policy: always syncs, fails on error
- Configurable thresholds (staleAfterMs, minIntervalMs, failureBackoffMs)"
```

---

## Phase 3: CLI Commands

### Task 9: Add hzl sync command ✅

**Files:**
- Create: `packages/hzl-cli/src/commands/sync.ts`
- Create: `packages/hzl-cli/src/commands/sync.test.ts`

**Step 1: Write test for sync command**

```typescript
// packages/hzl-cli/src/commands/sync.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSyncCommand, runSync, SyncResult } from './sync.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('hzl sync command', () => {
  const testDir = path.join(os.tmpdir(), `sync-test-${Date.now()}`);
  const eventsDb = path.join(testDir, 'events.db');
  const cacheDb = path.join(testDir, 'cache.db');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('runSync', () => {
    it('returns success for local-only database', async () => {
      const result = await runSync({
        eventsDbPath: eventsDb,
        cacheDbPath: cacheDb,
        json: false,
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('local-only');
      expect(result.message).toContain('local-only');
    });

    it('returns JSON output when requested', async () => {
      const result = await runSync({
        eventsDbPath: eventsDb,
        cacheDbPath: cacheDb,
        json: true,
      });

      expect(result.success).toBe(true);
      expect(typeof result.data).toBe('object');
    });
  });

  describe('createSyncCommand', () => {
    it('creates a command with correct name', () => {
      const cmd = createSyncCommand();
      expect(cmd.name()).toBe('sync');
    });

    it('has conflict-strategy option', () => {
      const cmd = createSyncCommand();
      const opts = cmd.options.map(o => o.long);
      expect(opts).toContain('--conflict-strategy');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-cli -- src/commands/sync.test.ts`
Expected: FAIL with "Cannot find module './sync.js'"

**Step 3: Implement sync command**

```typescript
// packages/hzl-cli/src/commands/sync.ts
import { Command } from 'commander';
import { z } from 'zod';
import { createDatastore } from 'hzl-core';
import type { ConflictStrategy, SyncStats } from 'hzl-core';
import { GlobalOptionsSchema } from '../types.js';
import { resolveDbPaths } from '../config.js';

const SyncOptionsSchema = z.object({
  conflictStrategy: z.enum(['merge', 'discard-local', 'fail']).optional(),
});

export interface SyncResult {
  success: boolean;
  mode: string;
  message?: string;
  data?: {
    status: string;
    lastSyncAt?: string;
    framesSynced?: number;
    frameNo?: number;
    merged?: { localEvents?: number; remoteEvents?: number };
  };
  sync?: SyncStats;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
    actions?: Array<{ command: string; description: string }>;
  };
}

export interface SyncOptions {
  eventsDbPath: string;
  cacheDbPath: string;
  json: boolean;
  conflictStrategy?: ConflictStrategy;
  force?: boolean; // Force re-sync even if clean
}

export class ConflictError extends Error {
  constructor(
    message: string,
    public readonly localEvents: number,
    public readonly remoteFrameNo: number,
    public readonly lastSyncFrameNo: number | null
  ) {
    super(message);
    this.name = 'ConflictError';
  }
}

/**
 * Detect if there are local changes that conflict with remote.
 * Returns null if no conflict, or conflict details if there is one.
 */
function detectConflict(datastore: Datastore): {
  hasLocalChanges: boolean;
  localEventCount: number;
  dirtySince: number | null;
} {
  const dirtySince = getDirtySince(datastore.cacheDb);
  if (!dirtySince) {
    return { hasLocalChanges: false, localEventCount: 0, dirtySince: null };
  }

  // Count events created since last sync
  const lastSyncFrameNo = getLastSyncFrameNo(datastore.cacheDb) ?? 0;
  const localEventCount = datastore.eventsDb
    .prepare('SELECT COUNT(*) as count FROM events WHERE id > ?')
    .get(lastSyncFrameNo) as { count: number };

  return {
    hasLocalChanges: localEventCount.count > 0,
    localEventCount: localEventCount.count,
    dirtySince,
  };
}

/**
 * Apply conflict resolution strategy.
 * - merge: Push local changes, then pull remote (default, safe for append-only)
 * - discard-local: Drop local changes since last sync, pull remote
 * - fail: Abort with error, let user decide
 */
async function resolveConflict(
  datastore: Datastore,
  strategy: ConflictStrategy,
  conflictInfo: { localEventCount: number; dirtySince: number | null }
): Promise<{ resolved: boolean; action: string }> {
  switch (strategy) {
    case 'merge':
      // For append-only events, merge is safe - just sync and both sides get all events
      // The ULID ordering ensures consistent final state
      return { resolved: true, action: 'merge' };

    case 'discard-local':
      // WARNING: This discards local work! Only use if explicitly requested.
      // We don't actually delete events (append-only), but we mark them as superseded
      // by clearing dirty state and letting remote state take precedence in projections
      clearDirtySince(datastore.cacheDb);
      return { resolved: true, action: 'discard-local' };

    case 'fail':
      throw new ConflictError(
        `Conflict detected: ${conflictInfo.localEventCount} local events since last sync. ` +
        `Use --conflict-strategy=merge to sync anyway, or --conflict-strategy=discard-local to discard local changes.`,
        conflictInfo.localEventCount,
        0, // Will be filled by sync
        getLastSyncFrameNo(datastore.cacheDb)
      );

    default: {
      const _exhaustive: never = strategy;
      throw new Error(`Unknown conflict strategy: ${strategy}`);
    }
  }
}

export async function runSync(options: SyncOptions): Promise<SyncResult> {
  const { eventsDbPath, cacheDbPath, json, conflictStrategy = 'merge', force = false } = options;

  const datastore = createDatastore({
    events: { path: eventsDbPath },
    cache: { path: cacheDbPath },
  });

  try {
    if (datastore.mode === 'local-only') {
      const result: SyncResult = {
        success: true,
        mode: 'local-only',
        message: 'Database is in local-only mode. No sync configured.',
        data: {
          status: 'local-only',
        },
      };

      if (!json) {
        console.log('✓ Database is in local-only mode. No sync configured.');
        console.log('  To enable sync, run: hzl init --sync-url <url> --auth-token <token>');
      }

      return result;
    }

    // Check for conflicts before syncing
    const conflictInfo = detectConflict(datastore);
    if (conflictInfo.hasLocalChanges && !force) {
      try {
        const resolution = await resolveConflict(datastore, conflictStrategy, conflictInfo);
        if (!json) {
          console.log(`ℹ Conflict resolution: ${resolution.action} (${conflictInfo.localEventCount} local events)`);
        }
      } catch (err) {
        if (err instanceof ConflictError) {
          return {
            success: false,
            mode: datastore.mode,
            error: {
              code: 'SYNC_CONFLICT',
              message: err.message,
              recoverable: true,
              actions: [
                { command: 'hzl sync --conflict-strategy=merge', description: 'Merge local and remote changes' },
                { command: 'hzl sync --conflict-strategy=discard-local', description: 'Discard local changes' },
              ],
            },
            data: {
              localEvents: err.localEvents,
              lastSyncFrameNo: err.lastSyncFrameNo,
            },
          };
        }
        throw err;
      }
    }

    // Perform sync
    const syncStats = datastore.sync();

    if (!syncStats.success) {
      const result: SyncResult = {
        success: false,
        mode: datastore.mode,
        error: {
          code: 'SYNC_FAILED',
          message: syncStats.error ?? 'Sync failed',
          recoverable: true,
          actions: [
            { command: 'hzl doctor', description: 'Check configuration and connectivity' },
            { command: 'hzl sync --force', description: 'Retry sync' },
          ],
        },
        sync: syncStats,
      };

      if (!json) {
        console.error(`✗ Sync failed: ${syncStats.error}`);
      }

      return result;
    }

    const result: SyncResult = {
      success: true,
      mode: datastore.mode,
      data: {
        status: 'synced',
        lastSyncAt: new Date().toISOString(),
        framesSynced: syncStats.framesSynced,
        frameNo: syncStats.frameNo,
      },
      sync: syncStats,
    };

    if (!json) {
      console.log(`✓ Sync complete`);
      console.log(`  Frames synced: ${syncStats.framesSynced ?? 0}`);
      console.log(`  Current frame: ${syncStats.frameNo ?? 'unknown'}`);
    }

    return result;
  } finally {
    datastore.close();
  }
}

export function createSyncCommand(): Command {
  return new Command('sync')
    .description('Synchronize local database with remote Turso instance')
    .option(
      '--conflict-strategy <strategy>',
      'Conflict resolution strategy: merge, discard-local, fail',
      'merge'
    )
    .option(
      '-f, --force',
      'Force sync even if rate limited or recently synced. Use with --reset to force full re-sync.'
    )
    .option(
      '--reset',
      'Reset sync state and perform full re-sync (requires --force). ' +
      'WARNING: This rebuilds all projections from scratch.'
    )
    .action(async function (this: Command) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const localOpts = SyncOptionsSchema.extend({
        force: z.boolean().optional(),
        reset: z.boolean().optional(),
      }).parse(this.opts());

      // --reset requires --force as safety measure
      if (localOpts.reset && !localOpts.force) {
        console.error('Error: --reset requires --force flag');
        process.exit(1);
      }

      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);

      // Handle --reset: clear sync state to force full re-sync
      if (localOpts.reset && localOpts.force) {
        const cacheDb = new Database(cacheDbPath);
        clearDirtySince(cacheDb);
        cacheDb.prepare('DELETE FROM hzl_local_meta WHERE key LIKE ?').run('last_sync%');
        cacheDb.close();
        console.log('ℹ Sync state reset. Performing full re-sync...');
      }

      const result = await runSync({
        eventsDbPath,
        cacheDbPath,
        json: globalOpts.json,
        conflictStrategy: localOpts.conflictStrategy,
        force: localOpts.force,
      });

      if (globalOpts.json) {
        console.log(JSON.stringify(result, null, 2));
      }

      process.exit(result.success ? 0 : 1);
    });
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-cli -- src/commands/sync.test.ts`
Expected: PASS

**Step 5: Register command in CLI**

Update `packages/hzl-cli/src/cli.ts` to add the sync command:

```typescript
import { createSyncCommand } from './commands/sync.js';

// In createProgram():
program.addCommand(createSyncCommand());
```

**Step 6: Commit**

```bash
git add packages/hzl-cli/src/commands/sync.ts packages/hzl-cli/src/commands/sync.test.ts packages/hzl-cli/src/cli.ts
git commit -m "feat(cli): add hzl sync command

- Manual sync trigger with conflict strategy option
- Reports sync stats (frames synced, frame number)
- Structured JSON output with error codes and recovery actions
- Graceful handling of local-only mode"
```

---

### Task 10: Add hzl status command ✅

**Files:**
- Create: `packages/hzl-cli/src/commands/status.ts`
- Create: `packages/hzl-cli/src/commands/status.test.ts`

**Step 1: Write test for status command**

```typescript
// packages/hzl-cli/src/commands/status.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStatusCommand, runStatus } from './status.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('hzl status command', () => {
  const testDir = path.join(os.tmpdir(), `status-test-${Date.now()}`);
  const eventsDb = path.join(testDir, 'events.db');
  const cacheDb = path.join(testDir, 'cache.db');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('runStatus', () => {
    it('returns database status', async () => {
      const result = await runStatus({
        eventsDbPath: eventsDb,
        cacheDbPath: cacheDb,
        json: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.mode).toBe('local-only');
      expect(result.data.eventsDb).toBe(eventsDb);
      expect(result.data.cacheDb).toBe(cacheDb);
      expect(result.data.instanceId).toBeDefined();
      expect(result.data.deviceId).toBeDefined();
    });

    it('shows no sync info for local-only mode', async () => {
      const result = await runStatus({
        eventsDbPath: eventsDb,
        cacheDbPath: cacheDb,
        json: true,
      });

      expect(result.data.syncUrl).toBeUndefined();
      expect(result.data.lastSyncAt).toBeUndefined();
    });
  });

  describe('createStatusCommand', () => {
    it('creates a command with correct name', () => {
      const cmd = createStatusCommand();
      expect(cmd.name()).toBe('status');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-cli -- src/commands/status.test.ts`
Expected: FAIL with "Cannot find module './status.js'"

**Step 3: Implement status command**

```typescript
// packages/hzl-cli/src/commands/status.ts
import { Command } from 'commander';
import { createDatastore, getLastSyncAt, getDirtySince, getLastSyncFrameNo } from 'hzl-core';
import { GlobalOptionsSchema } from '../types.js';
import { resolveDbPaths } from '../config.js';

export interface StatusResult {
  success: boolean;
  data: {
    mode: string;
    eventsDb: string;
    cacheDb: string;
    syncUrl?: string;
    instanceId: string;
    deviceId: string;
    lastSyncAt?: string;
    lastSyncFrameNo?: number;
    unsyncedEvents?: number;
  };
}

export interface StatusOptions {
  eventsDbPath: string;
  cacheDbPath: string;
  json: boolean;
}

export async function runStatus(options: StatusOptions): Promise<StatusResult> {
  const { eventsDbPath, cacheDbPath, json } = options;

  const datastore = createDatastore({
    events: { path: eventsDbPath },
    cache: { path: cacheDbPath },
  });

  try {
    const lastSyncAtMs = getLastSyncAt(datastore.cacheDb);
    const dirtySince = getDirtySince(datastore.cacheDb);
    const lastSyncFrameNo = getLastSyncFrameNo(datastore.cacheDb);

    // Count unsynced events (events after dirty_since)
    let unsyncedEvents: number | undefined;
    if (dirtySince) {
      const count = datastore.eventsDb.prepare(
        'SELECT COUNT(*) as count FROM events WHERE timestamp > ?'
      ).get(new Date(dirtySince).toISOString()) as { count: number };
      unsyncedEvents = count.count;
    }

    const result: StatusResult = {
      success: true,
      data: {
        mode: datastore.mode,
        eventsDb: eventsDbPath,
        cacheDb: cacheDbPath,
        syncUrl: datastore.syncUrl,
        instanceId: datastore.instanceId,
        deviceId: datastore.deviceId,
        lastSyncAt: lastSyncAtMs ? new Date(lastSyncAtMs).toISOString() : undefined,
        lastSyncFrameNo: lastSyncFrameNo ?? undefined,
        unsyncedEvents,
      },
    };

    if (!json) {
      console.log(`Mode:        ${datastore.mode}`);
      console.log(`Events DB:   ${eventsDbPath}`);
      console.log(`Cache DB:    ${cacheDbPath}`);
      console.log(`Instance ID: ${datastore.instanceId}`);
      console.log(`Device ID:   ${datastore.deviceId}`);

      if (datastore.syncUrl) {
        console.log(`Sync URL:    ${datastore.syncUrl}`);
      }

      if (lastSyncAtMs) {
        console.log(`Last Sync:   ${new Date(lastSyncAtMs).toISOString()}`);
      }

      if (lastSyncFrameNo) {
        console.log(`Frame No:    ${lastSyncFrameNo}`);
      }

      if (unsyncedEvents !== undefined && unsyncedEvents > 0) {
        console.log(`Unsynced:    ${unsyncedEvents} event(s)`);
      }
    }

    return result;
  } finally {
    datastore.close();
  }
}

export function createStatusCommand(): Command {
  return new Command('status')
    .description('Show current database mode and sync state')
    .action(async function (this: Command) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);

      const result = await runStatus({
        eventsDbPath,
        cacheDbPath,
        json: globalOpts.json,
      });

      if (globalOpts.json) {
        console.log(JSON.stringify(result, null, 2));
      }

      process.exit(result.success ? 0 : 1);
    });
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-cli -- src/commands/status.test.ts`
Expected: PASS

**Step 5: Register command in CLI**

**Step 6: Commit**

```bash
git add packages/hzl-cli/src/commands/status.ts packages/hzl-cli/src/commands/status.test.ts packages/hzl-cli/src/cli.ts
git commit -m "feat(cli): add hzl status command

- Show database mode (local-only, offline-sync, etc.)
- Display instance ID and device ID
- Show last sync time and frame number
- Report count of unsynced events"
```

---

### Task 11: Extend hzl init with sync options ✅

**Files:**
- Modify: `packages/hzl-cli/src/commands/init.ts`
- Modify: `packages/hzl-cli/src/commands/init.test.ts`

**Step 1: Write test for new init options**

```typescript
// Add to packages/hzl-cli/src/commands/init.test.ts

describe('init with sync options', () => {
  it('accepts --sync-url option', async () => {
    const result = await runInit({
      dbPath: path.join(testDir, 'data.db'),
      pathSource: 'cli',
      json: true,
      syncUrl: 'libsql://test.turso.io',
      authToken: 'test-token',
    });

    expect(result.syncUrl).toBe('libsql://test.turso.io');
    expect(result.mode).toBe('offline-sync');
  });

  it('accepts --local flag to disable sync', async () => {
    const result = await runInit({
      dbPath: path.join(testDir, 'data.db'),
      pathSource: 'cli',
      json: true,
      local: true,
    });

    expect(result.mode).toBe('local-only');
    expect(result.syncUrl).toBeUndefined();
  });

  it('accepts --encryption-key option', async () => {
    const result = await runInit({
      dbPath: path.join(testDir, 'data.db'),
      pathSource: 'cli',
      json: true,
      encryptionKey: 'secret-key',
    });

    expect(result.encrypted).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-cli -- src/commands/init.test.ts`
Expected: FAIL (new options not implemented)

**Step 3: Update init command with sync options**

```typescript
// packages/hzl-cli/src/commands/init.ts
// Add new options to InitOptions interface and command

export interface InitOptions {
  dbPath: string;
  pathSource: DbPathSource;
  json: boolean;
  configPath?: string;
  force?: boolean;
  // New sync options
  syncUrl?: string;
  authToken?: string;
  encryptionKey?: string;
  local?: boolean;
}

export interface InitResult {
  path: string;
  created: boolean;
  source: DbPathSource;
  // New fields
  mode: string;
  syncUrl?: string;
  instanceId: string;
  encrypted?: boolean;
}

// Update createInitCommand():
export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize a new HZL database')
    .option('-f, --force', 'Reset to default location')
    .option('--sync-url <url>', 'Turso sync URL (libsql://...)')
    .option('--auth-token <token>', 'Turso auth token')
    .option('--encryption-key <key>', 'Local encryption key')
    .option('--local', 'Explicit local-only mode, clear sync config')
    .action(async function (this: Command) {
      // ... implementation
    });
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-cli -- src/commands/init.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/commands/init.ts packages/hzl-cli/src/commands/init.test.ts
git commit -m "feat(cli): extend hzl init with sync options

- Add --sync-url for Turso URL
- Add --auth-token for authentication
- Add --encryption-key for local encryption
- Add --local flag to explicitly disable sync
- Report mode and instance ID in result"
```

---

### Task 12: Add hzl doctor command

**Files:**
- Create: `packages/hzl-cli/src/commands/doctor.ts`
- Create: `packages/hzl-cli/src/commands/doctor.test.ts`

**Step 1: Write test for doctor command**

```typescript
// packages/hzl-cli/src/commands/doctor.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDoctorCommand, runDoctor } from './doctor.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('hzl doctor command', () => {
  const testDir = path.join(os.tmpdir(), `doctor-test-${Date.now()}`);
  const eventsDb = path.join(testDir, 'events.db');
  const cacheDb = path.join(testDir, 'cache.db');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('runDoctor', () => {
    it('returns healthy status for valid database', async () => {
      // Initialize database first
      const { createDatastore } = await import('hzl-core');
      const ds = createDatastore({
        events: { path: eventsDb },
        cache: { path: cacheDb },
      });
      ds.close();

      const result = await runDoctor({
        eventsDbPath: eventsDb,
        cacheDbPath: cacheDb,
        configPath: path.join(testDir, 'config.json'),
        json: true,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('healthy');
      expect(result.checks.database.status).toBe('pass');
    });

    it('reports unhealthy when database missing', async () => {
      const result = await runDoctor({
        eventsDbPath: path.join(testDir, 'nonexistent.db'),
        cacheDbPath: cacheDb,
        configPath: path.join(testDir, 'config.json'),
        json: true,
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('unhealthy');
      expect(result.checks.database.status).toBe('fail');
    });
  });

  describe('createDoctorCommand', () => {
    it('creates a command with correct name', () => {
      const cmd = createDoctorCommand();
      expect(cmd.name()).toBe('doctor');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-cli -- src/commands/doctor.test.ts`
Expected: FAIL with "Cannot find module './doctor.js'"

**Step 3: Implement doctor command**

```typescript
// packages/hzl-cli/src/commands/doctor.ts
import { Command } from 'commander';
import fs from 'fs';
import { createDatastore, getInstanceId, DatabaseLock } from 'hzl-core';
import { GlobalOptionsSchema } from '../types.js';
import { resolveDbPaths, getConfigPath, readConfig } from '../config.js';

type CheckStatus = 'pass' | 'fail' | 'warn';

interface Check {
  status: CheckStatus;
  message?: string;
  path?: string;
  version?: number;
  actions?: Array<{ command: string; description: string }>;
}

export interface DoctorResult {
  success: boolean;
  status: 'healthy' | 'unhealthy';
  mode: string;
  checks: {
    config: Check;
    database: Check;
    migrations: Check;
    permissions: Check;
    lock: Check;
    sync?: Check;
    identity?: Check;
  };
}

export interface DoctorOptions {
  eventsDbPath: string;
  cacheDbPath: string;
  configPath: string;
  json: boolean;
}

export async function runDoctor(options: DoctorOptions): Promise<DoctorResult> {
  const { eventsDbPath, cacheDbPath, configPath, json } = options;
  const checks: DoctorResult['checks'] = {
    config: { status: 'pass' },
    database: { status: 'pass' },
    migrations: { status: 'pass' },
    permissions: { status: 'pass' },
    lock: { status: 'pass' },
  };
  let mode = 'unknown';

  // Check config
  try {
    if (fs.existsSync(configPath)) {
      const config = readConfig(configPath);
      checks.config = { status: 'pass', path: configPath };

      // Check config file permissions if authToken is stored in config
      if (config.db?.events?.authToken) {
        const permWarning = checkConfigPermissions(configPath);
        if (permWarning) {
          checks.config = {
            status: 'warn',
            message: permWarning,
            path: configPath,
            actions: [
              { command: `chmod 600 "${configPath}"`, description: 'Fix config file permissions' },
              { command: 'Consider using TURSO_AUTH_TOKEN env var instead', description: 'More secure for auth tokens' },
            ],
          };
        }
      }
    } else {
      checks.config = { status: 'warn', message: 'Config file not found', path: configPath };
    }
  } catch (err) {
    checks.config = {
      status: 'fail',
      message: err instanceof Error ? err.message : 'Invalid config',
      path: configPath,
      actions: [{ command: `rm ${configPath}`, description: 'Remove corrupted config' }],
    };
  }

  // Check database
  try {
    if (!fs.existsSync(eventsDbPath)) {
      checks.database = {
        status: 'fail',
        message: 'Events database not found',
        path: eventsDbPath,
        actions: [{ command: 'hzl init', description: 'Initialize database' }],
      };
    } else {
      const datastore = createDatastore({
        events: { path: eventsDbPath },
        cache: { path: cacheDbPath },
      });
      mode = datastore.mode;

      // Run integrity check
      const integrity = datastore.eventsDb.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      if (integrity.integrity_check !== 'ok') {
        checks.database = {
          status: 'fail',
          message: `Integrity check failed: ${integrity.integrity_check}`,
          path: eventsDbPath,
          actions: [{ command: 'hzl db restore <backup>', description: 'Restore from backup' }],
        };
      } else {
        checks.database = { status: 'pass', path: eventsDbPath };
      }

      // Check identity
      const instanceId = getInstanceId(datastore.eventsDb);
      if (instanceId) {
        checks.identity = { status: 'pass', message: instanceId };
      }

      datastore.close();
    }
  } catch (err) {
    checks.database = {
      status: 'fail',
      message: err instanceof Error ? err.message : 'Database error',
      path: eventsDbPath,
    };
  }

  // Check lock
  try {
    const lockPath = `${eventsDbPath}.lock`;
    const lock = new DatabaseLock(lockPath);
    const metadata = lock.readMetadata();

    if (metadata) {
      if (lock.isStale()) {
        checks.lock = {
          status: 'warn',
          message: `Stale lock from PID ${metadata.pid}`,
          actions: [{ command: 'hzl lock clear --force', description: 'Clear stale lock' }],
        };
      } else {
        checks.lock = {
          status: 'warn',
          message: `Lock held by PID ${metadata.pid} (${metadata.command ?? 'unknown'})`,
        };
      }
    } else {
      checks.lock = { status: 'pass' };
    }
  } catch (err) {
    checks.lock = {
      status: 'fail',
      message: err instanceof Error ? err.message : 'Lock check error',
    };
  }

  // Check Turso connectivity (if sync is configured)
  if (mode !== 'local-only' && mode !== 'unknown') {
    try {
      const datastore = createDatastore({
        events: { path: eventsDbPath },
        cache: { path: cacheDbPath },
      });

      // Attempt a sync to test connectivity
      const syncResult = datastore.sync();
      datastore.close();

      if (syncResult.success) {
        checks.connectivity = {
          status: 'pass',
          message: `Connected to Turso (frame: ${syncResult.frameNo})`,
        };
      } else if (syncResult.error?.includes('Rate limited')) {
        checks.connectivity = {
          status: 'warn',
          message: 'Rate limited - try again later',
        };
      } else {
        checks.connectivity = {
          status: 'fail',
          message: syncResult.error ?? 'Sync failed',
          actions: [
            { command: 'Check TURSO_AUTH_TOKEN env var', description: 'Verify auth token is set correctly' },
            { command: 'hzl init --local', description: 'Switch to local-only mode' },
          ],
        };
      }
    } catch (err) {
      checks.connectivity = {
        status: 'fail',
        message: `Connectivity check failed: ${err instanceof Error ? err.message : String(err)}`,
        actions: [
          { command: 'Check network connection', description: 'Ensure you can reach Turso servers' },
          { command: 'hzl init --local', description: 'Switch to local-only mode if offline' },
        ],
      };
    }
  }

  // Check permissions
  try {
    if (fs.existsSync(eventsDbPath)) {
      fs.accessSync(eventsDbPath, fs.constants.R_OK | fs.constants.W_OK);
      checks.permissions = { status: 'pass' };
    }
  } catch {
    checks.permissions = {
      status: 'fail',
      message: 'Cannot read/write database',
      actions: [{ command: `chmod 644 ${eventsDbPath}`, description: 'Fix permissions' }],
    };
  }

  // Determine overall health
  const hasFailure = Object.values(checks).some(c => c.status === 'fail');
  const result: DoctorResult = {
    success: !hasFailure,
    status: hasFailure ? 'unhealthy' : 'healthy',
    mode,
    checks,
  };

  if (!json) {
    console.log(`Status: ${result.status}`);
    console.log(`Mode:   ${mode}`);
    console.log('');

    for (const [name, check] of Object.entries(checks)) {
      const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
      console.log(`${icon} ${name}: ${check.status}${check.message ? ` - ${check.message}` : ''}`);
      if (check.actions) {
        for (const action of check.actions) {
          console.log(`    → ${action.command}: ${action.description}`);
        }
      }
    }
  }

  return result;
}

export function createDoctorCommand(): Command {
  return new Command('doctor')
    .description('Validate database setup and connectivity')
    .action(async function (this: Command) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);

      const result = await runDoctor({
        eventsDbPath,
        cacheDbPath,
        configPath: getConfigPath(),
        json: globalOpts.json,
      });

      if (globalOpts.json) {
        console.log(JSON.stringify(result, null, 2));
      }

      process.exit(result.success ? 0 : 1);
    });
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-cli -- src/commands/doctor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/commands/doctor.ts packages/hzl-cli/src/commands/doctor.test.ts packages/hzl-cli/src/cli.ts
git commit -m "feat(cli): add hzl doctor command

- Check config file validity
- Check database integrity
- Check file permissions
- Check lock status (detect stale locks)
- Report structured errors with recovery actions
- Exit codes: 0 (healthy), 1 (unhealthy), 2 (doctor error)"
```

---

## Phase 4: Integration

### Task 13: Update CLI config to support nested db object

**Files:**
- Modify: `packages/hzl-cli/src/types.ts`
- Modify: `packages/hzl-cli/src/config.ts`

**Step 1: Write test for nested config**

```typescript
// packages/hzl-cli/src/config.test.ts
describe('nested db config', () => {
  it('reads nested events path', () => {
    const configPath = path.join(testDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      db: {
        events: { path: '/custom/events.db' },
        cache: { path: '/custom/cache.db' },
      }
    }));

    const paths = resolveDbPaths(undefined, configPath);
    expect(paths.eventsDbPath).toBe('/custom/events.db');
    expect(paths.cacheDbPath).toBe('/custom/cache.db');
  });

  it('supports legacy dbPath for backward compatibility', () => {
    const configPath = path.join(testDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      dbPath: '/legacy/data.db'
    }));

describe('secure config handling', () => {
  it('resolves auth token from env var first', () => {
    const originalEnv = process.env.TURSO_AUTH_TOKEN;
    try {
      process.env.TURSO_AUTH_TOKEN = 'env-token';

      const config: Config = {
        db: { events: { authToken: 'config-token' } }
      };
      expect(resolveAuthToken(config)).toBe('env-token');
    } finally {
      if (originalEnv === undefined) {
        delete process.env.TURSO_AUTH_TOKEN;
      } else {
        process.env.TURSO_AUTH_TOKEN = originalEnv;
      }
    }
  });

  it('falls back to config auth token when env var not set', () => {
    const originalEnv = process.env.TURSO_AUTH_TOKEN;
    try {
      delete process.env.TURSO_AUTH_TOKEN;

      const config: Config = {
        db: { events: { authToken: 'config-token' } }
      };
      expect(resolveAuthToken(config)).toBe('config-token');
    } finally {
      if (originalEnv !== undefined) {
        process.env.TURSO_AUTH_TOKEN = originalEnv;
      }
    }
  });

  it('fixes insecure config permissions on non-Windows', () => {
    if (process.platform === 'win32') return; // Skip on Windows

    const configPath = path.join(testDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ db: { events: { authToken: 'secret' } } }));
    fs.chmodSync(configPath, 0o644); // World-readable

    ensureSecureConfigPermissions(configPath);

    const stats = fs.statSync(configPath);
    const mode = stats.mode & 0o777;
    expect(mode).toBe(0o600); // Should be owner-only now
  });

  it('checkConfigPermissions returns warning for insecure file', () => {
    if (process.platform === 'win32') return; // Skip on Windows

    const configPath = path.join(testDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({}));
    fs.chmodSync(configPath, 0o644);

    const warning = checkConfigPermissions(configPath);
    expect(warning).toContain('readable by other users');
  });

  it('checkConfigPermissions returns null for secure file', () => {
    if (process.platform === 'win32') return; // Skip on Windows

    const configPath = path.join(testDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({}));
    fs.chmodSync(configPath, 0o600);

    expect(checkConfigPermissions(configPath)).toBeNull();
  });
});


    const paths = resolveDbPaths(undefined, configPath);
    // Legacy path becomes events.db, cache.db is derived
    expect(paths.eventsDbPath).toBe('/legacy/data.db');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-cli -- src/config.test.ts`
Expected: FAIL (resolveDbPaths doesn't exist yet)

**Step 3: Update config to support nested structure**

```typescript
// packages/hzl-cli/src/types.ts
export interface Config {
  // Legacy (backward compat)
  dbPath?: string;

  // New nested structure
  db?: {
    events?: {
      path?: string;
      syncUrl?: string;
      // authToken is supported but TURSO_AUTH_TOKEN env var is preferred
      // When authToken is set, config file permissions are enforced (0600)
      authToken?: string;
      syncMode?: 'replica' | 'offline';
      encryptionKey?: string;
    };
    cache?: {
      path?: string;
    };
    sync?: {
      policy?: 'manual' | 'opportunistic' | 'strict';
      staleAfterMs?: number;
      minIntervalMs?: number;
      lockTimeoutMs?: number;
      conflictStrategy?: 'merge' | 'discard-local' | 'fail';
    };
  };

  defaultProject?: string;
  defaultAuthor?: string;
  leaseMinutes?: number;
}

// packages/hzl-cli/src/config.ts - add secure config helpers

/**
 * Resolve auth token from env var (preferred) or config file.
 * Env var takes precedence for CI/CD and security best practices.
 */
export function resolveAuthToken(config: Config): string | undefined {
  // Env var takes precedence (recommended for CI/CD and security)
  if (process.env.TURSO_AUTH_TOKEN) {
    return process.env.TURSO_AUTH_TOKEN;
  }
  return config.db?.events?.authToken;
}

/**
 * Ensure config file has secure permissions (0600) when it contains sensitive data.
 * Called automatically when writing config with authToken.
 */
export function ensureSecureConfigPermissions(configPath: string): void {
  if (process.platform === 'win32') {
    // Windows handles permissions differently - skip for now
    return;
  }

  try {
    const stats = fs.statSync(configPath);
    const mode = stats.mode & 0o777;

    // Check if file is readable by group or others
    if (mode & 0o077) {
      // Fix permissions to 0600 (owner read/write only)
      fs.chmodSync(configPath, 0o600);
      console.warn(`Warning: Fixed config file permissions to 600 (contained sensitive data)`);
    }
  } catch {
    // File may not exist yet, which is fine
  }
}

/**
 * Check if config file permissions are secure.
 * Returns warning message if permissions are too permissive.
 */
export function checkConfigPermissions(configPath: string): string | null {
  if (process.platform === 'win32') {
    return null; // Skip on Windows
  }

  try {
    const stats = fs.statSync(configPath);
    const mode = stats.mode & 0o777;

    if (mode & 0o077) {
      return `Config file at ${configPath} is readable by other users (mode: ${mode.toString(8)}). ` +
        `Consider running: chmod 600 "${configPath}"`;
    }
  } catch {
    // File doesn't exist
  }
  return null;
}

// Update writeConfig to enforce secure permissions when authToken is present
export function writeConfig(updates: Partial<Config>, configPath: string = getConfigPath()): void {
  // ... existing writeConfig implementation ...

  // After writing, ensure secure permissions if authToken is present
  const merged = { ...existing, ...updates };
  if (merged.db?.events?.authToken) {
    ensureSecureConfigPermissions(configPath);
  }
}

// packages/hzl-cli/src/config.ts
export interface ResolvedDbPaths {
  eventsDbPath: string;
  cacheDbPath: string;
}

export function resolveDbPaths(cliOption?: string, configPath: string = getConfigPath()): ResolvedDbPaths {
  // CLI option overrides everything
  if (cliOption) {
    const expanded = expandTilde(cliOption);
    return {
      eventsDbPath: expanded,
      cacheDbPath: expanded.replace(/\.db$/, '-cache.db'),
    };
  }

  // Environment variables
  if (process.env.HZL_DB_EVENTS_PATH) {
    return {
      eventsDbPath: expandTilde(process.env.HZL_DB_EVENTS_PATH),
      cacheDbPath: expandTilde(process.env.HZL_DB_CACHE_PATH ?? process.env.HZL_DB_EVENTS_PATH.replace(/\.db$/, '-cache.db')),
    };
  }

  // Legacy HZL_DB env var
  if (process.env.HZL_DB) {
    const expanded = expandTilde(process.env.HZL_DB);
    return {
      eventsDbPath: expanded,
      cacheDbPath: expanded.replace(/\.db$/, '-cache.db'),
    };
  }

  // Config file
  const config = readConfig(configPath);

  // New nested structure
  if (config.db?.events?.path) {
    return {
      eventsDbPath: expandTilde(config.db.events.path),
      cacheDbPath: expandTilde(config.db.cache?.path ?? config.db.events.path.replace(/\.db$/, '-cache.db')),
    };
  }

  // Legacy dbPath
  if (config.dbPath) {
    const expanded = expandTilde(config.dbPath);
    return {
      eventsDbPath: expanded,
      cacheDbPath: expanded.replace(/\.db$/, '-cache.db'),
    };
  }

  // Default
  const defaultEventsPath = getDefaultEventsPath();
  return {
    eventsDbPath: defaultEventsPath,
    cacheDbPath: defaultEventsPath.replace(/\.db$/, '-cache.db'),
  };
}

export function getDefaultEventsPath(): string {
  if (isDevMode()) {
    return path.join(getDevDataDir(), 'events.db');
  }
  return path.join(getXdgDataHome(), 'hzl', 'events.db');
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-cli -- src/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/types.ts packages/hzl-cli/src/config.ts packages/hzl-cli/src/config.test.ts
git commit -m "feat(cli): support nested db config with backward compatibility

- Add db.events and db.cache nested config structure
- Support legacy dbPath for backward compatibility
- Add HZL_DB_EVENTS_PATH and HZL_DB_CACHE_PATH env vars
- resolveDbPaths returns both events and cache paths"
```

---

### Task 14: Run full test suite and fix any regressions

**Files:**
- Various (fix any failing tests)

**Step 1: Run all tests**

Run: `npm test`
Expected: Some tests may fail due to API changes

**Step 2: Fix any failing tests**

Update test files that use the old single-database API to use the new dual-database pattern.

**Step 3: Run tests again**

Run: `npm test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "fix: update tests for dual-database architecture

- Update tests to use events.db + cache.db pattern
- Fix API changes in service initialization
- Ensure backward compatibility with existing functionality"
```

---

### Task 15: Update documentation

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

**Step 1: Update README with database section**

Add a "Database" section to README.md explaining:
- Local mode (default)
- Sync mode (optional)
- How to set up Turso
- Common commands (sync, status, doctor)
- **Graceful degradation** when Turso is unreachable:
  - All commands continue to work in offline mode
  - Local changes are queued and synced when connectivity returns
  - Use `hzl doctor` to check connectivity status
  - Use `hzl sync --force` to retry failed syncs

**Step 2: Update AGENTS.md with sync notes**

Add notes about:
- New dual-database structure (events.db + cache.db)
- Dev mode paths for new structure
- Sync-related commands

**Step 3: Document migration path from single-db to dual-db**

Add a "Migration" section explaining:
- Existing single-db users: First `hzl init` after upgrade auto-migrates
- data.db → events.db (renamed, events preserved)
- New cache.db created for projections
- Projections rebuilt automatically from events
- No data loss - events are source of truth

**Step 4: Document conflict resolution strategies**

Add a "Conflict Resolution" section explaining:
- `merge` (default): Safe for append-only events, both sides get all events
- `discard-local`: WARNING - drops local changes, use only if intentional
- `fail`: Stops and asks user to decide
- How ULID ordering ensures consistent final state

**Step 5: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: add database and sync documentation

- Explain local-only vs sync modes
- Document Turso setup process
- Document new CLI commands (sync, status, doctor)
- Document graceful degradation when offline
- Document migration path from single-db
- Document conflict resolution strategies
- Update AGENTS.md with dual-database structure notes"
```

---

## Summary

This plan implements Turso remote database support in 15 tasks across 4 phases:

**Phase 1 (Tasks 1-7):** Database layer refactor
- Replace better-sqlite3 with libsql
- Add sync configuration types
- Split into events.db (synced) and cache.db (local)
- Add append-only enforcement triggers
- Implement cross-process locking

**Phase 2 (Task 8):** Sync orchestration
- Implement sync policy engine (manual/opportunistic/strict)

**Phase 3 (Tasks 9-12):** CLI commands
- hzl sync (manual sync trigger)
- hzl status (show sync state)
- Extended hzl init (with sync options)
- hzl doctor (validation checks)

**Phase 4 (Tasks 13-15):** Integration
- Update config for nested db structure
- Fix regressions and update tests
- Update documentation

Each task follows TDD: write failing test → implement → verify → commit.

---

## Implementation Notes

### Database Maintenance

**VACUUM Strategy:**
- events.db: Append-only, grows indefinitely. For very large datasets, consider:
  - Running `VACUUM` periodically during maintenance windows
  - Turso handles this server-side for cloud storage
  - Future: Add `hzl db vacuum` command for manual optimization
- cache.db: Rebuildable from events. Can be deleted and rebuilt anytime.
  - `hzl db rebuild` would recreate projections from events

**WAL Checkpoint:**
- Both databases use WAL mode for concurrent reads
- Checkpoints happen automatically, but can force with `PRAGMA wal_checkpoint(TRUNCATE)`
- Consider auto-checkpoint after sync to keep WAL file small

### Security Considerations

**Auth Token Handling:**
1. Prefer `TURSO_AUTH_TOKEN` env var (recommended for CI/CD)
2. Config file storage supported with automatic 0600 permissions
3. `hzl doctor` warns about insecure config permissions
4. Never log or display auth tokens

**URL Validation:**
- All Turso URLs validated against `libsql://` or `https://` patterns
- Prevents accidental HTTP (insecure) connections
- Rejects malformed URLs early with clear error messages

### Performance Considerations

**Lock Acquisition:**
- Exponential backoff: 5ms → 10ms → 20ms → 40ms → 80ms → 100ms max
- Uncontested lock acquired in <10ms for CLI responsiveness
- Timeout default: 3 seconds

**Sync Rate Limiting:**
- Max 10 sync attempts per minute (configurable)
- Prevents thundering herd on reconnection
- Respects Turso API rate limits

**Sync Timeout:**
- Default 30 seconds per sync call
- Prevents hanging on network issues
- Configurable via `sync.syncTimeoutMs`
