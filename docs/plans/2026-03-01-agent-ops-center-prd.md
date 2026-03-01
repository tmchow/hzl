# Agent Operations Center — PRD

## Problem

When running multiple AI agents in parallel on a shared task board, the operator has no way to monitor the agents themselves. The Kanban view shows tasks — it answers "what's the state of the work?" but not "what's the state of the workers?"

Specific gaps:

- **No agent-as-object view.** You can filter tasks by assignee, but you can't see all agents at once — especially idle agents who have no tasks assigned. The absence of work is invisible.
- **No temporal context.** A task sitting in "In Progress" looks the same whether the agent claimed it 2 minutes ago or 30 minutes ago. There's no sense of elapsed time or recency.
- **No activity heartbeat.** An agent emitting checkpoints every 2 minutes looks identical to one that went silent 15 minutes ago. Event cadence — the single best signal of agent health — isn't surfaced anywhere.
- **No stuck detection.** `getStuckTasks()` exists in core but nothing in the UI surfaces it. A stuck agent just looks like a normal in-progress task. The operator has to manually notice the silence.
- **No session history.** The event store captures `agent_id` and `session_id` on every event, but no view shows "here's everything agent-3 did in its current session." The data is there; the view isn't.

## Who It's For

Operators running 2-20 AI agents on a shared HZL task board. The operator's job is oversight: make sure agents are making progress, intervene when one gets stuck, and understand fleet throughput. They're checking the dashboard every few minutes, not staring at it continuously.

## Goals

1. **Surface agent health at a glance.** Within 2 seconds of opening the view, the operator should know: how many agents are active, whether any are stuck, and whether any are idle. No reading required — the visual pattern should communicate this.

2. **Make stuck agents unmissable.** A stuck agent (in-progress with no events for >5 minutes) should be the most visually prominent thing in the view. Not a badge you have to find — a signal you can't ignore.

3. **Show temporal context per agent.** For each agent: how long they've been on their current task, when their last event was, and the cadence of their recent activity. These three numbers tell you everything about agent health.

4. **Provide drill-down into agent sessions.** Clicking an agent should show their recent activity — the last ~25 events across tasks. This answers "what has this agent been doing?" without leaving the view.

5. **Zero new instrumentation.** Everything needed already exists in the event store. This is a new view over existing data, not a new data collection mechanism.

## What It Is

A top-level view in the web dashboard, alongside Kanban. You switch between them via the existing view selector. The mental model:

- **Kanban** = task board. Primary object is the task. Answers: "what's the state of the work?"
- **Agent Operations Center** = mission control. Primary object is the agent. Answers: "what's the state of the workers?"

## What It Shows (That Kanban Can't)

### Agent roster
Every known agent, whether or not they currently hold a task. Agents are grouped by status: stuck, active, idle. An idle agent with nothing claimed is important information — Kanban can't show the absence of work.

### Fleet summary
A compact status breakdown: `3 active · 1 stuck · 1 idle`. This is the headline — the operator reads it first and drills down only if something is wrong.

### Per-agent health signals
For each agent:
- **Current task** (title, project, progress) or "idle since [time]"
- **Elapsed time** since they claimed the current task (from `claimed_at`)
- **Silence duration** — time since their last event of any kind
- **Activity pattern** — a visual indicator of recent event cadence (healthy agents emit events regularly; stuck agents go silent)

### Stuck detection as a first-class alert
Not something you infer — something you see. The default threshold is **5 minutes of silence** (no events from that agent). Configurable in the UI: 5m / 10m / 15m / 30m.

"Stuck" means: agent has an in-progress task AND has emitted no events for longer than the threshold. This is distinct from a task simply being in-progress for a long time — an agent that's been working for 20 minutes but emitting checkpoints every 3 minutes is healthy.

### Agent session history
Expanding an agent shows the last ~25 events from that agent, most recent first. Each event shows: relative timestamp, event type, task title. This timeline crosses task boundaries — you can see "claimed task X, added 3 checkpoints, completed it, claimed task Y, has been silent for 8 minutes."

## What It Doesn't Do (v1)

- **No agent management.** You can't reassign tasks, kill agents, or send commands from this view. It's read-only monitoring.
- **No aggregate analytics.** No average cycle time, throughput charts, or historical trends. Just the current fleet state.
- **No alerting/notifications.** Stuck detection is visual only — no push notifications, webhooks, or sounds.
- **No agent registration.** Agents aren't explicitly registered. The roster is derived from tasks — any `agent` value that has ever appeared on a task is a known agent.

## Success Criteria

1. Operator can assess fleet health (all healthy / something stuck / agents idle) within 2 seconds of opening the view.
2. A stuck agent is visually distinct from a healthy active agent without reading any text.
3. The view updates live via SSE — no manual refresh needed.
4. Switching between Kanban and Agent Operations Center preserves project/date filters.
5. Works with the existing event store data — no schema changes, no new event types, no new projections required.

## Open Questions

- **Agent naming.** Agent IDs can be opaque (e.g., `claude-opus-4-20250514`). Should the view support display-name aliases, or is the raw agent ID sufficient for v1?
- **Idle threshold.** Should there be a separate "idle for too long" alert (agent has been idle for >N minutes), or is idle-without-alert sufficient for v1?
- **Mobile.** The Kanban view has mobile support. Does the Agent Operations Center need mobile support in v1, or is it desktop-only?
