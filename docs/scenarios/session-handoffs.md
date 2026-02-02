---
layout: default
title: Session Handoffs
parent: Scenarios
nav_order: 2
---

# Session Handoffs

Continuing work across sessions without losing context.

## The Problem

AI coding sessions have limited context windows. When a session ends:

- Work in progress is lost
- Next session starts from scratch
- No record of what was tried or decided

## The Solution

HZL preserves context through checkpoints and task history.

## Recording Progress

Use checkpoints to save your state:

```bash
# Claim task
hzl task claim 1 --author claude-code

# Work and checkpoint as you go
hzl task checkpoint 1 "Designed schema with users, sessions, tokens tables"
hzl task checkpoint 1 "Implemented User model with bcrypt password hashing"
hzl task checkpoint 1 "Started on Session model, need to add expiry logic"
```

## Resuming Work

New session picks up where you left off:

```bash
# Find your in-progress work
hzl task list --status in_progress

# Or find tasks you were working on
hzl task list --author claude-code

# View the full context
hzl task show 1
```

Output shows all checkpoints:

```
Task #1: Implement user authentication
Status: in_progress
Author: claude-code

Checkpoints:
  [2024-01-15 10:30] Designed schema with users, sessions, tokens tables
  [2024-01-15 11:45] Implemented User model with bcrypt password hashing
  [2024-01-15 14:20] Started on Session model, need to add expiry logic
```

## Handoff Between Agents

One agent can hand off to another:

```bash
# Agent 1: Record where you stopped
hzl task checkpoint 1 "HANDOFF: Auth logic done. Remaining: tests and docs. See auth_service.rb"

# Agent 2: Pick up the work
hzl task show 1  # Read the context
# Continue working...
hzl task checkpoint 1 "Added unit tests for AuthService"
```

## What to Checkpoint

Good checkpoints include:

- **What's done** - Completed components or steps
- **What's next** - Immediate next action
- **Key decisions** - Why you chose an approach
- **Blockers** - What you're stuck on
- **File references** - Where to find the code

```bash
# Good checkpoint
hzl task checkpoint 1 "Auth middleware complete (auth_middleware.rb). Next: add rate limiting. Using Redis for token storage per team decision."

# Not helpful
hzl task checkpoint 1 "Working on it"
```

## Example Workflow

### Session 1 (Morning)

```bash
hzl task claim 5 --author claude-code
hzl task checkpoint 5 "Started API design. Decided on REST over GraphQL for simplicity."
hzl task checkpoint 5 "Defined endpoints: GET/POST /users, GET/PUT/DELETE /users/:id"
# Session ends
```

### Session 2 (Afternoon)

```bash
hzl task show 5  # Read morning's progress

# Continue from checkpoint
hzl task checkpoint 5 "Implemented GET /users with pagination"
hzl task checkpoint 5 "Implemented POST /users with validation"
hzl task complete 5
```

## Best Practices

1. **Checkpoint at natural breakpoints** - After completing a component or making a decision
2. **Include "next step"** - Future you will thank you
3. **Reference files** - Make it easy to find the code
4. **Don't over-checkpoint** - Every commit doesn't need a checkpoint
