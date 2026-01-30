# HZ Agent Ledger - Design Document

## Overview

HZ Agent Ledger (`hzl`) is a task coordination system for AI agent swarms. It provides the primitives for tracking work, claiming tasks, and recording progress - without any intelligence about what the work actually is.

**Core principle:** The ledger is a dumb coordination store. It does not orchestrate, decompose tasks, or understand work. Agents and humans use it to coordinate; the smarts live outside.

### Goals

- Provide a durable, local source of truth for task state and history (no network dependency).
- Support safe concurrent access from many agent processes.
- Make it easy for humans to observe, steer, and audit agent work.
- Stay fast and predictable as event volume grows.

### Non-goals

- Task decomposition, prioritization strategy, scheduling, routing, or assignment.
- Automatically deciding what an agent should work on next beyond explicit deterministic selection rules.
- Domain-specific meaning of `metadata` beyond basic validation.

### Invariants

- Events are immutable once written.
- Current task state is a deterministic projection of events.
- The ledger may enforce data integrity constraints (valid JSON, no dependency cycles, valid status values), but it does not make "what work should be done" decisions.

## Core Concepts

### Tasks

Lightweight work items with:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier (opaque string; generated as ULID by default, accepts UUID) |
| `title` | Short description |
| `project` | Which project this belongs to (default: `inbox`) |
| `status` | Current state: `backlog`, `ready`, `in_progress`, `done`, `archived` |
| `parent_id` | Optional, for subtask hierarchy |
| `description` | Optional inline text (soft limit: 500 chars, warn if exceeded) |
| `links` | Optional array of URI strings (paths, file:// URIs, or https:// URLs) |
| `depends_on` | List of task IDs that must complete first |
| `tags` | Optional array of strings for filtering/grouping (no semantics enforced) |
| `priority` | Optional integer for simple ordering (0..3, default 0). No semantics beyond sorting. |
| `due_at` | Optional ISO-8601 datetime, informational only |
| `metadata` | Flexible JSON blob for arbitrary data |
| `created_at` | System timestamp (derived from first event) |
| `updated_at` | System timestamp (derived from last event) |

**Links format**

`links` is a simple array of URI strings:

```json
["docs/spec.md", "https://example.com/design", "./relative/path.md"]
```

Can be relative paths, absolute paths, `file://` URIs, or `https://` URLs. If you need metadata about a link, use the task's `metadata` field.

### Events

Every change is recorded as an append-only event:

**Event envelope (consistent across all event types)**

| Field | Description |
|------|-------------|
| `event_id` | Unique idempotency key (ULID recommended) |
| `task_id` | Task identifier |
| `type` | Event type |
| `data` | JSON payload specific to the type |
| `author` | Human-friendly actor name (optional) |
| `agent_id` | Stable identifier of the agent (optional) |
| `session_id` | Identifier for a single agent run/session (optional) |
| `correlation_id` | Groups related events across tasks (optional) |
| `causation_id` | Points to the event that caused this one (optional) |
| `timestamp` | Event time (UTC) |

| Event Type | Data Payload |
|------------|--------------|
| `task_created` | `{title, project, parent_id, description?, links?, depends_on?, tags?, priority?, due_at?, metadata?}` |
| `status_changed` | `{from, to, reason?}` |
| `task_moved` | `{from_project, to_project}` |
| `dependency_added` | `{depends_on_id}` |
| `dependency_removed` | `{depends_on_id}` |
| `task_updated` | `{field, old_value, new_value}` |
| `task_archived` | `{reason}` |
| `comment_added` | `{text}` |
| `checkpoint_recorded` | `{name, data?}` |

Events are the source of truth. Current state is derived by applying events and is also maintained in rebuildable projections for fast reads.

### Task Availability

A task is "claimable" when:
1. Its status is `ready`
2. All tasks in its `depends_on` list have status `done`

### Next Task Selection (Convenience)

To reduce duplicated logic across agents, the CLI provides deterministic work discovery.

`hzl next` and `hzl claim-next` consider tasks that are claimable (see above), then select using:

1. Higher `priority` first (DESC)
2. Older tasks first (FIFO tie-break within a priority band)
3. Stable final tie-break by `id`

This is intentionally a convenience policy, not orchestration. Agents may still claim a specific task by ID.

### Checkpoint-Based Recovery

Agents can recover work without heartbeats via two mechanisms:

1. **Subtasks** (task hierarchy via `parent_id`) for discrete, independently claimable units of work.
2. **Checkpoints** (lightweight events) for incremental progress on a task without creating subtasks.

If an agent crashes, another agent can:
- read the most recent checkpoint(s) and continue, or
- claim the next incomplete subtask.

No heartbeat requirement. The ledger records state and checkpoints; agents decide how to use them.

## Technology

- **Language:** TypeScript/Node
- **Storage:** SQLite (append-only event store)
- **Core:** `hzl-core` library (shared business logic)
- **Interface:** CLI (`hzl`)
- **Location:** `~/.hzl/data.db` (global, single ledger for all projects)

## Data Model

### Schema

```sql
-- Schema versioning (migrations)
CREATE TABLE schema_migrations (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT NOT NULL
);

-- Append-only event store (source of truth)
CREATE TABLE events (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id         TEXT NOT NULL UNIQUE,  -- idempotency key (ULID)
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

-- Current-state projection for fast reads (rebuildable from events)
CREATE TABLE tasks_current (
    task_id       TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    project       TEXT NOT NULL,
    status        TEXT NOT NULL,
    parent_id     TEXT,
    description   TEXT,
    links         TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(links)),
    tags          TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
    priority      INTEGER NOT NULL DEFAULT 0,
    due_at        TEXT,
    metadata      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    last_event_id INTEGER NOT NULL
);

-- Dependency edges for fast availability checks (rebuildable from events)
CREATE TABLE task_dependencies (
    task_id        TEXT NOT NULL,
    depends_on_id  TEXT NOT NULL,
    PRIMARY KEY (task_id, depends_on_id)
);

CREATE INDEX idx_events_task_id ON events(task_id);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_events_correlation_id ON events(correlation_id);

CREATE INDEX idx_tasks_current_project_status ON tasks_current(project, status);
CREATE INDEX idx_tasks_current_priority ON tasks_current(project, priority, created_at);

CREATE INDEX idx_deps_depends_on ON task_dependencies(depends_on_id);
```

### SQLite operational defaults

On init/open:

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
```

### Why Append-Only

- Full audit trail preserved
- Can reconstruct any point in time
- Analytics-friendly (time in each status, durations, Gantt charts)
- No accidental data loss

Projections (`tasks_current`, `task_dependencies`) provide fast reads without sacrificing auditability. They are rebuildable from the append-only event store.

## CLI Interface

### Task Management

```bash
hzl add "Task title" [--project <name>] [--parent <id>] [--desc "..."] [--link <uri>]... [--depends <id,...>] [--priority <0..3>] [--tag <tag>]... [--due <iso8601>] [--meta '{"key":"value"}']
hzl list [--project <name>] [--status <status>] [--parent <id>] [--available] [--tag <tag>]...
hzl show <id>                    # Current state + recent history + comments + checkpoints
hzl history <id>                 # Full event history for a task
hzl move <id> --project <name>   # Move task to different project
hzl update <id> --field <k> --value <v>   # Field update (emits task_updated)
hzl next [--project <name>] [--tag <tag>]...
hzl claim-next [--project <name>] [--tag <tag>]... [--author <name>] [--agent <id>]
```

### Status Transitions

```bash
hzl claim <id> [--author <name>] [--agent <id>] [--lease <minutes>]   # Mark in_progress, record who claimed
hzl complete <id>                   # Mark done
hzl set-status <id> <status>        # General status change
hzl archive <id>                    # Soft delete
hzl release <id> [--reason "..."]   # Move back to ready (unstick work)
hzl reopen <id> [--to ready|backlog]
hzl steal <id> [--if-expired] [--force]
hzl stuck [--project <name>] [--older-than <duration>]
```

### Dependencies

```bash
hzl add-dep <task_id> <depends_on_id>
hzl remove-dep <task_id> <depends_on_id>
hzl validate [--project <name>]         # Cycles, missing tasks, invalid states
```

**Integrity rules**

- No self-dependencies (task_id != depends_on_id)
- No dependency cycles (enforced at write time when possible, checkable via `hzl validate`)

### Comments (Steering)

```bash
hzl comment <id> "text" [--author <name>]
```

### Checkpoints (Recovery)

```bash
hzl checkpoint <id> "<name>" [--data '{"key":"value"}'] [--author <name>] [--agent <id>]
hzl checkpoints <id>
```

### Projects

```bash
hzl projects                     # List all projects
hzl rename-project <old> <new>   # Rename a project
```

### Analytics

```bash
hzl stats [--project <name>] [--task <id>]
```

### Utility

```bash
hzl init                         # Initialize new ledger database
hzl which-db                     # Show resolved database path
hzl backup [--out <path>]        # Create a consistent backup copy
hzl restore <path>               # Restore from a backup copy
hzl export [--jsonl]             # Export events/tasks for external tooling
hzl import <path>                # Import events (idempotent via event_id)
hzl doctor                       # integrity_check + projection consistency
hzl rebuild                      # Rebuild projections from events
hzl compact                      # VACUUM / optimize
```

### Output Format

- Default: human-readable text
- `--json` flag on any command: structured JSON for programmatic use

### Environment Variables

| Variable | Description |
|----------|-------------|
| `HZL_AUTHOR` | Default author for `claim` and `comment` commands |
| `HZL_AGENT_ID` | Default agent identifier |
| `HZL_DB` | Override database location (default: `~/.hzl/data.db`) |
| `HZL_LEASE_MINUTES` | Default lease duration for claims |

## Atomic Claiming

SQLite transactions prevent race conditions:

```sql
BEGIN IMMEDIATE;
-- Check if task is claimable
-- If yes, insert status_changed event
COMMIT;
```

Second agent's transaction blocks until first completes. By then, task is already claimed.

### Atomic claim-next (pick + claim)

`hzl claim-next` MUST select and claim in the same transaction to avoid two agents picking the same task:

```sql
BEGIN IMMEDIATE;
-- Select best claimable task per Next Task Selection policy
-- If a candidate exists:
--   insert status_changed event for that task (ready -> in_progress)
COMMIT;
```

### Claim leases (optional)

- Claims may include a `lease_until` timestamp (derived from `--lease`).
- `steal --if-expired` only succeeds if the lease is expired.
- This is a robustness mechanism, not a heartbeat system.

## Web App Integration

```
┌─────────────────┐     ┌─────────────┐     ┌─────────────┐
│   Web Browser   │────▶│  Web Server │────▶│  hzl-core   │
│   (Dashboard)   │◀────│  (Node.js)  │◀────│  library    │
└─────────────────┘     └─────────────┘     └─────────────┘
                                                   │
                                            ┌──────▼──────┐
                                            │   SQLite    │
                                            │  (events)   │
                                            └─────────────┘
```

- Web server calls `hzl-core` directly (no per-request process spawn)
- CLI also calls `hzl-core` (single source of truth for business logic)

### Dashboard Features

- Kanban view: columns for backlog, ready, in_progress, done
- Task detail panel with history timeline
- Project switcher
- Filtering (tags, status, priority)
- "Next up" view using the same deterministic policy as `hzl next`
- Task detail panel shows comments and checkpoints
- Stuck tasks view (in_progress older than threshold)
- Analytics (durations, throughput) derived from events
- Human can add tasks, steering comments, and unstick work via release/steal/reopen when needed

## Projects

- Tasks belong to a project
- Default project: `inbox` (used when `--project` omitted)
- Projects are created implicitly when first task uses them
- `hzl rename-project` for renaming (external tooling can provide smart auto-naming)

## File Structure

```
~/.hzl/
├── data.db              # Single global ledger
└── config.json          # Optional global defaults
```

## Human-Agent Interaction Model

- Human role: observer with limited intervention
- Human can add items to task backlog via CLI or web app
- Human can add steering comments during task execution
- Agents handle all task claiming and status updates
- No human interference with task progression
- Humans can unstick work via release/steal/reopen when an agent crashes or a task becomes stale

## Deliverables

1. **`hzl-core`** - Shared TypeScript library (DB, events, projections, validation)
2. **`hzl` CLI** - Thin wrapper over `hzl-core`
3. **Web dashboard** - Kanban board, analytics, comment interface (uses `hzl-core`)
4. **Migrations + tooling** - schema migrations, projection rebuild, backup/restore, export/import, doctor
5. **Claude Code skill** - Teaches agents how to use `hzl` (separate deliverable)
