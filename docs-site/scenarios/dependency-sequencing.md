---
layout: default
title: Dependency Sequencing
parent: Scenarios
nav_order: 4
---

# Dependency Sequencing

Using `--depends-on` to enforce workflow order.

## The Problem

Some tasks must happen in a specific order:
- Can't deploy before testing
- Can't test before implementing
- Can't implement before designing

Without enforcement, agents might work on tasks out of order.

## The Solution

Dependencies block tasks until prerequisites complete.

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
- Task 2: `blocked` (waiting on 1)
- Task 3: `blocked` (waiting on 2)
- Task 4: `blocked` (waiting on 3)

## How It Works

```bash
# Only task 1 is available
hzl task next -P backend  # Returns task 1

# Complete task 1
hzl task claim 1 --author claude-code
hzl task complete 1

# Now task 2 is available
hzl task next -P backend  # Returns task 2
```

## Multiple Dependencies

A task can wait on multiple prerequisites:

```bash
hzl task add "Build frontend" -P app
hzl task add "Build backend" -P app
hzl task add "Integration tests" -P app --depends-on 1,2
```

Task 3 stays blocked until BOTH tasks 1 and 2 complete.

## Parallel Branches

Create parallel work that converges:

```bash
# Design (root)
hzl task add "Design system" -P feature

# Two parallel tracks
hzl task add "Build frontend" -P feature --depends-on 1
hzl task add "Build backend" -P feature --depends-on 1

# Convergence point
hzl task add "Integration" -P feature --depends-on 2,3
```

After design completes, both frontend and backend can be worked on simultaneously by different agents.

## Checking Dependencies

```bash
# See what's blocking a task
hzl task show 3

# List only available tasks
hzl task list --available

# See blocked tasks
hzl task list --status blocked
```

## Example: CI/CD Pipeline

```bash
hzl project create release-v2

# Build stage
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

Visual structure:
```
Linter (1) ─────┐
                │
Unit Tests (2) ─┼─→ Docker (4) → Staging (5) → Smoke (6) → Prod (7)
                │
Integration (3)─┘
```

## Example: Feature with Review Gates

```bash
hzl project create user-export

# Implementation
hzl task add "Implement export logic" -P user-export
hzl task add "Add export UI" -P user-export --depends-on 1

# Review gate
hzl task add "Code review" -P user-export --depends-on 1,2

# Post-review
hzl task add "Address review feedback" -P user-export --depends-on 3
hzl task add "Final QA" -P user-export --depends-on 4
hzl task add "Merge to main" -P user-export --depends-on 5
```

## Common Patterns

### Fan-out (Parallel Work)

```bash
hzl task add "Planning" -P proj
hzl task add "Track A" -P proj --depends-on 1
hzl task add "Track B" -P proj --depends-on 1
hzl task add "Track C" -P proj --depends-on 1
```

### Fan-in (Convergence)

```bash
hzl task add "Task A" -P proj
hzl task add "Task B" -P proj
hzl task add "Task C" -P proj
hzl task add "Combine results" -P proj --depends-on 1,2,3
```

### Linear Pipeline

```bash
hzl task add "Step 1" -P proj
hzl task add "Step 2" -P proj --depends-on 1
hzl task add "Step 3" -P proj --depends-on 2
```

## Best Practices

1. **Only add real dependencies** - Don't over-constrain
2. **Keep chains reasonable** - Very long chains slow everything down
3. **Use parallel branches** - Maximize concurrent work
4. **Check with `--available`** - See what can be worked on now
5. **Combine with subtasks** - Dependencies between groups, subtasks within
