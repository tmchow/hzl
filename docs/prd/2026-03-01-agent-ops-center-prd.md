# Agent Operations Center — PRD

**Date:** 2026-03-01
**Status:** Brainstorming
**Design Direction:** [2026-03-01-agent-ops-center-design-direction.md](../design-directions/2026-03-01-agent-ops-center-design-direction.md)

## Goal

Give operators running 2-20 AI agents on a shared HZL task board a dedicated view to monitor agent activity, see how long tasks have been in progress, and investigate what each agent has been doing — all from existing event store data with zero new instrumentation.

The Kanban view answers "what's the state of the work?" The Agent Operations Center answers "what's the state of the workers?"

## Scope

### In Scope

- New top-level view in the web dashboard alongside Kanban, accessible via the existing view selector
- Persistent split-panel layout with agent roster (left) and agent detail panel (right)
- Fleet summary bar showing active/idle counts
- Agent roster showing all known agents with status, current task, and task duration
- Agent detail panel with event timeline, inline task context, and metrics (where available from event data)
- Live updates via SSE (same mechanism as Kanban)
- Responsive: horizontal scroll on narrow viewports
- Shared project/date filters with Kanban view

### Boundaries

- **Read-only monitoring.** No agent management (reassign, kill, command). Operators observe and then intervene outside HZL.
- **Current state only.** No aggregate analytics, throughput charts, or historical trends. The view shows what's happening now.
- **No alerting.** No push notifications, webhooks, or sounds. The view is visual-only — operators check it when they choose.
- **Raw agent IDs only.** No display-name aliases. Operators see whatever `agent_id` value is in the event store. Aliases deferred to a future iteration.
- **No agent registration.** The roster is derived from event data. Any `agent` value that has ever appeared on a task is a known agent.
- **No new event types or schema changes.** Everything needed already exists in the event store. The view degrades gracefully when optional fields (`session_id`, `agent`) are not populated — agents without IDs are excluded from the roster.
- **Duration, not judgment.** The view shows how long a task has been in progress — it does not define or label agents as "stuck." Operators decide what duration is concerning based on their own context.

## Agent States

An agent is in one of two states, derived from event data:

- **Active** — the agent has at least one in-progress task. The roster shows the task title and how long it has been in progress.
- **Idle** — the agent has no in-progress tasks. The roster shows "idle since [time]" based on the agent's last event.

Agent identity is derived from `EventEnvelope.agent_id`. Events without agent attribution are excluded from the roster but appear in task-level timelines.

## Requirements

| ID | Priority | Requirement |
|----|----------|-------------|
| R1 | Core | Operator can assess fleet health within seconds of opening the view: the view renders with agent status data quickly, and the visual pattern (color distribution, layout) communicates fleet status at a glance without reading individual rows |
| R2 | Core | Agents with long-running in-progress tasks are the most visually prominent elements in the roster — task duration is displayed prominently and agents are sorted so the longest-running tasks appear first |
| R3 | Must | Persistent split-panel layout: agent roster on the left, agent detail panel on the right |
| R4 | Must | Agent roster uses a single expanded layout showing full agent info: status dot (color-coded), agent ID (monospace), current task title or "idle since [time]", and task duration for active agents |
| R5 | Must | Agent roster shows all known agents sorted by: active agents first (longest task duration at top), then idle agents (most recently active first). No filtering, pagination, or hiding — scroll to see all |
| R6 | Must | Detail panel shows timeline-first layout: event timeline with inline task context (task-related events expand to show task details), followed by metrics where available from event data (task duration, event count, progress if present) |
| R7 | Must | Event timeline shows the most recent events from the selected agent, most recent first, crossing task boundaries. Each event shows: relative timestamp, event type, description, and associated task. Pagination via "load more" if additional events exist |
| R8 | Must | Fleet summary bar spans the top of both panels showing agent counts by status (e.g., "4 active · 2 idle") with status-colored indicators |
| R9 | Must | View updates live via SSE — no manual refresh. New events update agent status, task durations, and detail panel in real time |
| R10 | Must | Switching between Kanban and Agent Operations Center preserves project/date filters |
| R11 | Must | Clicking any agent in the roster (active or idle) updates the detail panel to show that agent's information |
| R12 | Nice | Keyboard navigation: arrow keys to move through the agent list, Enter to select |
| R13 | Nice | Responsive mobile layout: on narrow viewports, collapse to a single-column agent list. Tapping an agent navigates to a full-screen detail view |
| R14 | Out | Agent management actions (reassign, kill, command) — this is read-only monitoring |
| R15 | Out | Aggregate analytics or historical trends — current fleet state only |
| R16 | Out | Push notifications, webhooks, or audio alerts |
| R17 | Out | Display-name aliases for agent IDs |
| R18 | Out | Configurable stuck thresholds or stuck/healthy labels — the view shows duration, not judgment |
| R19 | Out | Activity sparklines — deferred to reduce complexity. Task duration and status dots provide the at-a-glance signal |
| R20 | Out | Collapsible roster modes (compact/icon-only) — single expanded layout for v1 |

## Chosen Direction

**E3 "Collapsible Navigator"** — selected through 2 rounds of design exploration (15 variations across 7 families). See the full [design direction document](../design-directions/2026-03-01-agent-ops-center-design-direction.md).

The interaction model is a persistent split panel: an agent roster on the left and a detail panel on the right.

The left roster shows all agents in a single expanded layout with status dots, agent IDs, current task info, and task duration for active agents. Agents are sorted by activity — longest-running tasks at top, then idle agents by recency.

The right detail panel uses a **timeline-first** layout: event timeline with inline task context, then metrics where available from event data.

*Note: The original E3 design included collapsible roster modes (expanded/compact/icon-only) and activity sparklines. These have been descoped for v1 to reduce complexity. The single expanded layout delivers the core value — fleet health at a glance and easy agent-by-agent investigation.*

### Alternatives Considered

- **Incident Board** (Family A) — problems-first triage with expandable rows. Strong at surfacing issues but didn't provide the easy agent-by-agent navigation the operator needs for quick scanning.
- **Live Feed** (Family B) — real-time activity stream. Rejected entirely — timeline-centric organization doesn't match how operators think (agent-centric). Also assumed continuous utilization, which doesn't match real agent usage patterns.
- **Switchboard** (Family C) — all agents always visible. Good information density but diving into individual agents required separate screens.
- **Triage Strips** (Family D, Round 2) — merged A2 + C2 into dense expandable rows. Strong contender but the split-panel layout of E3 better supports the primary workflow of flipping between agents.

## Key Decisions

- **Agent-centric, not timeline-centric.** The primary object is the agent, not the event stream. Operators flip between agents in the roster, not scroll through interleaved timelines. This rejected all Live Feed approaches.
- **Duration over judgment.** The view shows task duration factually rather than labeling agents as "stuck" with a configurable threshold. Operators know their agents — a 30-minute task might be normal for one workflow and concerning for another. Showing the raw duration lets operators apply their own judgment without the system imposing definitions.
- **All agents always visible.** No filtering, collapsing idle agents, or hiding stale agents. The roster shows every known agent. Simplicity and predictability over information density optimization.
- **Timeline-first detail.** The event timeline is the most valuable drill-down view — it answers "what has this agent been doing?" in a single scroll. Metrics support but don't lead.
- **Single roster layout for v1.** Rather than three collapsible modes (expanded/compact/icon-only), ship with one expanded layout. This eliminates transition animations, toggle state management, and three parallel renderers. Collapsible modes can be added later if operators need more detail panel space.
- **No sparklines for v1.** Sparklines require resolving session semantics, time window decisions, and contextual silence classification. Task duration and status dots provide the essential at-a-glance signal without this complexity.
- **Desktop-first with mobile fallback.** The split-panel interaction model is desktop-oriented. Mobile gets horizontal scroll or a degraded single-column list, not a redesigned experience.

## Resolved During Tech Planning

- **[R6] Session definition:** `session_id` is never populated in practice — the CLI does not pass it, and most service methods don't forward it. The detail panel shows agent-level metrics (events on the agent's tasks, task duration, event count). No session grouping.
- **[R5] Agent aging:** The roster derives from `tasks_current.agent`, which is already indexed. With project/date filters applied, agents are naturally scoped to the relevant timeframe. For 2-20 agents this is performant without a cutoff. All agents matching the current filters are shown.

## Next Steps

→ Create technical plan
