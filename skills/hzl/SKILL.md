---
name: hzl
description: This skill should be used when working with HZL for task tracking, when the user asks to "break down work into tasks", "track tasks with HZL", "claim a task", "checkpoint progress", "complete a task", or when working on a project that uses HZL. Provides guidance on effective task management patterns for AI agents.
---

# HZL Task Management

HZL is a durable task ledger. It stores state across session boundaries and agent handoffs.

## Core loop (preferred)

```bash
# Session start
hzl workflow run start --agent <agent-id> --project <project>

# Progress
hzl task checkpoint <id> "progress + next"
hzl task progress <id> 50

# Completion / transition
hzl task complete <id>
# or
hzl workflow run handoff --from <id> --title "<next>" --project <project>
# or
hzl workflow run delegate --from <id> --title "<subwork>" --project <project> --pause-parent
```

Use primitive commands directly when needed (`task add`, `task claim`, `task add-dep`, `task update`, etc.).

## Discovery commands

```bash
hzl workflow list
hzl workflow show start
hzl workflow show handoff
hzl workflow show delegate
hzl dep list --blocking-only
```

## Key semantics

- `done` is a status; `complete` is a command path to `done`.
- `workflow run start` does not support `--auto-op-id` by design.
- Cross-project dependencies are supported by default.
- Delegation adds dependency by default; use `--pause-parent` for explicit parent blocking.

## Multi-agent guidance

- Route by project pool when possible (omit `--agent` on create/handoff).
- Use explicit `--agent` only for targeted assignment.
- Keep agent identity strings stable.

## Reliability guidance

- Status transitions to `done` enqueue hooks.
- Host runtime must schedule `hzl hook drain` (1-5 minute cadence).

## Recovery guidance

```bash
hzl task stuck
hzl task show <id>
hzl task steal <id> --if-expired --agent <agent-id>
```

## Destructive commands

Never run these without explicit user request:
- `hzl task prune`
- `hzl init --force`
