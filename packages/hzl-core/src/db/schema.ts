// Schema for events.db (source of truth)
export const EVENTS_SCHEMA_V2 = `
-- Append-only event store (source of truth)
CREATE TABLE IF NOT EXISTS events (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id         TEXT NOT NULL UNIQUE,
    task_id          TEXT NOT NULL,
    type             TEXT NOT NULL,
    data             TEXT NOT NULL CHECK (json_valid(data)),
    schema_version   INTEGER NOT NULL DEFAULT 1,
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
    status             TEXT NOT NULL CHECK (status IN ('backlog','ready','in_progress','blocked','done','archived')),
    parent_id          TEXT,
    description        TEXT,
    links              TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(links)),
    tags               TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
    priority           INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 3),
    due_at             TEXT,
    metadata           TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
    claimed_at         TEXT,
    agent             TEXT,
    progress           INTEGER CHECK (progress >= 0 AND progress <= 100),
    lease_until        TEXT,
    terminal_at        TEXT,
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
    description,
    tags
);

-- Projects table (projection from events)
CREATE TABLE IF NOT EXISTS projects (
    name TEXT PRIMARY KEY,
    description TEXT,
    is_protected INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_event_id INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_protected ON projects(is_protected);

-- Durable hook delivery outbox (not rebuildable)
CREATE TABLE IF NOT EXISTS hook_outbox (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    hook_name           TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','delivered','failed')),
    url                 TEXT NOT NULL,
    headers             TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(headers)),
    payload             TEXT NOT NULL CHECK (json_valid(payload)),
    attempts            INTEGER NOT NULL DEFAULT 0,
    next_attempt_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    processing_started_at TEXT,
    delivered_at        TEXT,
    failed_at           TEXT,
    lock_token          TEXT,
    locked_by           TEXT,
    lock_expires_at     TEXT,
    last_error          TEXT,
    error_payload       TEXT CHECK (error_payload IS NULL OR json_valid(error_payload)),
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Workflow idempotency cache (not rebuildable)
CREATE TABLE IF NOT EXISTS workflow_ops (
    op_id               TEXT PRIMARY KEY,
    workflow_name       TEXT NOT NULL,
    input_hash          TEXT NOT NULL,
    state               TEXT NOT NULL CHECK (state IN ('processing','completed','failed')),
    result_payload      TEXT CHECK (result_payload IS NULL OR json_valid(result_payload)),
    error_payload       TEXT CHECK (error_payload IS NULL OR json_valid(error_payload)),
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Indexes for tasks_current
CREATE INDEX IF NOT EXISTS idx_tasks_current_project_status ON tasks_current(project, status);
CREATE INDEX IF NOT EXISTS idx_tasks_current_status ON tasks_current(status);
CREATE INDEX IF NOT EXISTS idx_tasks_current_priority ON tasks_current(project, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_current_claim_next ON tasks_current(project, status, priority DESC, created_at ASC, task_id ASC);
CREATE INDEX IF NOT EXISTS idx_tasks_current_stuck ON tasks_current(project, status, claimed_at);
CREATE INDEX IF NOT EXISTS idx_tasks_current_parent ON tasks_current(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_current_terminal_at ON tasks_current(terminal_at);
CREATE INDEX IF NOT EXISTS idx_tasks_current_due_at ON tasks_current(due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_current_agent ON tasks_current(agent);

-- Indexes for dependencies
CREATE INDEX IF NOT EXISTS idx_deps_depends_on ON task_dependencies(depends_on_id);

-- Indexes for tags/comments/checkpoints
CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags(tag, task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id, event_rowid);
CREATE INDEX IF NOT EXISTS idx_task_checkpoints_task ON task_checkpoints(task_id, event_rowid);

-- Indexes for hook/workflow foundations
CREATE INDEX IF NOT EXISTS idx_hook_outbox_drain ON hook_outbox(status, next_attempt_at, id);
CREATE INDEX IF NOT EXISTS idx_hook_outbox_lock ON hook_outbox(status, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_hook_outbox_hook_status ON hook_outbox(hook_name, status, id);
CREATE INDEX IF NOT EXISTS idx_workflow_ops_workflow_state ON workflow_ops(workflow_name, state, updated_at);
CREATE INDEX IF NOT EXISTS idx_workflow_ops_workflow_input ON workflow_ops(workflow_name, input_hash);
`;

export const PRAGMAS = `
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
`;
