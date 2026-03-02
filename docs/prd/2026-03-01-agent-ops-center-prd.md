# Agent Operations Center — PRD

**Date:** 2026-03-01
**Status:** Brainstorming
**Design Direction:** [2026-03-01-agent-ops-center-design-direction.md](../design-directions/2026-03-01-agent-ops-center-design-direction.md)

## Goal

Give operators running 2-20 AI agents on a shared HZL task board a dedicated view to monitor agent health, detect stuck agents, and investigate agent activity — all from existing event store data with zero new instrumentation.

The Kanban view answers "what's the state of the work?" The Agent Operations Center answers "what's the state of the workers?"

## Scope

### In Scope

- New top-level view in the web dashboard alongside Kanban, accessible via the existing view selector
- Persistent split-panel layout with collapsible agent roster (left) and agent detail panel (right)
- Fleet summary bar showing active/stuck/idle counts
- Agent roster showing all known agents with status, task, silence timer, and activity sparklines
- Agent detail panel with session timeline, inline task context, and metrics
- Stuck detection with configurable threshold (5m/10m/15m/30m)
- Live updates via SSE (same mechanism as Kanban)
- Responsive mobile layout with degraded single-column mode
- Shared project/date filters with Kanban view

### Boundaries

- **Read-only monitoring.** No agent management (reassign, kill, command). Operators observe and then intervene outside HZL.
- **Current state only.** No aggregate analytics, throughput charts, or historical trends. The view shows what's happening now.
- **Visual-only stuck detection.** No push notifications, webhooks, or sounds. Stuck agents are visually prominent but don't generate alerts.
- **Raw agent IDs only.** No display-name aliases. Operators see whatever `agent_id` value is in the event store. Aliases deferred to a future iteration.
- **No idle-too-long alerting.** Idle agents are visually distinguished (gray, session-ended sparkline) but don't trigger warnings. Silence after completing a task is normal — only silence mid-task is concerning.
- **No agent registration.** The roster is derived from event data. Any `agent` value that has ever appeared on a task is a known agent.
- **No new event types or schema changes.** Everything needed already exists in the event store.

## Requirements

| ID | Priority | Requirement |
|----|----------|-------------|
| R1 | Core | Operator can assess fleet health (all healthy / something stuck / agents idle) within 2 seconds of opening the view — the visual pattern communicates status without reading text |
| R2 | Core | A stuck agent (in-progress task + no events for longer than the configured threshold) is the most visually prominent element in the view — unmissable without reading text |
| R3 | Must | Persistent split-panel layout: collapsible agent roster on the left, agent detail panel on the right |
| R4 | Must | Agent roster list supports three modes: expanded (320px, full info with sparklines), compact (~160px, name + status dot), and icon-only (~56px, status-colored circles with initials). Modes toggle via a button. Agents maintain the same vertical order across all modes |
| R5 | Must | Agent roster shows ALL known agents sorted by status priority (stuck first, then active by recency, then idle). No filtering, pagination, or hiding — scroll to see all |
| R6 | Must | Each agent row in expanded mode shows: status dot (color-coded), agent ID (monospace), current task title or "idle since [time]", silence timer, and a mini activity sparkline |
| R7 | Must | Activity sparklines distinguish between silence mid-task (red gap — concerning) and silence after completing a task (session ended normally — not alarming). Designed for intermittent usage patterns, not continuous utilization |
| R8 | Must | Detail panel shows timeline-first layout: session timeline with inline task context (claimed events expand to show task details), followed by metrics (session duration, silence, progress, event count), followed by session activity chart |
| R9 | Must | Session timeline shows the last ~25 events from the selected agent, most recent first, crossing task boundaries. Each event shows: relative timestamp, event type, description, and associated task |
| R10 | Must | Fleet summary bar spans the top of both panels showing agent counts by status (e.g., "4 active · 2 stuck · 2 idle") with status-colored indicators |
| R11 | Must | Stuck threshold is configurable in the UI: 5m / 10m / 15m / 30m. Default is 5 minutes. "Stuck" = agent has an in-progress task AND has emitted no events for longer than the threshold |
| R12 | Must | View updates live via SSE — no manual refresh. New events update agent status, sparklines, and detail panel in real time |
| R13 | Must | Switching between Kanban and Agent Operations Center preserves project/date filters |
| R14 | Must | Clicking any agent in the roster (stuck, active, or idle) updates the detail panel to show that agent's information |
| R15 | Nice | Responsive mobile layout: on narrow viewports, collapse to a single-column agent list. Tapping an agent navigates to a full-screen detail view. Reduced functionality but usable |
| R16 | Nice | Keyboard navigation: arrow keys to move through the agent list, Enter to select, shortcut to cycle list modes |
| R17 | Nice | Smooth CSS transitions between list modes (width, element visibility). No jarring reflows |
| R18 | Nice | Session activity chart in the detail panel — a wider sparkline visualization showing event cadence over the session duration |
| R19 | Out | Agent management actions (reassign, kill, command) — this is read-only monitoring |
| R20 | Out | Aggregate analytics or historical trends — current fleet state only |
| R21 | Out | Push notifications, webhooks, or audio alerts for stuck detection |
| R22 | Out | Display-name aliases for agent IDs |
| R23 | Out | Idle-too-long alerting — visual distinction is sufficient |

## Chosen Direction

**E3 "Collapsible Navigator"** — selected through 2 rounds of design exploration (15 variations across 7 families). See the full [design direction document](../design-directions/2026-03-01-agent-ops-center-design-direction.md).

The interaction model is a persistent split panel where the left list adapts to the operator's current mode:

- **Expanded** (320px) — full agent info with sparklines, for scanning fleet health
- **Compact** (~160px) — name + status dot, for when you know which agent you want
- **Icon-only** (~56px, 36px icons) — status-colored circles with initials, maximum detail panel width for deep investigation

The right detail panel uses a **timeline-first** layout: session events with inline task context, then metrics, then activity chart.

### Alternatives Considered

- **Incident Board** (Family A) — problems-first triage with expandable rows. Strong at surfacing stuck agents but didn't provide the easy agent-by-agent navigation the operator needs for quick scanning.
- **Live Feed** (Family B) — real-time activity stream. Rejected entirely — timeline-centric organization doesn't match how operators think (agent-centric). Also assumed continuous utilization, which doesn't match real agent usage patterns.
- **Switchboard** (Family C) — all agents always visible. Good information density (especially C2 "Status Strips" with inline sparklines) but diving into individual agents required separate screens. The sparkline concept was carried forward into the chosen direction.
- **Triage Strips** (Family D, Round 2) — merged A2 + C2 into dense expandable rows. Strong contender but the split-panel layout of E3 better supports the primary workflow of flipping between agents.

## Key Decisions

- **Agent-centric, not timeline-centric.** The primary object is the agent, not the event stream. Operators flip between agents in the roster, not scroll through interleaved timelines. This rejected all Live Feed approaches.
- **Contextual silence.** Activity sparklines distinguish mid-task silence (concerning) from post-task idle (normal). The view does not assume continuous agent utilization — agents have fits and starts, and silence between sessions is expected.
- **Collapsible list for mode-switching.** Rather than fixed layouts, the list adapts to the operator's current task: scanning (expanded), browsing (compact), or investigating (icon-only). This avoids the "good for overview OR good for detail, not both" trade-off.
- **All agents always visible.** No filtering, collapsing idle agents, or hiding stale agents. The roster shows every known agent. Simplicity and predictability over information density optimization.
- **Timeline-first detail.** The session timeline is the most valuable drill-down view — it answers "what has this agent been doing?" in a single scroll. Metrics and activity charts support but don't lead.
- **Desktop-first with mobile fallback.** The split-panel interaction model is desktop-oriented. Mobile gets a degraded single-column list with tap-to-navigate detail, not a redesigned experience.

## Open Questions

- **[Affects R7, R18]** What time window should sparklines cover? The design exploration used 30 minutes. Should this be configurable or fixed?
- **[Affects R9]** What defines a "session"? The event store captures `session_id` — is this reliably populated, or should sessions be inferred from event gaps? This affects how the timeline groups events.
- **[Affects R5]** At what point (if ever) do agents age out of the roster? If an agent was last active 3 weeks ago, should it still appear? Or is "show all known agents" truly all-time?

## Next Steps

→ Create technical plan
