---
layout: doc
title: Claiming & Leases
parent: Concepts
nav_order: 7
---

# Claiming and Leases

How HZL ensures one-task-one-owner coordination.

## Claiming Basics

Claiming marks a task as owned and in progress.

```bash
# Explicit claim
hzl task claim <id> --agent worker-1

# Automatic next eligible claim
hzl task claim --next -P research --agent worker-1
```

Claiming:
- Sets status to `in_progress`
- Records current owner (`--agent`)
- Prevents duplicate active ownership

## Agent vs Author

| Concept | What it tracks | Set by |
|---------|----------------|--------|
| Agent | Current ownership | `--agent` |
| Event author | Who performed mutation | `--author` on supported commands |

`task claim` uses `--agent` as event author and does not accept `--author`.

## Agent ID

Use `--agent-id` when session-level identity helps audits.

```bash
hzl task claim <id> --agent worker-1 --agent-id run-2026-02-27-01
```

## Atomic Claiming

`task claim --next` is an atomic find-and-claim operation.

If two agents call it concurrently, they get different tasks (or one gets no candidate) without double-claiming the same task.

## Leases

Leases add expiry to ownership so stuck work can be recovered.

```bash
hzl task claim --next -P research --agent worker-1 --lease 60
```

If lease expires without completion/release, the task becomes eligible for takeover.

## Stuck Task Recovery

```bash
# Find expired leases
hzl task stuck

# Review context
hzl task show <id>

# Recover task with a new lease
hzl task steal <id> --if-expired --agent worker-2 --lease 60
```

`--lease` sets a new lease atomically with the steal, avoiding a separate claim step.

## Best Practices

1. Always set `--agent` on claim.
2. Use `claim --next` for standard pull loops.
3. Use explicit `claim <id>` after custom reasoning.
4. Add leases for long-running or failure-prone work.
5. Read checkpoints before stealing.
