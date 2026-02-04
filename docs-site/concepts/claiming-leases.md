---
layout: default
title: Claiming & Leases
parent: Concepts
nav_order: 7
---

# Claiming and Leases

How HZL ensures only one agent works on a task at a time.

## Claiming Tasks

Before working on a task, claim it:

```bash
hzl task claim <id> --assignee "Claude Code"
```

Claiming:
- Changes status to `in_progress`
- Records who is working on it
- Prevents other agents from claiming

### Why Claim?

- **Prevents duplicate work** - Two agents won't work on the same task
- **Creates audit trail** - History shows who did what
- **Enables coordination** - `task next` skips claimed tasks

## Assignee vs Author

| Concept | What it tracks | Set by |
|---------|----------------|--------|
| **Assignee** | Who owns the task | `--assignee` on `claim` or `add` |
| **Event author** | Who performed an action | `--author` on other commands |

```bash
# Alice owns the task
hzl task claim <id> --assignee alice

# Bob adds a checkpoint (doesn't change ownership)
hzl task checkpoint <id> "Reviewed the code" --author bob
```

## Agent ID

For AI agents that need session tracking:

```bash
hzl task claim <id> --assignee "Claude Code" --agent-id "session-abc123"
```

The agent ID helps identify specific sessions or instances.

## Atomic Claiming

HZL uses database transactions to ensure atomic claiming:

```
Agent 1: task next -P proj     → Task #1
Agent 2: task next -P proj     → Task #1

Agent 1: task claim 1          → Success!
Agent 2: task claim 1          → Error: Already claimed
```

Two agents calling `task next --claim` simultaneously will get different tasks.

## Leases

Leases are time-limited claims that expire if not completed or renewed.

```bash
hzl task claim <id> --assignee <name> --lease 30   # 30 minute lease
```

### Why Use Leases?

- **Detect stuck work** - If an agent crashes, the lease expires
- **Enable recovery** - Another agent can take over expired tasks
- **Prevent orphaned work** - Tasks don't stay claimed forever

### How Leases Work

1. Agent claims with `--lease 30` (30 minutes)
2. If agent completes within 30 min → normal completion
3. If 30 min passes without completion → lease expires
4. Task becomes available for recovery

## Finding Stuck Tasks

```bash
hzl task stuck
hzl task stuck --json
```

Returns tasks with expired leases that may need recovery.

## Recovering Stuck Tasks

When an agent dies or becomes unresponsive:

```bash
# 1. Find stuck tasks
hzl task stuck

# 2. Review what happened (check checkpoints)
hzl task show <id>

# 3. Take over the task
hzl task steal <id> --if-expired --assignee new-agent
```

**Important:** Review checkpoints before stealing to understand the current state.

### The Steal Command

```bash
hzl task steal <id> --if-expired --assignee <name>
```

- `--if-expired` - Only steal if lease is actually expired (safety check)
- Transfers ownership to the new assignee
- Preserves all history and checkpoints

## Recommended Lease Durations

| Work Type | Suggested Lease |
|-----------|-----------------|
| Quick fix (< 30 min) | 30 minutes |
| Standard task | 60 minutes |
| Complex feature | 120 minutes |
| Long-running work | 240+ minutes |

Choose based on expected duration. Too short = false positives. Too long = delayed recovery.

## Best Practices

1. **Always use `--assignee`** - Track who's doing the work
2. **Use leases for long work** - Enable stuck detection
3. **Review before stealing** - Check checkpoints first
4. **Use `task next --claim`** - Atomic find-and-claim in one step
5. **Complete promptly** - Don't leave tasks claimed indefinitely
