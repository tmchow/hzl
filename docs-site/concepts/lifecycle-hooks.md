---
layout: doc
title: Lifecycle Hooks
parent: Concepts
nav_order: 8
---

# Lifecycle Hooks

How HZL notifies external systems when tasks change state.

## Why hooks exist

Tasks have a lifecycle: created, ready, claimed, done. Orchestrators coordinating agents need to know when meaningful transitions happen — particularly when a task completes — so they can trigger follow-up work, update dashboards, or release resources.

Without hooks, the orchestrator must poll `hzl task list` or `hzl task stuck` on a schedule to detect changes. Polling works and is always available, but it introduces latency and wasted calls for transitions where timing matters.

Hooks solve this for the transitions that matter most. When a task reaches `done`, HZL pushes a notification to a configured URL. The orchestrator gets a signal without polling.

## Design philosophy

HZL is a ledger, not an orchestrator. It doesn't run cron jobs, manage agent processes, or decide what to do when a task completes. The hook system reflects this:

- **Targeted, not chatty.** HZL sends notifications for high-value transitions (`on_done`), not every field change. Orchestrators are intelligent — they can poll for routine state checks and rely on hooks only for the signals that warrant immediate action.
- **Host-process delivery, not a daemon.** HZL doesn't run a background service to deliver hooks. The host runtime (OpenClaw, cron, systemd) runs `hzl hook drain` on a schedule. This keeps HZL simple and avoids duplicating scheduler infrastructure that already exists in the orchestration layer.
- **Durable, not fire-and-forget.** Hook payloads are persisted in an outbox table before delivery is attempted. If the target is down, HZL retries with backoff. Nothing is lost between drain runs.

This is a deliberate balance. Pure polling misses time-sensitive completions. A full event firehose couples HZL to orchestrator internals and generates noise. Hooks provide the middle ground: push a signal when something meaningful happens, let the orchestrator decide how to handle everything else.

## Supported triggers

| Trigger | Fires when | Payload includes |
|---------|-----------|-----------------|
| `on_done` | Task status transitions to `done` | Task snapshot, transition details, event context |

Additional triggers (e.g., `on_blocked`, `on_status_changed`) may be added in future versions. For transitions not covered by hooks, use polling via `hzl task list --json` or `hzl task stuck --json`.

## How delivery works

1. A task transitions to `done` (via `task complete`, `set-status`, or workflow commands).
2. HZL writes a row to the `hook_outbox` table with the payload and target URL.
3. An external scheduler runs `hzl hook drain` periodically (e.g., every 2–5 minutes).
4. The drain process claims queued rows, delivers them via HTTP POST, and marks them delivered.
5. Failed deliveries are retried with exponential backoff up to a configurable maximum.

See [Hook Reference](../reference/hooks) for configuration, payload format, and delivery semantics.

## Orchestrator integration pattern

A typical orchestrator setup combines hooks with targeted polling:

```
┌─────────────────────────────────────────┐
│  Orchestrator (OpenClaw / custom)       │
│                                         │
│  Receives:                              │
│    • on_done webhooks → trigger next    │
│    • Periodic poll of hzl task stuck    │
│      → detect and recover stale work    │
│                                         │
│  Schedules:                             │
│    • hzl hook drain (every 2-5 min)     │
│    • hzl task stuck --json (as needed)  │
└─────────────────────────────────────────┘
```

Hooks handle the time-sensitive signal (task completed, kick off the next step). Polling handles the rest (stuck detection, progress monitoring, dashboard updates). Agents are smart enough to check `hzl task list` themselves — the orchestrator doesn't need to micromanage every state change.

## Routing and filtering

HZL sends every `on_done` notification to the same configured URL, regardless of which agent completed the task or which project it belongs to. There is no per-agent or per-project hook configuration in HZL.

This is intentional. HZL's hook payloads include `agent`, `project`, and full event context — enough for the receiving endpoint to make routing decisions. Per-agent notification preferences, filtering rules, and fan-out logic belong in the orchestrator's gateway, not in the ledger.

For example, an orchestrator gateway might:
- Forward completions for project `alpha` to one handler and `beta` to another
- Suppress notifications for short-lived leaf tasks
- Route differently based on which agent completed the work

HZL doesn't need to know about any of this. It pushes one signal per trigger with rich context; the receiver decides what matters.

## Best practices

1. **Always schedule `hzl hook drain`.** Without it, outbox rows queue indefinitely. A 2–5 minute interval is typical.
2. **Use hooks for completion, polling for health.** Don't wait for a hook to detect stuck tasks — poll `hzl task stuck` on a schedule appropriate to your SLA.
3. **Make hook endpoints idempotent.** Deliveries can retry on transient failures. Design receivers to handle duplicate payloads safely.
4. **Monitor the outbox.** If `hzl hook drain --json` consistently reports failures, check your endpoint availability and review `last_error` in the outbox table.
