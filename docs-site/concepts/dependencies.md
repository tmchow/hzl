---
layout: doc
title: Dependencies
parent: Concepts
nav_order: 4
---

# Dependencies

Dependencies sequence work using the `--depends-on` flag. A task with unmet dependencies is blocked until its prerequisites complete.

## Project-Scoped Only

**Dependencies only work between tasks in the same project.** No cross-project dependencies.

Why? Cross-project dependencies create complexity:

| Level | Problem |
|-------|---------|
| Technical | Tracking relationships across task graphs |
| Mental | Hard to reason about external blockers |
| Practical | "When can I start?" becomes a distributed query |

If you need to coordinate across projects, use human communication or higher-level orchestration.

## Creating Dependencies

```bash
# Create first task
hzl task add "Design API schema" -P my-project

# Create dependent task
hzl task add "Implement endpoints" -P my-project --depends-on 1
```

The second task won't be available until task 1 is marked `done`.

## How Dependencies Work

- Tasks with unmet dependencies stay blocked
- When a dependency completes, dependent tasks become `ready`
- `hzl task claim --next` never returns blocked tasks
- Multiple dependencies are supported: `--depends-on 1,2,3`

## Basic Sequencing

```bash
# Create a pipeline
hzl task add "Design API" -P backend
hzl task add "Implement API" -P backend --depends-on 1
hzl task add "Write tests" -P backend --depends-on 2
hzl task add "Deploy" -P backend --depends-on 3
```

Result:
- Task 1: `ready` (no dependencies)
- Task 2: blocked (waiting on 1)
- Task 3: blocked (waiting on 2)
- Task 4: blocked (waiting on 3)

## Checking Dependencies

```bash
# See what's blocking a task
hzl task show <id>

# List only available tasks
hzl task list --available

# List blocked tasks
hzl task list --status blocked
```

## Common Patterns

### Fan-out (Parallel Work)

After one task completes, multiple can start:

```bash
hzl task add "Design system" -P feature
hzl task add "Build frontend" -P feature --depends-on 1
hzl task add "Build backend" -P feature --depends-on 1
hzl task add "Build mobile" -P feature --depends-on 1
```

After design completes, all three tracks can be worked on simultaneously.

### Fan-in (Convergence)

Multiple tasks must complete before one can start:

```bash
hzl task add "Build frontend" -P app
hzl task add "Build backend" -P app
hzl task add "Integration tests" -P app --depends-on 1,2
```

Integration tests stay blocked until BOTH tasks complete.

### Diamond Dependencies

Combine fan-out and fan-in:

```bash
hzl task add "Design" -P proj
hzl task add "Frontend" -P proj --depends-on 1
hzl task add "Backend" -P proj --depends-on 1
hzl task add "Integration" -P proj --depends-on 2,3
```

```
      Design (1)
       /    \
  Frontend  Backend
   (2)       (3)
       \    /
    Integration (4)
```

### Linear Pipeline

Sequential steps:

```bash
hzl task add "Step 1" -P proj
hzl task add "Step 2" -P proj --depends-on 1
hzl task add "Step 3" -P proj --depends-on 2
```

## Example: CI/CD Pipeline

```bash
hzl project create release-v2

# Build stage (parallel)
hzl task add "Run linter" -P release-v2
hzl task add "Run unit tests" -P release-v2
hzl task add "Run integration tests" -P release-v2

# Package stage (needs all builds)
hzl task add "Build Docker image" -P release-v2 --depends-on 1,2,3

# Deploy stages (sequential)
hzl task add "Deploy to staging" -P release-v2 --depends-on 4
hzl task add "Run smoke tests" -P release-v2 --depends-on 5
hzl task add "Deploy to production" -P release-v2 --depends-on 6
```

```
Linter (1) ─────┐
                │
Unit Tests (2) ─┼─→ Docker (4) → Staging (5) → Smoke (6) → Prod (7)
                │
Integration (3)─┘
```

## Dependencies vs Subtasks

| Dependencies | Subtasks |
|--------------|----------|
| Sequence multiple tasks | Break down one task |
| `--depends-on` flag | `--parent` flag |
| Must complete in order | Can work in parallel |
| Prerequisite relationships | Parts of a whole |

## When to Use Dependencies

**Use dependencies when:**
- Work must happen in a specific order
- One task's output is another task's input
- You need to enforce a workflow sequence

**Don't use dependencies when:**
- Tasks can be done in any order (just create separate tasks)
- Breaking down a single task (use [subtasks](./subtasks) instead)

## Best Practices

1. **Only add real dependencies** - Don't over-constrain
2. **Keep chains reasonable** - Very long chains slow everything down
3. **Use parallel branches** - Maximize concurrent work
4. **Check with `--available`** - See what can be worked on now
5. **Combine with subtasks** - Dependencies between groups, subtasks within
