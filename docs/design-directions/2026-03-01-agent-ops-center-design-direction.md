# Design Direction: Agent Operations Center

**Date:** 2026-03-01
**Rounds:** 2 (9 variations in Round 1, 6 in Round 2)
**Gallery:** v2.html

## Chosen Direction

### E3 "Collapsible Navigator" — Collapsible List + Maximized Detail

**Approach:** What if agent monitoring was a persistent two-panel layout — a compact roster list with sparklines on the left and a rich combined timeline + task detail view on the right, optimized for quick agent-by-agent flipping?

The winning interaction model is a persistent split panel where the left list adapts to the operator's current mode of work:

- **Expanded mode** (320px) — Full agent info with status dots, names, task titles, silence timers, and mini sparklines. For quick scanning of fleet health.
- **Compact mode** (~160px) — Agent name + status dot only. For when you know which agent you want and need more detail space.
- **Icon-only mode** (~56px, 36px icons) — Status-colored circles with 2-letter initials. Maximum detail panel width for deep investigation of a stuck agent.

The right detail panel shows a combined view with **timeline first** layout: session timeline with inline task context (claimed events expand to show full task details), followed by metrics cards (session duration, silence, progress, event count), followed by a session activity chart.

Key design decisions:
- **Agent-centric, not timeline-centric.** The primary object is the agent, not the event stream. Operators flip between agents, not scroll through interleaved timelines.
- **Silence is contextual.** Activity sparklines distinguish between silence mid-task (concerning, shown as red gap) and silence after completing a task (normal, session ended cleanly). Agents have fits and starts — continuous utilization is not assumed.
- **Collapsible list preserves spatial position.** Agents stay in the same vertical order across all three modes, so muscle memory works when switching between overview and investigation.
- **Any agent is investigable.** Not just stuck agents — active and idle agents can be selected for full detail too.
- **Fleet summary bar** spans the top of both panels for the 2-second health check.

## Design Parameters

- **Expanded list width:** 320px (adjusted from 360px default)
- **Icon size:** 36px (adjusted from 40px default)
- **Detail layout:** Timeline first (adjusted from combined default)
- **Dark theme:** Background #0f1117, panels #1a1d27, borders #2a2d3a
- **Status colors:** Stuck #ef4444, active #3b82f6, idle #6b7280, healthy #22c55e
- **Fonts:** Inter (UI), JetBrains Mono (agent IDs, timestamps, metrics)
- **Stuck threshold:** 5 minutes (configurable in UI: 5m/10m/15m/30m)

## Context

This view is a new top-level page in the HZL web dashboard, alongside the existing Kanban view. The Kanban answers "what's the state of the work?" — the Agent Operations Center answers "what's the state of the workers?"

Target users are operators running 2-20 AI agents on a shared HZL task board. They check the dashboard every few minutes for oversight, not continuous monitoring. The design must work for intermittent agent usage patterns, not just continuous production workloads.

**PRD:** docs/plans/2026-03-01-agent-ops-center-prd.md
