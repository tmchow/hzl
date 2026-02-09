# Deep Show Subtasks - PRD

**Date:** 2026-02-09
**Status:** Brainstorming

## Goal

Enable agents to get complete context on a parent task and all its children in a single `hzl task show --deep --json` call, avoiding N+1 CLI invocations and reducing token overhead. The primary consumer is coding agents using `--json` output.

## Scope

### In Scope

- Add `--deep` flag to `hzl task show`
- When `--deep` is active in JSON mode, expand each subtask from the current summary (`{task_id, title, status}`) to all `Task` interface fields (as shown in the example JSON below) plus a computed `blocked_by` array — excluding comments and checkpoints
- Backfill the parent task in `ShowResult.task` to include all `Task` interface fields (currently missing: `links`, `due_at`, `metadata`, `claimed_at`, `lease_until`). This applies to all `task show --json` calls regardless of `--deep` and should be a separate commit
- Fetch `blocked_by` data for subtasks via a batched query (the only genuinely new query; `getSubtasks()` already returns full `Task[]` objects)

### Boundaries

- **No human-readable changes** — `--deep` only affects JSON output. See R3.
- **Single-level nesting** — HZL enforces single-level parent-child nesting, so `--deep` always expands one level.
- **No comments or checkpoints on subtasks** — Excluded from expanded subtask data. Simplicity choice — easier to add later if needed than to remove. Agents can call `task show` on individual subtasks if they need these.
- **No new error handling** — `--deep` does not change error paths. Task not found still returns the existing error. `--deep` on a child task returns `subtasks: []` per R4.

## Requirements

### Core

R1. `hzl task show <id> --deep --json` returns all `Task` interface fields for each subtask (the 17 fields shown in the example JSON below).

R2. Each expanded subtask includes a computed `blocked_by: string[]` listing incomplete dependency task IDs. `blocked_by` is computed for subtasks in non-terminal statuses (`backlog`, `ready`, `in_progress`, `blocked`). For `done`/`archived` subtasks, `blocked_by` is `[]`.

### Must-Have

R3. The parent task in `ShowResult.task` includes all `Task` interface fields. The five currently missing fields (`links`, `due_at`, `metadata`, `claimed_at`, `lease_until`) are added as always-present fields (value is `null` or `{}` when empty). This is an additive, non-breaking change.

R4. When `--deep` is used without `--json`, output is identical to omitting `--deep`.

R5. When `--deep` is used on a task with no subtasks (or a child task), `subtasks` is an empty array `[]`.

R6. When `--deep` and `--no-subtasks` are both passed, `--no-subtasks` takes precedence — the `subtasks` key is omitted from JSON output (existing behavior when `--no-subtasks` is used).

### Out

R7. Expanding comments or checkpoints on subtasks — agents rarely need comment history for decision-making. Agents can call `task show` individually if needed.

R8. Human-readable formatting of expanded subtask data — primary consumer is agents using JSON.

## Example JSON Output

With `--deep --json`, the response shape:

```json
{
  "task": {
    "task_id": "abc-123",
    "title": "Implement auth module",
    "project": "backend",
    "status": "in_progress",
    "priority": 1,
    "parent_id": null,
    "description": "Build the authentication module",
    "links": ["https://github.com/org/repo/issues/42"],
    "tags": ["auth", "security"],
    "due_at": null,
    "metadata": {},
    "claimed_at": "2026-02-09T08:00:00Z",
    "assignee": "agent-1",
    "progress": 50,
    "lease_until": null,
    "created_at": "2026-02-09T07:00:00Z",
    "updated_at": "2026-02-09T08:30:00Z"
  },
  "comments": [
    { "text": "Starting work", "author": "agent-1", "timestamp": "2026-02-09T08:00:00Z" }
  ],
  "checkpoints": [],
  "subtasks": [
    {
      "task_id": "def-456",
      "title": "Add JWT validation",
      "project": "backend",
      "status": "ready",
      "priority": 1,
      "parent_id": "abc-123",
      "description": "Validate JWT tokens on incoming requests",
      "links": [],
      "tags": ["auth"],
      "due_at": null,
      "metadata": {},
      "claimed_at": null,
      "assignee": null,
      "progress": null,
      "lease_until": null,
      "created_at": "2026-02-09T07:00:00Z",
      "updated_at": "2026-02-09T07:00:00Z",
      "blocked_by": ["ghi-789"]
    }
  ]
}
```

Without `--deep`, subtasks remain the existing summary shape:

```json
{
  "subtasks": [
    { "task_id": "def-456", "title": "Add JWT validation", "status": "ready" }
  ]
}
```

## Next Steps

-> Create technical plan (includes TypeScript typing strategy, method signatures, test scenarios, and documentation updates per AGENTS.md checklist)
