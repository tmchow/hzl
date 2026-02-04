---
layout: default
title: Quickstart
parent: Getting Started
nav_order: 2
---

# Quickstart Tutorial

A 5-minute hands-on introduction to HZL.

## Prerequisites

- HZL installed (`hzl --version` should work)
- If not, see [Installation](./installation)

## 1. Create a Project

Projects are containers for related work. Typically one per repo.

```bash
hzl project create my-feature
```

## 2. Add Tasks

Create tasks with titles and optional details:

```bash
# Simple task
hzl task add "Design the API schema" -P my-feature

# Task with priority (higher = more important)
hzl task add "Implement user endpoints" -P my-feature --priority 2

# Task that depends on another (waits until dependency completes)
hzl task add "Write API tests" -P my-feature --depends-on 2
```

## 3. See What's Available

```bash
# List all tasks
hzl task list -P my-feature

# Show only claimable tasks (ready, dependencies met)
hzl task list -P my-feature --available
```

## 4. Claim and Work

Before working on a task, claim it:

```bash
# Get the next available task
hzl task next -P my-feature

# Claim it
hzl task claim 1 --assignee claude-code
```

## 5. Record Progress

Save checkpoints as you work:

```bash
hzl task checkpoint 1 "Schema designed: users, sessions, permissions tables"
hzl task checkpoint 1 "Added foreign key constraints, ready for review"
```

Checkpoints preserve context for future sessions or other agents.

## 6. Complete the Task

```bash
hzl task complete 1
```

Completing a task unblocks any tasks that depend on it.

## 7. View the Dashboard (Optional)

```bash
hzl serve
```

Opens a Kanban board at [http://localhost:3456](http://localhost:3456) showing all your tasks visually.

## Full Workflow Example

```bash
# Setup
hzl project create auth-system

# Add tasks with dependencies
hzl task add "Design auth flow" -P auth-system
hzl task add "Implement login endpoint" -P auth-system --depends-on 1
hzl task add "Implement logout endpoint" -P auth-system --depends-on 1
hzl task add "Add session management" -P auth-system --depends-on 2,3
hzl task add "Write integration tests" -P auth-system --depends-on 4

# Work through them
hzl task next -P auth-system --claim --assignee my-agent
# ... do the work ...
hzl task checkpoint 1 "Auth flow designed: OAuth2 with JWT tokens"
hzl task complete 1

# Continue with the next available task
hzl task next -P auth-system --claim --assignee my-agent
```

## Next Steps

- [Concepts](../concepts/) — Understand projects, tasks, dependencies
- [Workflows](../workflows/) — Common usage patterns
- [CLI Reference](../reference/cli) — Complete command documentation
