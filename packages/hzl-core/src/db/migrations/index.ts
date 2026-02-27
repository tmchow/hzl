/**
 * Cache database migrations.
 *
 * These migrations handle schema changes to the cache database (tasks_current, etc.)
 * which stores projections derived from events.
 */

import type Database from 'libsql';
import { ADD_TERMINAL_AT_COLUMN, CREATE_TERMINAL_AT_INDEX } from './v2.js';
import { ADD_AGENT_COLUMN, BACKFILL_AGENT_FROM_ASSIGNEE, CREATE_AGENT_INDEX } from './v3.js';

const ENSURE_HOOK_AND_WORKFLOW_TABLES = `
CREATE TABLE IF NOT EXISTS hook_outbox (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  hook_name             TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','delivered','failed')),
  url                   TEXT NOT NULL,
  headers               TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(headers)),
  payload               TEXT NOT NULL CHECK (json_valid(payload)),
  attempts              INTEGER NOT NULL DEFAULT 0,
  next_attempt_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  processing_started_at TEXT,
  delivered_at          TEXT,
  failed_at             TEXT,
  lock_token            TEXT,
  locked_by             TEXT,
  lock_expires_at       TEXT,
  last_error            TEXT,
  error_payload         TEXT CHECK (error_payload IS NULL OR json_valid(error_payload)),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS workflow_ops (
  op_id                 TEXT PRIMARY KEY,
  workflow_name         TEXT NOT NULL,
  input_hash            TEXT NOT NULL,
  state                 TEXT NOT NULL CHECK (state IN ('processing','completed','failed')),
  result_payload        TEXT CHECK (result_payload IS NULL OR json_valid(result_payload)),
  error_payload         TEXT CHECK (error_payload IS NULL OR json_valid(error_payload)),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;

const ENSURE_HOOK_AND_WORKFLOW_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_hook_outbox_drain ON hook_outbox(status, next_attempt_at, id);
CREATE INDEX IF NOT EXISTS idx_hook_outbox_lock ON hook_outbox(status, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_hook_outbox_hook_status ON hook_outbox(hook_name, status, id);
CREATE INDEX IF NOT EXISTS idx_workflow_ops_workflow_state ON workflow_ops(workflow_name, state, updated_at);
CREATE INDEX IF NOT EXISTS idx_workflow_ops_workflow_input ON workflow_ops(workflow_name, input_hash);
`;

/**
 * Check if a table exists in the database.
 */
function tableExists(db: Database.Database, table: string): boolean {
  const row = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(table) as { name: string } | undefined;
  return row !== undefined;
}

/**
 * Check if a column exists in a table.
 * Returns false if the table doesn't exist.
 */
function columnExists(db: Database.Database, table: string, column: string): boolean {
  if (!tableExists(db, table)) {
    return false;
  }
  const rows = db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as { name: string }[];
  return rows.some(row => row.name === column);
}

/**
 * Run cache database migrations.
 *
 * This function handles schema changes that need programmatic checks
 * (e.g., checking if a column exists before adding it). It runs BEFORE
 * the main schema creation to ensure columns exist before indexes are created.
 *
 * Scenarios handled:
 * 1. Fresh database: Table doesn't exist → skip (CACHE_SCHEMA_V1 will create it)
 * 2. Old database: Table exists without column → add column
 * 3. Current database: Table exists with column → skip (already migrated)
 */
export function runCacheMigrations(db: Database.Database): void {
  // Migration V2: Add terminal_at column if table exists but column doesn't
  // Skip if table doesn't exist - CACHE_SCHEMA_V1 will create it with the column
  if (tableExists(db, 'tasks_current') && !columnExists(db, 'tasks_current', 'terminal_at')) {
    db.exec(ADD_TERMINAL_AT_COLUMN);
  }

  // Index creation is handled by CACHE_SCHEMA_V1 (uses IF NOT EXISTS)
  // Only create here if table already exists with the column
  if (columnExists(db, 'tasks_current', 'terminal_at')) {
    db.exec(CREATE_TERMINAL_AT_INDEX);
  }

  // Migration V3: Add agent ownership column and backfill from legacy assignee.
  if (tableExists(db, 'tasks_current') && !columnExists(db, 'tasks_current', 'agent')) {
    db.exec(ADD_AGENT_COLUMN);
  }

  if (columnExists(db, 'tasks_current', 'agent') && columnExists(db, 'tasks_current', 'assignee')) {
    db.exec(BACKFILL_AGENT_FROM_ASSIGNEE);
  }

  if (columnExists(db, 'tasks_current', 'agent')) {
    db.exec(CREATE_AGENT_INDEX);
  }

  // Migration V4: durable foundation tables for hooks/workflow idempotency.
  // These are safe to run on every startup.
  db.exec(ENSURE_HOOK_AND_WORKFLOW_TABLES);
  db.exec(ENSURE_HOOK_AND_WORKFLOW_INDEXES);
}
