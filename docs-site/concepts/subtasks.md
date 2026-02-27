---
layout: default
title: Subtasks
parent: Concepts
nav_order: 3
---

# Subtasks

Subtasks let you break a task into smaller pieces. They're created using the `--parent` flag.

## Creating Subtasks

```bash
# Create parent task
hzl task add "Implement authentication" -P my-project

# Create subtasks under it
hzl task add "Design schema" -P my-project --parent 1
hzl task add "Build login endpoint" -P my-project --parent 1
hzl task add "Build logout endpoint" -P my-project --parent 1
```

## How Subtasks Work

- Subtasks belong to a parent task
- Maximum **one level** of nesting (tasks → subtasks, no deeper)
- Parent tasks are not claimable (claim subtasks instead)
- `hzl task claim --next` returns subtasks, not parent tasks

## When to Use Subtasks

**Use subtasks when:**
- A task is too big to complete in one session
- You want to track progress on parts of a task
- Multiple agents might work on different parts

**Don't use subtasks when:**
- Work must be done in a specific order (use [dependencies](./dependencies) instead)
- Tasks are unrelated (use separate tasks)
- You're just adding notes (use checkpoints instead)

## Subtasks vs Dependencies

| Subtasks | Dependencies |
|----------|--------------|
| Break down one task | Sequence multiple tasks |
| `--parent` flag | `--depends-on` flag |
| Parts of a whole | Prerequisite relationships |
| Can work in parallel | Must complete in order |

**Example comparison:**

```bash
# Subtasks: Parts of implementing auth (can be parallel)
hzl task add "Implement auth" -P proj
hzl task add "Backend API" -P proj --parent 1
hzl task add "Frontend forms" -P proj --parent 1

# Dependencies: Sequential steps (must be ordered)
hzl task add "Design schema" -P proj
hzl task add "Implement API" -P proj --depends-on 1
hzl task add "Write tests" -P proj --depends-on 2
```

## Parent Task Rules

1. **Parent tasks can't be claimed** - Claim the subtasks instead
2. **Parent tasks can't be completed directly** - Complete all subtasks first
3. **`hzl task claim --next` skips parents** - Returns available subtasks

## Viewing Subtasks

```bash
# Show task with subtasks
hzl task show <parent-id>

# List all tasks (subtasks shown under parents)
hzl task list -P my-project
```

## Example Workflow

```bash
# Create the main task
hzl task add "Build user profile page" -P frontend

# Break it down
hzl task add "Create profile component" -P frontend --parent 1
hzl task add "Add avatar upload" -P frontend --parent 1
hzl task add "Build settings form" -P frontend --parent 1

# Work on subtasks
hzl task claim 2 --agent claude-code  # Profile component
# ... work ...
hzl task complete 2

hzl task claim 3 --agent claude-code  # Avatar upload
# ... work ...
hzl task complete 3

# Continue until all subtasks done
```

## Best Practices

1. **Keep it shallow** - One level only (task → subtask)
2. **3-5 subtasks** - If you need more, the parent task might be too big
3. **Independent work** - Subtasks should be doable in any order
4. **Clear boundaries** - Each subtask should have a clear deliverable
