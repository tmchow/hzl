---
layout: default
title: Single Agent
parent: Workflows
nav_order: 1
---

# Single Agent Workflow

The basic workflow for one agent working across multiple sessions.

## When to Use

- Work spans multiple sessions or days
- You want durable record of progress
- Task is non-trivial (~30+ min or risky changes)

## Setup

```bash
# Check for existing projects first
hzl project list

# Create if needed (one per repo, typically)
hzl project create myrepo
```

## Adding Work

```bash
# Simple task
hzl task add "Feature X" -P myrepo -s ready

# With subtasks
hzl task add "Feature X" -P myrepo
hzl task add "Subtask A" --parent <id>
hzl task add "Subtask B" --parent <id> --depends-on <subtask-a-id>
```

### Adding Context

Use `-d` for details, `-l` for reference docs:

```bash
hzl task add "Add rate limiting" -P myrepo -s ready \
  -d "Per linked spec. Use RateLimiter from src/middleware/." \
  -l docs/rate-limit-spec.md
```

If docs exist, reference them (don't duplicate—avoids drift). If no docs, include enough detail to complete the task.

## Working on Tasks

```bash
# Get next available task
hzl task claim --next -P myrepo

# Claim it (or combine with --claim)
hzl task claim <id> --agent my-agent

# One-liner: find and claim
hzl task claim --next -P myrepo --agent my-agent

# For subtasks of a specific parent
hzl task claim --next --parent <id>
```

## Recording Progress

Checkpoint at milestones or before pausing:

```bash
hzl task checkpoint <id> "Designed schema, moving to implementation"
hzl task checkpoint <id> "Core logic complete, starting tests"
```

Good checkpoints include:
- What's done
- What's next
- Key decisions made
- Any blockers encountered

## Changing Status

```bash
# Move from backlog to ready (claimable)
hzl task set-status <id> ready

# Move back to planning
hzl task set-status <id> backlog
```

Status flow: `backlog` → `ready` → `in_progress` → `done` (or `blocked`)

## Completing Work

```bash
# Optional: final notes
hzl task comment <id> "Implemented X, tested Y"

# Mark complete
hzl task complete <id>
```

### With Subtasks

```bash
# After completing a subtask, check parent
hzl task show <parent-id>   # Any subtasks left?

# When all subtasks done, complete parent
hzl task complete <parent-id>
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| "not claimable (status: backlog)" | `hzl task set-status <id> ready` |
| "Cannot complete: status is X" | Claim first: `hzl task claim <id>` |
| Task not showing in `--available` | Check dependencies: `hzl task show <id>` |

## Full Example

```bash
# Session 1: Setup and start
hzl project create auth-feature
hzl task add "Design auth flow" -P auth-feature
hzl task add "Implement login" -P auth-feature --depends-on 1
hzl task add "Add tests" -P auth-feature --depends-on 2

hzl task claim 1 --agent claude-code
hzl task checkpoint 1 "Decided on JWT tokens with refresh"
# Session ends

# Session 2: Continue
hzl task show 1                    # Review context
hzl task complete 1                # Finish design

hzl task claim --next -P auth-feature --agent claude-code
hzl task checkpoint 2 "Login endpoint complete"
hzl task complete 2

# Session 3: Finish up
hzl task claim --next -P auth-feature --agent claude-code
hzl task checkpoint 3 "Tests passing"
hzl task complete 3
```
