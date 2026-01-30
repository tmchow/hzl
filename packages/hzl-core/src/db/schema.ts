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
    description
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
