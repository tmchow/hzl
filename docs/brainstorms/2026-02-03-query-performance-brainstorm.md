# Query Performance Optimizations

**Date:** 2026-02-03
**Status:** Implemented

## What We Built

Three low-risk query performance optimizations for hzl-core:

### 1. Search Projection N+1 Fix
- **Problem:** During search index rebuilds, each `TaskUpdated` event triggered a SELECT from `tasks_current` to get title/description
- **Solution:** Query `task_search` directly (the same table being updated) and use `new_value` from the event for the changed field
- **Impact:** Eliminates one query per task during search rebuilds

### 2. Statement Caching for getTaskById
- **Problem:** `getTaskById()` called `db.prepare()` on every invocation instead of reusing a cached statement
- **Solution:** Cache the prepared statement as `getTaskByIdStmt` in the constructor
- **Impact:** Faster task lookups across all operations (most methods call getTaskById multiple times)

### 3. Batch Temp Table in Prune
- **Problem:** `deleteTasksFromProjections()` created/dropped a temp table 6 times (once per projection table)
- **Solution:** Create temp table once, populate it, delete from all tables, then drop
- **Impact:** Reduced from 12 + 6N operations to 8 + N operations

## Why This Approach

- All changes are localized and don't affect the public API
- Event sourcing patterns remain intact
- No architectural changes required
- Easy to verify via existing tests

## Key Decisions

1. Query `task_search` instead of `tasks_current` in search projector - both contain the data, but task_search is the table we're updating
2. Use `CREATE TEMP TABLE IF NOT EXISTS` + `DELETE` pattern for idempotent temp table handling
3. Keep JSON parsing in rowToTask unchanged - it already parses once per row, which is correct

## Files Changed

- `packages/hzl-core/src/projections/search.ts` - N+1 fix
- `packages/hzl-core/src/services/task-service.ts` - Statement caching + temp table batching
