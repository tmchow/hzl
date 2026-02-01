# Parent/Subtask CLI Support Design

**Date:** 2026-02-01
**Status:** Draft (Revised after review)
**Branch:** feat/parent-id-cli

## Overview

Expose the existing `parent_id` data model field through the CLI, enabling hierarchical task organization. The hierarchy is purely organizational - no automatic status propagation between parent and child tasks.

## Use Cases

- Breaking down large tasks into smaller, independently claimable pieces
- Organizing related work under a common parent
- Filtering to see all subtasks of a specific task
- Scoping `hzl task next` to a specific parent's subtasks

## Design Decisions

### Hierarchy Behavior

- **Purely organizational** - parent/child status is independent
- No automatic completion of parent when children complete
- No status propagation in either direction
- **Maximum 1 level of nesting** - subtasks cannot have their own subtasks (no grandchildren)
- **Parent tasks are not "workable"** - they are organizational containers; actual work happens on subtasks

### Hierarchy Depth Limit

Tasks can only be one level deep:
- A task can have a parent (becoming a subtask)
- A task with children (a parent) cannot itself have a parent
- Error if attempting to create grandchild relationships

```bash
# Valid: Create subtask
hzl task add "Subtask" --parent abc123  # OK

# Invalid: abc123 already has a parent
hzl task add "Grandchild" --parent abc123
# ERROR: Cannot create subtask of a subtask (max 1 level of nesting)
```

### Project Constraints

- Subtasks must be in the same project as their parent
- When setting a parent:
  - Project is always inherited from parent (any `--project` flag is ignored when `--parent` is specified)
- When removing parent (`--parent ""`): task stays in current project
- When moving parent to new project: subtasks cascade (move with parent)

### Task Availability (`hzl task next`)

**Parent tasks are never returned by `hzl task next`.** They are organizational containers, not actionable work.

A task is available for `hzl task next` when:
1. Status is `ready`
2. All dependencies are `done`
3. **Task has no children** (is a leaf task)

This means:
- Standalone tasks (no parent, no children): Can be returned
- Subtasks (has parent, no children): Can be returned
- Parent tasks (has children): Never returned

### Archive Behavior

When archiving a parent task with active subtasks (non-archived, non-done), require explicit action:

```bash
$ hzl task archive parent123
Error: Task parent123 has 3 active subtasks.
Use --cascade to archive parent and all subtasks.
Use --orphan to archive parent only (subtasks become top-level).

$ hzl task archive parent123 --cascade
✓ Archived task parent123 and 3 subtasks

$ hzl task archive parent123 --orphan
✓ Archived task parent123
✓ 3 subtasks promoted to top-level
```

If no active subtasks (all done or already archived), archive normally without flags.

### Display

- Flat list by default (no tree view)
- Filter by parent via `--parent <id>` flag
- Filter for root tasks via `--root` flag
- `parent_id` included in JSON output
- `hzl task show` displays subtasks inline (suppressible with `--no-subtasks`)

## CLI Changes

### `hzl task add`

New option: `--parent <task_id>`

```bash
# Create a subtask (project inherited from parent)
hzl task add "Add login endpoint" --parent abc123

# --project is ignored when --parent is specified
hzl task add "Add logout endpoint" --parent abc123 -P other
# Creates subtask in abc123's project, not "other"
```

Validation:
- Parent must exist
- Parent must not be archived
- Parent must not itself have a parent (max 1 level)

### `hzl task update`

New option: `--parent <task_id>`

```bash
# Set parent (task moves to parent's project)
hzl task update def456 --parent abc123

# Change parent (task moves to new parent's project)
hzl task update def456 --parent xyz789

# Remove parent (task stays in current project)
hzl task update def456 --parent ""
```

Validation:
- Parent must exist
- Parent must not be archived
- Cannot set self as parent
- Parent must not itself have a parent (max 1 level)
- Task being updated must not have children (can't make a parent into a subtask)

### `hzl task list`

New options: `--parent <task_id>`, `--root`

```bash
# Filter to subtasks of a specific task
hzl task list --parent abc123

# Filter to root tasks only (no parent)
hzl task list --root

# Combine with other filters
hzl task list --root --status ready
hzl task list --parent abc123 --available

# JSON output includes parent_id
hzl task list --json
# { "tasks": [{ "task_id": "def456", "parent_id": "abc123", ... }] }
```

### `hzl task show`

New output: parent info and subtasks list
New option: `--no-subtasks`

```
Task: abc123
Title: Implement authentication
Project: myapp
Parent: (none)
Status: in_progress
Priority: 2
...

Subtasks (3):
  ○ [def456] Add login endpoint (ready)
  ○ [ghi789] Add logout endpoint (ready)
  ✓ [jkl012] Add session management (done)
```

```bash
# Suppress subtask listing
hzl task show abc123 --no-subtasks
```

JSON output includes:
- `parent_id` field (string or null)
- `subtasks` array with summary info

### `hzl task next`

Updated behavior: only returns leaf tasks, new `--parent` filter

```bash
# Get next available leaf task in project
hzl task next --project myapp
# Never returns a parent task

# Get next available subtask of a specific parent
hzl task next --parent abc123
# Scopes work to subtasks of that parent
```

### `hzl task move`

Updated behavior: cascade to subtasks (single transaction)

```bash
# Moving a parent task moves all its subtasks atomically
hzl task move abc123 newproject
# abc123 and all its subtasks are now in newproject
```

### `hzl task archive`

Updated behavior: require explicit action for parents with active subtasks

```bash
# Parent with no active subtasks - archives normally
hzl task archive abc123
✓ Archived task abc123

# Parent with active subtasks - requires flag
hzl task archive abc123
Error: Task abc123 has 3 active subtasks.
Use --cascade to archive parent and all subtasks.
Use --orphan to archive parent only (subtasks become top-level).

hzl task archive abc123 --cascade
✓ Archived task abc123 and 3 subtasks
```

## Validation Rules

1. **Parent must exist** - error if `--parent` references a non-existent task
2. **Parent must not be archived** - cannot set parent to an archived task
3. **No self-reference** - a task cannot be its own parent
4. **Max 1 level** - a subtask cannot have subtasks; a parent cannot become a subtask
5. **Same project** - subtasks are always in the parent's project (auto-inherited)

## Implementation

### Files to Modify

| Package | File | Changes |
|---------|------|---------|
| hzl-cli | `src/commands/task/add.ts` | Add `--parent` option, project inheritance |
| hzl-cli | `src/commands/task/update.ts` | Add `--parent` option, validation |
| hzl-cli | `src/commands/task/list.ts` | Add `--parent` and `--root` filters, `parent_id` output |
| hzl-cli | `src/commands/task/show.ts` | Display parent/subtasks, `--no-subtasks` flag |
| hzl-cli | `src/commands/task/next.ts` | Filter to leaf tasks only, add `--parent` filter |
| hzl-cli | `src/commands/task/move.ts` | Cascade to subtasks in single transaction |
| hzl-cli | `src/commands/task/archive.ts` | Add `--cascade` and `--orphan` flags |

### Core Changes

| Package | File | Changes |
|---------|------|---------|
| hzl-core | `src/services/task-service.ts` | Add `getSubtasks(taskId)` method |

### Documentation

| File | Changes |
|------|---------|
| `/README.md` | Add subtask examples to CLI usage section |
| `AGENTS.md` | Document parent/subtask patterns |
| `docs/openclaw/skills/hzl/SKILL.md` | Add `--parent` to quick reference, subtask patterns |
| `packages/hzl-marketplace/.../hzl-task-management/SKILL.md` | Update Core Concepts, add subtask scenario |

### Testing

| File | Test Cases |
|------|------------|
| `add.test.ts` | Creating subtasks, project inheritance, max-depth validation |
| `update.test.ts` | Changing parent, removing parent, max-depth validation |
| `list.test.ts` | `--parent` filter, `--root` filter |
| `show.test.ts` | Subtask display, `--no-subtasks` flag |
| `next.test.ts` | Leaf-only behavior, `--parent` filter |
| `move.test.ts` | Cascading subtasks in transaction |
| `archive.test.ts` | `--cascade` and `--orphan` behavior |

## Examples

### Breaking Down a Feature

```bash
# Create parent task
hzl task add "Implement user authentication" -P myapp --priority 2
# Created task abc123

# Create subtasks (project inherited automatically)
hzl task add "Add login endpoint" --parent abc123
hzl task add "Add logout endpoint" --parent abc123
hzl task add "Add session management" --parent abc123

# View the breakdown
hzl task show abc123
```

### Working Through Subtasks

```bash
# Get next available subtask for auth work
hzl task next --parent abc123
→ [def456] Add login endpoint

# Or get next across entire project (never returns parent)
hzl task next --project myapp
→ [def456] Add login endpoint

# When all subtasks done, manually complete parent
hzl task complete abc123
```

### Filtering

```bash
# See all subtasks of a task
hzl task list --parent abc123

# See only top-level tasks
hzl task list --root

# Combine with status
hzl task list --root --status ready
```

### Reorganizing Tasks

```bash
# Move a task to become a subtask
hzl task update standalone-task --parent abc123

# Promote subtask to top-level
hzl task update def456 --parent ""
```

### Archiving Work

```bash
# Archive completed work area
hzl task archive abc123 --cascade
✓ Archived task abc123 and 3 subtasks

# Or keep subtasks as standalone
hzl task archive abc123 --orphan
✓ Archived task abc123
✓ 3 subtasks promoted to top-level
```
