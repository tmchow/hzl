---
layout: doc
title: Multi-Agent Coordination
parent: Workflows
nav_order: 2
---

# Multi-Agent Coordination

Multiple agents can coordinate through shared task state without duplicate work.

## Coordination Pattern

1. Shared backlog exists (global `inbox` or project scope).
2. Agents pull candidate work.
3. Agents claim work atomically.
4. Agents checkpoint progress and complete.
5. Humans monitor and intervene when needed.

## Shared Pool Example (Project Scope)

```bash
# Shared domain queue
hzl project create writing
hzl task add "Draft product announcement" -P writing
hzl task add "Edit API release notes" -P writing

# Two agents can independently pull from same scope
hzl task claim --next -P writing --agent writer-1
hzl task claim --next -P writing --agent writer-2
```

Both agents get different tasks because claim-next is atomic.

## Explicit vs Automatic Claim

- **Automatic:** `task claim --next` when agent wants HZL to choose the next eligible task.
- **Explicit:** `task claim <id>` when agent has already reasoned over candidate tasks.

Both are valid and can coexist in one system.

## Leases for Recovery

Use leases when work can stall or agents may crash:

```bash
hzl task claim --next -P writing --agent writer-1 --lease 60
```

Recover expired work:

```bash
hzl task stuck
hzl task show <task-id>
hzl task steal <task-id> --if-expired --agent writer-2
```

## Monitoring Shared Work

```bash
# Detailed tasks grouped by agent
hzl task list -P writing --group-by-agent --view standard

# Counts-only workload summary
hzl agent stats -P writing
```

## Best Practices

1. Use consistent `--agent` naming.
2. Use project scopes when many agents share one domain.
3. Use `claim --next` for simple pull loops; use explicit claim when agents reason over choices.
4. Checkpoint before pauses or handoffs.
5. Use leases on long-running tasks.
