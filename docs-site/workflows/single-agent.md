---
layout: doc
title: Single Agent
parent: Workflows
nav_order: 1
---

# Single Agent Workflow

A durable workflow for one agent operating across multiple sessions.

## When to Use

- Work spans multiple sessions
- You need resumable context
- You want a clear audit trail

## Setup

Choose one queue model:

- **Global queue**: use default `inbox`
- **Scoped queue**: create a project for a long-lived domain

```bash
# Optional scoped queue
hzl project create backend
```

## Add Work

```bash
# Global queue task
hzl task add "Investigate flaky test"

# Scoped task
hzl task add "Implement auth middleware" -P backend -s ready
```

## Session Start (resume or claim)

```bash
# Global
hzl workflow run start --agent my-agent

# Scoped
hzl workflow run start --agent my-agent --project backend
```

## Record Progress

```bash
hzl task checkpoint <id> "Middleware complete; next step is token validation tests"
```

## Complete or Block

```bash
hzl task complete <id>
# or
hzl task block <id> --comment "Waiting for security review"
```

## Resume Later (manual inspect path)

```bash
hzl task list --status in_progress --agent my-agent
hzl task show <id>
```

## Best Practices

1. Keep checkpoints specific and resumable.
2. Prefer `workflow run start` at session boundaries.
3. Use explicit `claim <id>` when you need custom prioritization.
4. Use scoped projects only when queue boundaries help.
