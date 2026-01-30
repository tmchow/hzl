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
