---
layout: doc
title: Agent Observability
parent: Workflows
nav_order: 7
---

# Agent Observability

Programmatic fleet monitoring for orchestrators and supervisory agents.

[Human Oversight](./human-oversight) covers humans watching agents through the dashboard and conversational queries. This page covers the other direction: an orchestrator agent (OpenClaw, a scheduler, a supervisory loop) monitoring its fleet programmatically through CLI and JSON.

## Fleet status

Check what's running, what's idle, and what's stuck:

```bash
hzl agent status --json
```

```json
{
  "agents": [
    {
      "agent": "clara",
      "isActive": true,
      "activeDurationMs": 720000,
      "tasks": [{
        "taskId": "abc123",
        "title": "Write blog post draft",
        "project": "writing",
        "claimedAt": "2026-03-02T10:00:00Z",
        "progress": 60,
        "leaseUntil": "2026-03-02T11:00:00Z",
        "leaseExpired": false
      }],
      "lastActivity": "2026-03-02T10:10:00Z",
      "stats": null
    },
    {
      "agent": "kenji",
      "isActive": true,
      "activeDurationMs": 2700000,
      "tasks": [{
        "taskId": "def456",
        "title": "Research competitor analysis",
        "project": "research",
        "claimedAt": "2026-03-02T09:15:00Z",
        "progress": null,
        "leaseUntil": "2026-03-02T10:15:00Z",
        "leaseExpired": true
      }],
      "lastActivity": "2026-03-02T09:20:00Z",
      "stats": null
    }
  ],
  "summary": { "total": 3, "active": 2, "idle": 1 }
}
```

Human-readable output (for logs or debugging):

```bash
hzl agent status
```

```
Agents (2 active, 1 idle):

● clara      [active 12m]  Write blog post draft (p:writing, 60%)
● kenji      [active 45m]  Research competitor analysis (p:research)
              ⚠ Lease expired 15m ago
○ writer-2   [idle 2h]
```

### Filtering

```bash
# Single agent
hzl agent status --agent clara --json

# Single project
hzl agent status --project writing --json

# Include per-agent task count breakdowns
hzl agent status --stats --json
```

With `--stats`, each agent includes a breakdown:

```json
{
  "stats": { "total": 5, "counts": { "in_progress": 1, "done": 3, "ready": 1 } }
}
```

## Agent activity log

Inspect what a specific agent has been doing:

```bash
hzl agent log clara --json
```

```json
{
  "agent": "clara",
  "events": [
    {
      "timestamp": "2026-03-02T10:10:00Z",
      "type": "status_changed",
      "taskId": "abc123",
      "taskTitle": "Write blog post draft"
    },
    {
      "timestamp": "2026-03-02T10:05:00Z",
      "type": "checkpoint_recorded",
      "taskId": "abc123",
      "taskTitle": "Write blog post draft"
    }
  ],
  "total": 47
}
```

```bash
# Show more history (default: 50)
hzl agent log clara --limit 100 --json
```

## Detecting stuck agents

An agent is likely stuck when its lease has expired and no recent activity appears. The `leaseExpired` field in `agent status` surfaces this directly.

```bash
# Orchestrator pseudo-logic:
# 1. Poll fleet status
# 2. For each active agent where leaseExpired is true, check activity
# 3. If no recent events, recover the task

hzl agent status --json
# → find agents with leaseExpired: true

hzl agent log kenji --limit 5 --json
# → confirm no recent activity

hzl task steal <task-id> --if-expired --agent backup-agent --lease 60
# → reassign to a healthy agent
```

This complements `hzl task stuck`, which finds expired-lease tasks directly. `agent status` gives the fleet-level view; `task stuck` gives the task-level view.

## Orchestrator patterns

### Health-check loop

An orchestrator can poll fleet state on a schedule and take action:

```bash
# Every 5 minutes, check fleet health
hzl agent status --json | process_fleet_health

# If an agent has been active > 2 hours with no progress change, alert
# If a lease expired > 30 minutes ago, auto-steal and reassign
```

### Post-session audit

After an agent session ends, review what happened:

```bash
hzl agent log clara --limit 20 --json
```

Useful for verifying that the agent completed its assigned work, created appropriate follow-on tasks, and didn't leave tasks in a bad state.

### Scaling decisions

Use `--stats` to inform whether to spin up or wind down agents:

```bash
hzl agent status --project writing --stats --json
# → If many ready tasks and few active agents, scale up
# → If no ready tasks and agents are idle, scale down
```

## When to use what

| Need | Tool |
|------|------|
| Orchestrator checking fleet state | `hzl agent status --json` |
| Orchestrator investigating one agent | `hzl agent log <agent> --json` |
| Orchestrator finding stale tasks | `hzl task stuck --json` |
| Human checking fleet at a glance | `hzl agent status` (no `--json`) |
| Human investigating visually | Web dashboard Agent Operations view |
| Human asking conversationally | Ask your primary agent |
