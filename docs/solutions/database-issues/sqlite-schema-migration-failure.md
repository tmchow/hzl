---
title: SQLite migration not executed during upgrade - terminal_at column missing
date: 2026-02-02
category: database-issues
tags: [sqlite, migrations, schema-upgrade, ordering, index-creation]
module: hzl-core
symptoms:
  - "SqliteError: no such column: terminal_at when running hzl status after upgrade"
  - "Index creation fails because column does not exist in existing database"
  - "CREATE TABLE IF NOT EXISTS skips schema updates for existing tables"
severity: P1-Critical
time_to_resolve: 15
---

# SQLite Schema Migration Failure: terminal_at Column Missing

## Problem Summary

After upgrading HZL to a version that includes the `terminal_at` column (for task pruning), users with existing databases see:

```
Fatal error: SqliteError: no such column: terminal_at
    at Database.exec
    at createDatastore (datastore.js:59:13)
```

The error occurs on any command (e.g., `hzl status`, `hzl task list`).

## Root Cause Analysis

The `terminal_at` column was added to support age-based task pruning. However, the upgrade process had a critical sequencing issue:

### Schema Design Issue

`CACHE_SCHEMA_V1` (the main cache database schema) includes both:
- The `terminal_at` column in the CREATE TABLE statement (`schema.ts:91`)
- An index on `terminal_at` (`schema.ts:155`: `CREATE INDEX IF NOT EXISTS idx_tasks_current_terminal_at ON tasks_current(terminal_at)`)

### Upgrade Problem

For existing databases, the initialization flow was:

```
cacheDb.exec(CACHE_SCHEMA_V1)
  ↓
CREATE TABLE IF NOT EXISTS tasks_current  → No-op (table exists)
  ↓
CREATE INDEX ... ON tasks_current(terminal_at)  → FAILS!
```

### Why It Failed

1. `CREATE TABLE IF NOT EXISTS tasks_current` is a no-op for databases with existing `tasks_current` table
2. But the indexes in `CACHE_SCHEMA_V1` still execute
3. Creating an index on a non-existent column throws `SqliteError`

### Root Cause

The v2 migration (`MIGRATION_V2`) that should have added the column **existed but was never called** during datastore initialization.

## Solution

The fix implements a **pre-initialization migration layer** that runs before the main schema creation to ensure columns exist before indexes are created.

### Architecture: Three-Layer Approach

**Layer 1: Migration Utilities** (`packages/hzl-core/src/db/migrations/index.ts`)

```typescript
function tableExists(db: Database.Database, table: string): boolean {
  const row = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(table) as { name: string } | undefined;
  return row !== undefined;
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  if (!tableExists(db, table)) {
    return false;
  }
  const rows = db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as { name: string }[];
  return rows.some(row => row.name === column);
}

export function runCacheMigrations(db: Database.Database): void {
  // Migration V2: Add terminal_at column if table exists but column doesn't
  if (tableExists(db, 'tasks_current') && !columnExists(db, 'tasks_current', 'terminal_at')) {
    db.exec(ADD_TERMINAL_AT_COLUMN);
  }

  // Only create index if column now exists
  if (columnExists(db, 'tasks_current', 'terminal_at')) {
    db.exec(CREATE_TERMINAL_AT_INDEX);
  }
}
```

**Layer 2: Migration SQL** (`packages/hzl-core/src/db/migrations/v2.ts`)

```typescript
export const ADD_TERMINAL_AT_COLUMN = `
ALTER TABLE tasks_current ADD COLUMN terminal_at TEXT
`;

export const CREATE_TERMINAL_AT_INDEX = `
CREATE INDEX IF NOT EXISTS idx_tasks_current_terminal_at ON tasks_current(terminal_at)
`;
```

**Layer 3: Initialization** (`packages/hzl-core/src/db/datastore.ts`)

```typescript
// Run cache database migrations BEFORE schema exec to add any missing columns.
// This ensures columns exist before CACHE_SCHEMA_V1 tries to create indexes on them.
runCacheMigrations(cacheDb);

// Now create/verify all tables and indexes (safe because columns exist)
cacheDb.exec(CACHE_SCHEMA_V1);
```

### Migration Logic Handles All Scenarios

| Scenario | Action |
|----------|--------|
| **Fresh database** | Table doesn't exist → Skip (CACHE_SCHEMA_V1 will create it with column) |
| **Old database** | Table exists without column → Add column, then create index |
| **Current database** | Table exists with column → Skip (already migrated) |

## Key Files Changed

| File | Change |
|------|--------|
| `packages/hzl-core/src/db/migrations/index.ts` | NEW: `runCacheMigrations()`, `tableExists()`, `columnExists()` |
| `packages/hzl-core/src/db/migrations/v2.ts` | NEW: `ADD_TERMINAL_AT_COLUMN`, `CREATE_TERMINAL_AT_INDEX` |
| `packages/hzl-core/src/db/datastore.ts` | MODIFIED: Call `runCacheMigrations(cacheDb)` before `CACHE_SCHEMA_V1` |
| `packages/hzl-core/src/__tests__/migrations/v2-upgrade.test.ts` | NEW: Tests all upgrade scenarios |

## Prevention Strategies

### 1. Enforce Migration Wiring via Checklist

When adding a new migration file, verify:
- [ ] Migration SQL defined in `packages/hzl-core/src/db/migrations/vX.ts`
- [ ] Migration wired into `runCacheMigrations()` in `index.ts`
- [ ] Initialization path verified: runs *before* `CACHE_SCHEMA_V1`
- [ ] Upgrade test added to `packages/hzl-core/src/__tests__/migrations/vX-upgrade.test.ts`

### 2. Always Test Upgrade Scenarios

Existing tests only used fresh databases. Every migration needs tests for:
1. **Fresh database**: Migration skipped (table doesn't exist yet)
2. **Old database**: Migration applies successfully
3. **Current database**: Migration is idempotent
4. **Full path**: Old schema → migration → CACHE_SCHEMA_V1

### 3. Sequence Dependent Operations Explicitly

If migration creates index on new column:
```typescript
// Step 1: Add column (if needed)
if (tableExists(db, 'table') && !columnExists(db, 'table', 'col')) {
  db.exec(ADD_COLUMN);
}

// Step 2: Create index (safe because column exists now)
if (columnExists(db, 'table', 'col')) {
  db.exec(CREATE_INDEX);
}
```

### 4. Document Migration in Multiple Places

When adding a migration, update:
1. Migration file itself (header comment)
2. `AGENTS.md` "Schema Versions" section
3. Upgrade test file
4. `README.md` if user-facing

## Testing

The fix includes comprehensive tests in `v2-upgrade.test.ts`:

```typescript
it('adds terminal_at column to existing table without it')
it('skips migration if table does not exist (fresh database)')
it('skips migration if column already exists')
it('creates index on terminal_at after adding column')
it('full upgrade path: old database then CACHE_SCHEMA_V1')
```

## Related Documentation

- [Event Sourcing Bypass Patterns](../best-practices/event-sourcing-bypass-in-stealtask-hzl-core-20260201.md) - Schema migration patterns
- [Turso Remote Database Design](../../plans/2026-01-31-turso-remote-database-design.md) - Database architecture
- `AGENTS.md` § Architecture - Event sourcing principles

## Why This Test Gap Existed

The bug wasn't caught because:
1. **Tests always started fresh**: Every test creates a new temp directory, then deletes it
2. **No upgrade simulation**: No test created an old-schema database then called `createDatastore`
3. **Migration existed but orphaned**: `MIGRATION_V2` was defined but never wired into initialization

This is a common testing gap - real-world upgrades require creating a database in the old schema first, then running new code against it.
