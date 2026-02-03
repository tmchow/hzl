// Schema for events.db (source of truth)
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
    status             TEXT NOT NULL CHECK (status IN ('backlog','ready','in_progress','blocked','done','archived')),
    parent_id          TEXT,
    description        TEXT,
    links              TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(links)),
    tags               TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
    priority           INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 3),
    due_at             TEXT,
    metadata           TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
    claimed_at         TEXT,
    assignee           TEXT,
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

CREATE INDEX IF NOT EXISTS idx_projects_protected ON projects(is_protected);

-- Indexes for tasks_current
CREATE INDEX IF NOT EXISTS idx_tasks_current_project_status ON tasks_current(project, status);
CREATE INDEX IF NOT EXISTS idx_tasks_current_status ON tasks_current(status);
CREATE INDEX IF NOT EXISTS idx_tasks_current_priority ON tasks_current(project, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_current_claim_next ON tasks_current(project, status, priority DESC, created_at ASC, task_id ASC);
CREATE INDEX IF NOT EXISTS idx_tasks_current_stuck ON tasks_current(project, status, claimed_at);
CREATE INDEX IF NOT EXISTS idx_tasks_current_parent ON tasks_current(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_current_terminal_at ON tasks_current(terminal_at);

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
