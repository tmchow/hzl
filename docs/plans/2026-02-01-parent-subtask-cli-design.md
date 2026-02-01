# Parent/Subtask CLI Support Design

**Date:** 2026-02-01
**Status:** Draft
**Branch:** feat/parent-id-cli

## Overview

Expose the existing `parent_id` data model field through the CLI, enabling hierarchical task organization. The hierarchy is purely organizational - no automatic status propagation between parent and child tasks.

## Use Cases

- Breaking down large tasks into smaller, independently claimable pieces
- Organizing related work under a common parent
- Filtering to see all subtasks of a specific task

## Design Decisions

### Hierarchy Behavior

- **Purely organizational** - parent/child status is independent
- No automatic completion of parent when children complete
- No status propagation in either direction

### Project Constraints

- Subtasks must be in the same project as their parent
- When setting a parent:
  - `--project` omitted: inherit from parent automatically
  - `--project` matches parent: OK
  - `--project` differs from parent: error
- When removing parent (`--parent ""`): task stays in current project
- When moving parent to new project: subtasks cascade (move with parent)

### Display

- Flat list by default (no tree view)
- Filter by parent via `--parent <id>` flag
- `parent_id` included in JSON output
- `hzl task show` displays subtasks inline (suppressible with `--no-subtasks`)

## CLI Changes

### `hzl task add`

New option: `--parent <task_id>`

```bash
# Create a subtask
hzl task add "Add login endpoint" --parent abc123

# Project is inherited from parent (no need to specify)
hzl task add "Add logout endpoint" --parent abc123

# Explicit project must match parent's project
hzl task add "Add session management" --parent abc123 -P myapp  # OK if parent is in myapp
hzl task add "Add session management" --parent abc123 -P other  # ERROR: project mismatch
```

### `hzl task update`

New option: `--parent <task_id>`

```bash
# Set parent (task moves to parent's project if different)
hzl task update def456 --parent abc123

# Change parent (task moves to new parent's project)
hzl task update def456 --parent xyz789

# Remove parent (task stays in current project)
hzl task update def456 --parent ""
```

### `hzl task list`

New option: `--parent <task_id>`
New output field: `parent_id`

```bash
# Filter to subtasks of a specific task
hzl task list --parent abc123

# Combine with other filters
hzl task list --parent abc123 --status ready --available

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

### `hzl task move`

Updated behavior: cascade to subtasks

```bash
# Moving a parent task moves all its subtasks
hzl task move abc123 newproject
# abc123 and all its subtasks are now in newproject
```

## Validation Rules

1. **Parent must exist** - error if `--parent` references a non-existent task
2. **No self-reference** - a task cannot be its own parent
3. **No cycles** - cannot set parent if it would create a circular reference (A → B → A)
4. **Same project** - subtask must be in same project as parent (enforced as described above)

## Implementation

### Files to Modify

| Package | File | Changes |
|---------|------|---------|
| hzl-cli | `src/commands/task/add.ts` | Add `--parent` option, project inheritance logic |
| hzl-cli | `src/commands/task/update.ts` | Add `--parent` option, cycle detection, project cascade |
| hzl-cli | `src/commands/task/list.ts` | Add `--parent` filter, include `parent_id` in output |
| hzl-cli | `src/commands/task/show.ts` | Display parent, list subtasks, add `--no-subtasks` flag |
| hzl-cli | `src/commands/task/move.ts` | Cascade project move to subtasks |

### Core Changes (if needed)

- `TaskService.getSubtasks(taskId)` - may need to be added
- Cycle detection utility for parent updates
- Subtask cascade logic for project moves

### Documentation

| File | Changes |
|------|---------|
| `/README.md` | Add subtask examples to CLI usage section |
| `AGENTS.md` | Document parent/subtask patterns if relevant |
| `docs/openclaw/skills/hzl/SKILL.md` | Add `--parent` to quick reference, add subtask pattern |
| `packages/hzl-marketplace/.../hzl-task-management/SKILL.md` | Update Core Concepts, add subtask scenario |

### Testing

| File | Test Cases |
|------|------------|
| `add.test.ts` | Creating subtasks, project inheritance, validation errors |
| `update.test.ts` | Changing parent, removing parent, cycle detection, project cascade |
| `list.test.ts` | `--parent` filter |
| `show.test.ts` | Subtask display, `--no-subtasks` flag |
| `move.test.ts` | Cascading subtasks to new project |

## Examples

### Breaking Down a Feature

```bash
# Create parent task
hzl task add "Implement user authentication" -P myapp --priority 2
# Created task abc123

# Create subtasks (project inherited)
hzl task add "Add login endpoint" --parent abc123
hzl task add "Add logout endpoint" --parent abc123
hzl task add "Add session management" --parent abc123

# View the breakdown
hzl task show abc123
```

### Filtering Subtasks

```bash
# See all subtasks of a task
hzl task list --parent abc123

# See available subtasks
hzl task list --parent abc123 --available
```

### Reorganizing Tasks

```bash
# Move a task to become a subtask
hzl task update standalone-task --parent abc123

# Move subtask to different parent (in another project)
hzl task update def456 --parent xyz789
# def456 is now in xyz789's project

# Promote subtask to top-level
hzl task update def456 --parent ""
```
