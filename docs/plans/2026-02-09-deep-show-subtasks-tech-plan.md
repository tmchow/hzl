# Deep Show Subtasks - Technical Plan

**Date:** 2026-02-09
**Status:** Planning
**PRD:** `docs/prd/2026-02-09-deep-show-subtasks-prd.md`

## Overview

Two changes to `hzl task show`:

1. **Backfill parent task fields** — Add the five `Task` interface fields currently omitted from `ShowResult.task` (`links`, `due_at`, `metadata`, `claimed_at`, `lease_until`). This benefits all `task show --json` calls regardless of `--deep`.
2. **Add `--deep` flag** — Expand subtask data from the current summary (`{task_id, title, status}`) to full `Task` fields plus a computed `blocked_by` array in JSON mode.

The implementation is straightforward because `getSubtasks()` already returns full `Task[]` objects — the CLI layer currently discards fields by mapping to the summary shape in `runShow()`. The only genuinely new query work is fetching `blocked_by` data for subtask IDs in a batched manner.

## Architecture

```
CLI (show.ts)                          Core (task-service.ts)
┌──────────────────────┐              ┌─────────────────────────┐
│ createShowCommand()  │              │ getTaskById()           │
│   --deep flag added  │──────────────│ getSubtasks()           │ ← already returns Task[]
│                      │              │ getBlockedByForTasks()  │ ← NEW: batched blocked_by
│ runShow()            │              │ getComments()           │
│   deep param added   │              │ getCheckpoints()        │
│   ShowResult updated │              └─────────────────────────┘
└──────────────────────┘

Data flow with --deep --json:
1. getTaskById(id)             → Task (full fields, already works)
2. getSubtasks(id)             → Task[] (full fields, already works)
3. getBlockedByForTasks(ids)   → Map<taskId, depIds[]> (NEW)
4. Compose: merge Task[] + blocked_by map → expanded subtask array
5. JSON.stringify(result)
```

Key decisions:
- **New standalone method `getBlockedByForTasks()`** rather than modifying `getBlockedByMap()`. The existing method filters to `ready` status and is used by the web dashboard — changing it risks breaking that caller. The new method takes explicit task IDs and uses a blacklist filter: exclude subject tasks with status `done` or `archived` (the two terminal statuses). This means `backlog`, `ready`, `in_progress`, and `blocked` subtasks all get `blocked_by` computed.
- **`ShowResult.task` becomes `Task` type directly** rather than maintaining a separate inline type. The `Task` type is already exported from `hzl-core` and the inline type is a strict subset. This eliminates the field-cherry-picking code and prevents future drift. Note: `Task.status` is `TaskStatus` (enum) while the current inline type has `status: string` — this is fine because `TaskStatus` values serialize to strings in JSON.
- **`ShowResult.subtasks` becomes a union type** — `Array<SubtaskSummary> | Array<DeepSubtask> | undefined` where `DeepSubtask = Task & { blocked_by: string[] }` and `SubtaskSummary = { task_id: string; title: string; status: string }`. Both are named types for clarity. Consumers can detect the deep variant by checking whether the first subtask element has a `blocked_by` property.

## Delivery Plan

One PR with 3 commits, ordered:
1. **1.1** — Add `getBlockedByForTasks()` to core (independent)
2. **1.2** — Backfill parent task fields in `ShowResult` (independent of 1.1, but committed second for clean PR history)
3. **1.3** — Add `--deep` flag and wire up expanded output (depends on both 1.1 and 1.2)

---

## 1. Task Show Improvements

### 1.1 Add batched blocked-by lookup to TaskService

**Depends on:** none
**Files:** `packages/hzl-core/src/services/task-service.ts`, `packages/hzl-core/src/services/task-service.test.ts`

Add a `getBlockedByForTasks(taskIds: string[]): Map<string, string[]>` method to `TaskService`. Query `task_dependencies` joined with `tasks_current` to find incomplete dependencies for the given task IDs. Use parameterized `IN (?, ?, ...)` clause — same pattern as `getTaskTitlesByIds()`.

Use a blacklist filter: exclude subject tasks with status `done` or `archived`. This is the SQL pattern:

```sql
SELECT td.task_id, GROUP_CONCAT(td.depends_on_id) as blocked_by
FROM task_dependencies td
JOIN tasks_current subj ON td.task_id = subj.task_id
JOIN tasks_current dep ON td.depends_on_id = dep.task_id
WHERE td.task_id IN (?, ?, ...)
  AND subj.status NOT IN ('done', 'archived')
  AND dep.status != 'done'
GROUP BY td.task_id
```

Return a `Map` keyed by task ID. Contract: absent keys mean zero blockers (whether the task has no deps or all deps are done). Since the caller (`runShow`) pre-validates task IDs via `getSubtasks()`, absent-vs-unknown ambiguity is harmless.

**Test scenarios:** (`packages/hzl-core/src/services/task-service.test.ts`)
- Empty input array → empty map
- Task IDs with no dependencies → empty map (keys absent)
- Task with incomplete dependencies → map contains task_id → [dep_id1, dep_id2]
- Task where all dependencies are `done` → key absent from map
- Mix of blocked and unblocked tasks in single call → only blocked ones in map
- Task in `done` status with incomplete deps → key absent (terminal status excluded)
- Task in non-terminal status (`ready`, `in_progress`, `blocked`) with incomplete deps → included

**Verify:** `pnpm --filter hzl-core test src/services/task-service.test.ts`

### 1.2 Backfill parent task fields in ShowResult

**Depends on:** none
**Files:** `packages/hzl-cli/src/commands/task/show.ts`, `packages/hzl-cli/src/commands/task/show.test.ts`

Update `ShowResult.task` from the current inline type (12 fields) to the full `Task` interface (17 fields). The five missing fields are: `links`, `due_at`, `metadata`, `claimed_at`, `lease_until`. These are always-present (value is `null`, `[]`, or `{}` when empty).

Approach: import `Task` from `hzl-core` and use it as the type for `ShowResult.task`. Replace the field-cherry-picking code in the `result` object construction in `runShow()` with a direct spread or assignment from the `Task` object returned by `getTaskById()`. This eliminates the maintenance burden of keeping the inline type in sync.

Define named types at the top of `show.ts` for the subtask shapes: `SubtaskSummary` (current `{task_id, title, status}`) and `DeepSubtask` (full `Task & { blocked_by: string[] }`). Update `ShowResult.subtasks` to be `Array<SubtaskSummary> | Array<DeepSubtask> | undefined`.

The human-readable output section stays unchanged — it already reads from the `task` variable directly, not from `result.task`.

`ShowResult` is only imported in `show.test.ts` — no other consumers to worry about.

This is a separate commit from the `--deep` flag (per PRD). Satisfies R3.

**Test scenarios:** (`packages/hzl-cli/src/commands/task/show.test.ts`)
- Existing tests continue to pass (backward compat — no test should break from adding fields)
- New test: `ShowResult.task` includes `links` field (empty array `[]` for task with no links)
- New test: `ShowResult.task` includes `metadata` field (empty object `{}` for task with no metadata)
- New test: `ShowResult.task` includes `due_at` field (`null` when not set)
- New test: `ShowResult.task` includes `claimed_at` and `lease_until` fields (`null` when not set)
- Task with links set → `links` array contains the values

**Verify:** `pnpm --filter hzl-cli test src/commands/task/show.test.ts`

### 1.3 Add `--deep` flag and wire up expanded subtask output

**Depends on:** 1.1, 1.2
**Files:** `packages/hzl-cli/src/commands/task/show.ts`, `packages/hzl-cli/src/commands/task/show.test.ts`

Add `--deep` option to `createShowCommand()`. Pass the `deep` flag through to `runShow()` as a new option parameter.

In `runShow()`, when `deep` is true and `showSubtasks` is true:
1. Fetch subtasks via `getSubtasks()` (returns `Task[]` — already has all fields)
2. Extract subtask IDs, call `getBlockedByForTasks()` to get blocked-by map
3. Compose each subtask: spread the `Task` fields, add `blocked_by` from the map (default to `[]` if absent)
4. Use `DeepSubtask[]` as the subtask array type

When `deep` is false (or absent): keep the existing summary mapping (`SubtaskSummary[]`).

When `showSubtasks` is false (`--no-subtasks`): subtasks is `undefined` regardless of `--deep`. This satisfies R6 — `--no-subtasks` takes precedence.

When not in JSON mode: `--deep` is silently ignored — the human-readable output code reads from the `task` and `subtasks` variables directly and only uses `task_id`, `title`, `status` for subtask display. The deep data is in the `result` object but never rendered. Satisfies R4.

**Test scenarios:** (`packages/hzl-cli/src/commands/task/show.test.ts`)
- `--deep` with parent that has subtasks → subtasks array contains full Task fields + `blocked_by`
- `--deep` with subtask that has incomplete dependency → `blocked_by` contains the dep ID
- `--deep` with subtask where all deps are done → `blocked_by` is `[]`
- `--deep` with subtask in `done` status with incomplete deps → `blocked_by` is `[]`
- `--deep` on task with no subtasks → `subtasks` is `[]`
- `--deep` on a child task (not a parent) → `subtasks` is `[]`
- `--deep` with `--no-subtasks` → `subtasks` is `undefined` (R6)
- Without `--deep` → subtasks remain summary shape `{task_id, title, status}` (backward compat)
- `--deep` without `--json` → result still has deep data in the return value but human output is unchanged

**Verify:** `pnpm --filter hzl-cli test src/commands/task/show.test.ts`

---

## Documentation Updates

Per AGENTS.md "Documentation to Update When CLI Changes" checklist, the `--deep` flag requires updates to:

| Document | Path | What to update |
|----------|------|----------------|
| README | `README.md` | Add `--deep` to CLI reference section |
| Agent guide snippet | `snippets/HZL-GUIDE.md` | Add `--deep` usage example |
| Claude Code skill | `skills/hzl/SKILL.md` | Add `--deep` scenario and example |
| OpenClaw skill | `openclaw/skills/hzl/SKILL.md` | Add `--deep` to quick reference |
| Docs site - Tasks | `docs-site/concepts/tasks.md` | Add `--deep` flag documentation |

These updates should be done as part of the PR, after the implementation subtasks are complete.

## Testing Strategy

- **Unit tests (core):** `task-service.test.ts` — test `getBlockedByForTasks()` in isolation with various dependency/status combinations
- **Unit tests (CLI):** `show.test.ts` — test `runShow()` with `deep` option, verifying JSON output shape and flag interactions
- **Manual verification:** Build and run CLI against dev database:
  ```bash
  pnpm build
  node packages/hzl-cli/dist/cli.js task add "Parent" -p demo
  node packages/hzl-cli/dist/cli.js task add "Child" -p demo --parent <parent_id>
  node packages/hzl-cli/dist/cli.js task show <parent_id> --deep --json | jq .
  ```
  Verify: parent has all 17 fields, subtask has all 17 fields + `blocked_by`, human-readable output unchanged without `--json`

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `ShowResult.task` type change breaks downstream consumers | Additive change only — new fields added, none removed. `ShowResult` is only imported in `show.test.ts`. Existing tests verify backward compat |
| `getBlockedByForTasks()` query performance with many subtasks | Single query with IN clause, same pattern as `getTaskTitlesByIds()` which is already in production. HZL tasks rarely have >20 subtasks |
| `status: string` vs `TaskStatus` enum mismatch in JSON | `TaskStatus` enum values are string literals (`'backlog'`, `'ready'`, `'in_progress'`, `'blocked'`, `'done'`, `'archived'`) — JSON serialization is identical. No breaking change |

## Open Questions

None — all decisions resolved.
