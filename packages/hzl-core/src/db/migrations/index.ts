/**
 * Cache database migrations.
 *
 * These migrations handle schema changes to the cache database (tasks_current, etc.)
 * which stores projections derived from events.
 */

import type Database from 'libsql';
import { ADD_TERMINAL_AT_COLUMN, CREATE_TERMINAL_AT_INDEX } from './v2.js';
import { ADD_AGENT_COLUMN, BACKFILL_AGENT_FROM_ASSIGNEE, CREATE_AGENT_INDEX } from './v3.js';

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
}
