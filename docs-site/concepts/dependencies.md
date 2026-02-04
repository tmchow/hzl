---
layout: default
title: Dependencies
parent: Concepts
nav_order: 4
---

# Dependencies

Dependencies sequence work using the `--depends-on` flag. A task with unmet dependencies is blocked until its prerequisites complete.

## Creating Dependencies

```bash
# Create first task
hzl task add "Design API schema" -P my-project

# Create dependent task
hzl task add "Implement endpoints" -P my-project --depends-on 1
```

The second task won't be available until task 1 is marked `done`.

## How Dependencies Work

- Tasks with unmet dependencies have status `blocked`
- When a dependency completes, dependent tasks become `ready`
- `hzl task next` never returns blocked tasks
- Multiple dependencies are supported: `--depends-on 1,2,3`

## Checking Dependencies

```bash
# Show task with its dependencies
hzl task show <id>

# List only available (non-blocked) tasks
hzl task list --available
```

## When to Use Dependencies

**Use dependencies when:**
- Work must happen in a specific order
- One task's output is another task's input
- You need to enforce a workflow sequence

**Don't use dependencies when:**
- Tasks can be done in any order (just create separate tasks)
- Breaking down a single task (use [subtasks](./subtasks) instead)

## Dependencies vs Subtasks

| Dependencies | Subtasks |
|--------------|----------|
| Sequence multiple tasks | Break down one task |
| `--depends-on` flag | `--parent` flag |
| Must complete in order | Can work in parallel |
| Prerequisite relationships | Parts of a whole |

## Multiple Dependencies

A task can depend on multiple tasks:

```bash
hzl task add "Deploy to production" -P proj --depends-on 1,2,3
```

The deploy task stays blocked until tasks 1, 2, AND 3 are all done.

## Diamond Dependencies

HZL handles complex dependency graphs:

```bash
# Task 1: Design
hzl task add "Design system" -P proj

# Tasks 2 & 3: Both depend on design
hzl task add "Build frontend" -P proj --depends-on 1
hzl task add "Build backend" -P proj --depends-on 1

# Task 4: Depends on both frontend and backend
hzl task add "Integration testing" -P proj --depends-on 2,3
```

```
      Design (1)
       /    \
  Frontend  Backend
   (2)       (3)
       \    /
    Integration (4)
```

## Example Workflow

```bash
# Create a deployment pipeline
hzl task add "Write code" -P release
hzl task add "Run tests" -P release --depends-on 1
hzl task add "Code review" -P release --depends-on 2
hzl task add "Deploy staging" -P release --depends-on 3
hzl task add "Deploy production" -P release --depends-on 4

# Work through in order
hzl task claim 1 --author claude-code
# ... work ...
hzl task complete 1  # Task 2 becomes ready

hzl task next -P release  # Returns task 2
```

## Best Practices

1. **Keep chains short** - Long dependency chains slow everything down
2. **Parallelize when possible** - Not everything needs to be sequential
3. **Use for real prerequisites** - Don't add dependencies "just in case"
4. **Combine with subtasks** - Use dependencies between parent tasks, subtasks within them
