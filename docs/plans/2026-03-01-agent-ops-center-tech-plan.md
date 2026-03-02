# Agent Operations Center — Technical Plan

**Date:** 2026-03-01
**Status:** Planning
**PRD:** [docs/prd/2026-03-01-agent-ops-center-prd.md](../prd/2026-03-01-agent-ops-center-prd.md)

## Overview

Add an Agent Operations Center view to the HZL web dashboard — a split-panel interface where operators can monitor fleet health, see task durations, and investigate individual agent activity. The view is read-only, built entirely from existing event store data with zero new event types or schema changes.

The implementation extends the existing Kanban view architecture: same React SPA patterns, same SSE mechanism, same CSS custom property system. New backend queries use `tasks_current` (for agent roster) and `events` (for agent timelines) via two-step cross-DB queries, exposed via two new API endpoints.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Browser (React SPA)                                     │
│                                                         │
│  App.tsx                                                │
│    ├─ FilterBar (adds 'agents' to ViewMode select)      │
│    ├─ Board          (view === 'kanban')                │
│    ├─ CalendarView   (view === 'calendar')              │
│    ├─ GraphView      (view === 'graph')                 │
│    └─ AgentOpsView   (view === 'agents')  ◀── NEW      │
│         ├─ FleetSummary                                 │
│         ├─ AgentRoster                                  │
│         │    └─ AgentRow (per agent)                    │
│         └─ AgentDetail                                  │
│              ├─ EventTimeline                           │
│              └─ AgentMetrics                            │
│                                                         │
│  Hooks: useAgents(), useAgentEvents()                   │
│  SSE: existing useSSE() → triggers refresh              │
└──────────────┬──────────────────────────────────────────┘
               │ fetch
┌──────────────▼──────────────────────────────────────────┐
│ hzl-web server.ts                                       │
│                                                         │
│  GET /api/agents          → getAgentRoster()            │
│  GET /api/agents/:id/events → getAgentEvents()          │
│  GET /api/events/stream   (existing SSE, unchanged)     │
└──────────────┬──────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────┐
│ hzl-core TaskService                                    │
│                                                         │
│  getAgentRoster(opts)     → queries tasks_current       │
│  getAgentEvents(id, opts) → queries events + tasks_curr │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**Agent identity = `tasks_current.agent`**, not `events.agent_id`. The `agent` column on the projection is the reliable ownership field — it's set on claim, preserved on completion, and has a dedicated index (`idx_tasks_current_agent`). The envelope's `agent_id` is only populated when the CLI receives `--agent-id`, which is inconsistent. The roster is derived entirely from `tasks_current.agent`.

**Events for an agent = events on that agent's tasks.** Rather than filtering `events.agent_id` (unreliable), the timeline shows all events on tasks where `tasks_current.agent = ?`. This uses the existing `idx_events_task_id` index — no new indexes needed. This answers "what happened on this agent's tasks" which is what operators want.

**`session_id` is not used.** Investigation confirmed it's never populated by the CLI. The detail panel shows agent-level metrics (task duration, event count, progress) rather than session-scoped metrics.

**Consistent styling.** The Agent Ops view uses the existing CSS custom properties (`--bg-primary`, `--bg-secondary`, `--bg-card`, `--text-primary`, `--font-mono`, `--status-*`). The design direction document specified different values from a standalone design exploration — the implementation matches the existing dashboard aesthetic for visual consistency across views.

**No new projections.** All data is derived from `tasks_current` (cache DB) + `events` (events DB) via two-step queries. No new projection tables, no new projectors.

---

## 1. Data Layer

### 1.1 Add agent roster query to TaskService

**Depends on:** none
**Files:** `packages/hzl-core/src/services/task-service.ts`, `packages/hzl-core/src/services/task-service.test.ts`

Add `getAgentRoster(opts?: { project?: string; sinceDays?: number })` to TaskService. Uses two simple queries (not a complex GROUP BY with json_group_array):

**Query 1 — distinct agents with status:**
```sql
SELECT agent,
       MAX(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as is_active,
       MAX(updated_at) as last_activity
FROM tasks_current
WHERE agent IS NOT NULL AND agent != ''
  -- optional: AND project = ?
  -- optional: AND updated_at >= datetime('now', '-N days')
GROUP BY agent
ORDER BY is_active DESC,
         CASE WHEN MAX(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) = 1
              THEN MIN(CASE WHEN status = 'in_progress' THEN updated_at END)
              ELSE NULL END ASC,
         last_activity DESC
```

**Query 2 — in-progress tasks for active agents:**
```sql
SELECT agent, task_id, title, status, progress, updated_at as claimed_at
FROM tasks_current
WHERE agent IN (?) AND status = 'in_progress'
ORDER BY updated_at ASC
```

Join in JS: group query 2 results by agent, attach as `tasks` array to each agent from query 1. Idle agents get an empty `tasks` array.

Return type: array of `{ agent: string; isActive: boolean; tasks: Array<{ taskId: string; title: string; claimedAt: string; status: string; progress: number | null }>; lastActivity: string }`.

The `tasks` array contains only in-progress tasks — this is what the roster needs for displaying task titles and durations. Idle agents have an empty array. An agent can own multiple in-progress tasks — return all of them so the frontend can show the primary one and a count.

Follow the same query style as `listTasks()` (parameterized). Use `IN (${agents.map(() => '?').join(',')})` for the parameterized IN clause in query 2.

**Test scenarios:** (`packages/hzl-core/src/services/task-service.test.ts`)
- No agents in DB → empty array
- Agent with one in-progress task → isActive=true, tasks has one entry with correct claimedAt
- Agent with completed task only → isActive=false, tasks is empty, lastActivity reflects completion time
- Agent with multiple in-progress tasks → isActive=true, tasks has all in-progress entries
- Project filter → only agents on tasks in that project appear
- Sort order → active agents sorted by oldest claimed_at first, then idle sorted by most recent updated_at
- Agent column is null or empty → excluded from results
- Agent who owned a task that was re-assigned → agent reflects current `tasks_current.agent`, not history

**Verify:** `pnpm --filter hzl-core test src/services/task-service.test.ts`

### 1.2 Add agent events query to TaskService

**Depends on:** none
**Files:** `packages/hzl-core/src/services/task-service.ts`, `packages/hzl-core/src/services/task-service.test.ts`

Add `getAgentEvents(agentId: string, opts?: { limit?: number; offset?: number })` to TaskService. The events DB and cache DB are separate SQLite files — a direct JOIN across them won't work. Use a three-step approach:

**Step 1 — get task_ids and titles from cache DB:**
```sql
SELECT task_id, title, status FROM tasks_current WHERE agent = ?
```
Uses `idx_tasks_current_agent`. Returns the task_ids to query in the events DB, plus titles/status for enrichment.

**Step 2 — get events from events DB:**
If step 1 returned zero task_ids, skip this query and return `{ events: [], total: 0 }` (an `IN ()` clause with zero elements is a SQL error).

```sql
SELECT id, event_id, task_id, type, data, author, agent_id, timestamp
FROM events
WHERE task_id IN (${taskIds.map(() => '?').join(',')})
ORDER BY id DESC
LIMIT ? OFFSET ?
```
Uses `idx_events_task_id` for the IN clause.

**Step 3 — get total count from events DB:**
```sql
SELECT COUNT(*) as total FROM events
WHERE task_id IN (${taskIds.map(() => '?').join(',')})
```
Same parameterized IN clause as step 2. Needed for "load more" pagination (R7).

**Step 4 — enrich in JS:** Build a `Map<taskId, { title, status }>` from step 1, then map over the events array to attach `taskTitle` and `taskStatus` from the map.

Default limit: 50, max: 200.

Return type: `{ events: Array<{ id: number; eventId: string; taskId: string; type: string; data: Record<string, unknown>; author?: string; agentId?: string; timestamp: string; taskTitle: string; taskStatus: string }>; total: number }`.

Follow the same split-DB pattern used by `ProjectionEngine` (holds `db` and `eventsDb` separately). Look at how `handleTaskEvents` in `server.ts` queries the events store directly.

**Test scenarios:** (`packages/hzl-core/src/services/task-service.test.ts`)
- Agent with no tasks → empty events, total=0
- Agent with tasks and events → events sorted by id descending, enriched with task titles
- Limit/offset pagination → first page returns newest events, second page returns older ones
- Events cross task boundaries → events from multiple tasks interleaved by timestamp
- Total count is accurate across pages
- Agent with done tasks → events still returned (agent is preserved on completion)

**Verify:** `pnpm --filter hzl-core test src/services/task-service.test.ts`

---

## 2. API Layer

### 2.1 Add agent API endpoints to web server

**Depends on:** 1.1, 1.2
**Files:** `packages/hzl-web/src/server.ts`, `packages/hzl-web/src/server.test.ts`

Add two new route handlers following the existing pattern (plain `if (pathname === ...)` checks, same as `handleTasks`, `handleEvents`, etc.):

**`GET /api/agents`** — handler: `handleAgents`
- Params: `project` (optional), `since` (optional, same values as tasks endpoint: 1d/3d/7d/14d/30d)
- Calls `taskService.getAgentRoster({ project, sinceDays })`
- Returns: `{ agents: AgentRosterItem[] }`
- Follow the same param parsing as `handleTasks` for `project` and `since`

**`GET /api/agents/:id/events`** — handler: `handleAgentEvents`
- Route matching: regex pattern like `handleTaskDetail` uses for `/api/tasks/:id`
- Params: `limit` (optional, default 50, max 200), `offset` (optional, default 0)
- The `:id` is the agent string (URL-decoded). Agent IDs can contain special characters — use `decodeURIComponent`
- Calls `taskService.getAgentEvents(agentId, { limit, offset })`
- Returns: `{ events: AgentEvent[], total: number }`

Register both routes before the fallback SPA handler. Follow error handling patterns from existing endpoints (try/catch, 400 for bad params, 404 for not found, 500 for server errors).

**Test scenarios:** (`packages/hzl-web/src/server.test.ts`)
- GET /api/agents with no data → `{ agents: [] }`
- GET /api/agents with project filter → only agents on that project
- GET /api/agents/:id/events → events sorted by recency, enriched with task info
- GET /api/agents/:id/events with limit/offset → paginated correctly
- Agent ID with special characters (URL encoding) → decoded properly
- Unknown agent ID → empty events (not 404 — agent may have existed but has no current tasks)

**Verify:** `pnpm --filter hzl-web test` and manual: `curl http://localhost:3456/api/agents`

---

## 3. Frontend — View Shell

### 3.1 Add 'agents' ViewMode and wire into navigation

**Depends on:** none
**Files:** `packages/hzl-web/src/app/hooks/useUrlState.ts`, `packages/hzl-web/src/app/components/Filters/FilterBar.tsx`, `packages/hzl-web/src/app/App.tsx`

Three changes:

1. **`useUrlState.ts`**: Add `'agents'` to the `ViewMode` type union. Update `parseUrlState()` to accept `view=agents` from the URL. Update `syncUrlState()` to write it. Add `selectedAgent?: string` to `UrlState` — read from `?agent=...` param, written back on change.

2. **`FilterBar.tsx`**: Add `<option value="agents">Agents</option>` to the `viewFilter` select. When `view === 'agents'`, hide the Kanban-specific settings (column visibility, subtask controls, collapse parents, search) — these don't apply to the agent view. Keep project and date filters visible (shared per R10).

3. **`App.tsx`**: Add the conditional render block `{view === 'agents' && <AgentOpsView ... />}` alongside the existing view blocks. Pass through `project`, `since`, and filter change callbacks. For now, render a placeholder `<div>Agent Ops view coming soon</div>` — components are built in subsequent subtasks. Add `selectedAgent` and `setSelectedAgent` state.

Follow the exact pattern used by CalendarView and GraphView for how they're wired into App.tsx — same prop threading, same refresh behavior on view change.

**Test scenarios:** (manual verification)
- Select "Agents" from settings dropdown → URL updates to `?view=agents`
- Switching to Agents view → Kanban-specific filter controls hidden
- Project/date filters remain visible and functional
- Switching back to Kanban → Kanban controls reappear
- `?view=agents` in URL on page load → Agents view renders

**Verify:** `pnpm --filter hzl-web build` succeeds, manual verification in browser

### 3.2 Create AgentOpsView split-panel layout

**Depends on:** 3.1
**Files:** `packages/hzl-web/src/app/components/AgentOps/AgentOpsView.tsx`, `packages/hzl-web/src/app/components/AgentOps/AgentOps.css`

Create the top-level view component with the persistent split-panel layout (R3):

- Container: `display: flex; height: calc(100vh - header height)`. The header height is the existing `<header>` element — measure it or use the same approach as the Board.
- Left panel (roster): `width: 320px; flex-shrink: 0; overflow-y: auto; border-right: 1px solid var(--border)`. The 320px matches the design direction's expanded mode width.
- Right panel (detail): `flex: 1; overflow-y: auto`.
- Fleet summary bar (R8): spans full width above the two panels. Use `display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); background: var(--bg-secondary)`.

Props: `selectedAgent`, `onSelectAgent`, `project`, `since`. The component orchestrates the two panels and the fleet summary.

For now, render placeholder content in each panel region — the roster, detail, and fleet summary components are built in subsequent subtasks.

Use the existing CSS custom properties for all styling — `--bg-primary` for panel backgrounds, `--bg-secondary` for the fleet summary, `--border` for dividers, `--text-primary`/`--text-secondary` for text. Follow the CSS file naming pattern used by other components (e.g., `Card/Card.css`, `Filters/FilterBar.css`).

**Test scenarios:** (manual verification)
- Split panel renders with correct proportions
- Left panel scrolls independently of right panel
- Fleet summary bar is fixed at top
- Resize browser → panels respond correctly, content doesn't overflow

**Verify:** `pnpm --filter hzl-web build`, visual check in browser at `?view=agents`

---

## 4. Frontend — Roster Panel

### 4.1 Create useAgents hook and AgentRoster component

**Depends on:** 2.1, 3.2
**Files:** `packages/hzl-web/src/app/hooks/useAgents.ts`, `packages/hzl-web/src/app/components/AgentOps/AgentRoster.tsx`, `packages/hzl-web/src/app/components/AgentOps/AgentOps.css`

**`useAgents` hook:** Follows the pattern of `useTasks` — calls `fetchJson('/api/agents', { project, since })`, returns `{ agents, loading, error, refresh }`. Called from AgentOpsView. The refresh function is wired to SSE updates (subtask 6.1).

**`AgentRoster` component:** Renders the scrollable agent list (R4, R5). Props: `agents`, `selectedAgent`, `onSelectAgent`.

Each agent row (inline, no separate component needed at this scale) shows:
- **Status dot**: `width: 10px; height: 10px; border-radius: 50%`. Color: `var(--status-in-progress)` for active (amber), `var(--status-backlog)` for idle (gray). Use the existing status color vars.
- **Agent ID**: `font-family: var(--font-mono); font-size: 0.8rem`. Monospace, truncated with ellipsis if long.
- **Task info (active)**: Task title (truncated to 1 line), task duration as relative time (e.g., "42m", "2h 15m"). Duration is computed client-side from `claimedAt` using `Date.now() - Date.parse(claimedAt)`. Format with a helper: `<1m` → "just now", minutes → "Nm", hours → "Nh Nm".
- **Task info (idle)**: "idle since [relative time]" in `var(--text-muted)`.
- **Selected state**: `background: var(--bg-card)` with left border accent.

Sort order is server-provided (1.1 handles sorting). Client just renders in order.

Clicking a row calls `onSelectAgent(agent.agent)` which updates the selected agent (R11).

For agents with multiple in-progress tasks, show the first task title and a count badge: "(+2 more)".

**Test scenarios:** (manual verification + API integration)
- Agents render in correct order (active first by duration, then idle)
- Clicking agent highlights it and updates detail panel
- Active agents show task title and duration
- Idle agents show "idle since" with relative time
- Duration updates in real time (re-render on interval or SSE)
- Agent with multiple in-progress tasks shows count

**Verify:** `pnpm --filter hzl-web build`, visual check with test data

### 4.2 Create FleetSummary bar

**Depends on:** 4.1
**Files:** `packages/hzl-web/src/app/components/AgentOps/FleetSummary.tsx`, `packages/hzl-web/src/app/components/AgentOps/AgentOps.css`

Simple component that computes and displays agent counts from the agents array (R8). Props: `agents: AgentRosterItem[]`.

Display: `"N active · M idle"` with colored dots matching the status colors. If no agents: "No agents found". Use the fleet summary bar styles defined in 3.2.

Count logic: `active = agents.filter(a => a.isActive).length`, `idle = agents.length - active`.

**Test scenarios:** (manual verification)
- No agents → "No agents found"
- 3 active, 2 idle → "3 active · 2 idle" with correct colored dots
- All active → "5 active · 0 idle" (or just "5 active")
- All idle → "0 active · 3 idle"

**Verify:** Visual check in browser

---

## 5. Frontend — Detail Panel

### 5.1 Create useAgentEvents hook and EventTimeline component

**Depends on:** 2.1, 3.2
**Files:** `packages/hzl-web/src/app/hooks/useAgentEvents.ts`, `packages/hzl-web/src/app/components/AgentOps/EventTimeline.tsx`, `packages/hzl-web/src/app/components/AgentOps/AgentOps.css`

**`useAgentEvents` hook:** Calls `fetchJson('/api/agents/${encodeURIComponent(agentId)}/events', { limit, offset })`. Returns `{ events, total, loading, error, loadMore }`. The `loadMore` function increments offset and appends results. Resets when `agentId` changes. Follows the same pattern as the existing `useTasks` hook but with pagination. Returns `null` events when no agent is selected.

**`EventTimeline` component:** Renders the event list (R7). Props: `events`, `total`, `onLoadMore`, `loading`.

Each event row shows:
- **Relative timestamp**: "2m ago", "1h ago", "yesterday" — use the same time formatting helper as duration. Monospace, `var(--text-muted)`, fixed width column.
- **Event type badge**: Short label like "claimed", "completed", "commented", "progress", "created". Color-coded using existing status colors where applicable (status_changed → use the `to` status color). Small pill/badge style.
- **Description**: Human-readable summary generated from event data. E.g., `status_changed` → "backlog → in_progress", `comment_added` → first 80 chars of comment text, `task_updated` → "updated {field}: {old} → {new}", `checkpoint_recorded` → "checkpoint: {name}".
- **Task context**: Task title shown inline, styled as a subtle label. Since events cross task boundaries (R7), show the task title so the operator knows which task each event belongs to. Use `var(--text-secondary)`.

"Load more" button at the bottom when `events.length < total`. Shows remaining count.

Task-related events (status_changed to in_progress, task_created) can expand on click to show task details — title, project, progress, description preview. Use a simple toggle state per event row.

**Test scenarios:** (manual verification)
- No agent selected → empty state message
- Agent with events → timeline renders newest first
- Events from different tasks show task titles
- "Load more" appears when more events exist
- Clicking "Load more" appends older events
- Event type badges use appropriate colors
- Expanding a task event shows task context

**Verify:** `pnpm --filter hzl-web build`, visual check with test data

### 5.2 Create AgentDetail component with metrics

**Depends on:** 5.1, 4.1
**Files:** `packages/hzl-web/src/app/components/AgentOps/AgentDetail.tsx`, `packages/hzl-web/src/app/components/AgentOps/AgentOps.css`

The right-panel container component (R6). Props: `agent` (selected agent data from roster), `events`, `total`, `onLoadMore`, `loading`.

Layout (timeline-first per R6):
1. **Agent header**: Agent ID (large, monospace), status badge (active/idle), current task title if active.
2. **Event timeline**: The EventTimeline component from 5.1.
3. **Metrics section**: Simple grid of metric cards below the timeline. Each card: label + value, styled like the existing card components.

Metrics to show (R6 — "where available from event data"):
- **Task duration**: For active agents, time since `claimedAt`. Computed client-side. Format as "Xh Ym".
- **Event count**: Total events from the API response.
- **Progress**: If the active task has progress, show it as "N%".
- **Tasks owned**: Count of all tasks (active + done) owned by this agent.

Empty state (no agent selected): Show a centered message "Select an agent to view details" with an arrow-left icon pointing to the roster. Follow the pattern of how `TaskModal` handles empty state.

**Test scenarios:** (manual verification)
- No agent selected → empty state
- Active agent → header shows task info, duration metric updates
- Idle agent → header shows "idle since", no duration metric
- Event timeline fills the main area
- Metrics display at bottom
- Agent with progress → progress metric shown

**Verify:** `pnpm --filter hzl-web build`, visual check

---

## 6. Integration & Polish

### 6.1 Wire SSE for live updates and add URL state persistence

**Depends on:** 4.1, 5.1, 3.1
**Files:** `packages/hzl-web/src/app/App.tsx`, `packages/hzl-web/src/app/hooks/useUrlState.ts`

**SSE integration (R9):** The existing `useSSE` hook in App.tsx triggers `refreshAll()` on any update event. Extend `refreshAll()` to also call the `useAgents().refresh()` and `useAgentEvents().refresh()` functions when `view === 'agents'`. This matches how SSE already triggers `refreshTasks()` for the Kanban view — the SSE mechanism broadcasts "something changed" and each view re-fetches its data.

Also add a 60-second interval timer that re-renders the roster when `view === 'agents'` — this keeps the relative duration displays ("42m", "1h 15m") ticking without waiting for an SSE event. Use `setInterval` with cleanup in `useEffect`.

**URL state persistence (R10):** Ensure the `selectedAgent` param is included in `syncUrlState()` so the URL reflects the currently selected agent (e.g., `?view=agents&agent=claude-abc`). On page load with `?agent=...`, auto-select that agent in the roster.

Verify that switching between Kanban and Agents preserves project/date filters — this should work automatically since `project` and `since` are already in the URL state, but confirm.

**Test scenarios:** (manual verification)
- SSE event arrives → agent roster and detail panel refresh
- Duration counters tick without SSE (interval refresh)
- URL contains `?view=agents&agent=xyz` → agent auto-selected on load
- Switch to Kanban and back → project filter preserved, selected agent preserved

**Verify:** Manual testing with live data — create tasks, claim them, verify updates appear

### 6.2 Add keyboard navigation

**Depends on:** 4.1
**Files:** `packages/hzl-web/src/app/components/AgentOps/AgentRoster.tsx`

Add keyboard navigation for the agent roster (R12). When the roster has focus:
- **Arrow Up/Down**: Move selection through agent list
- **Enter**: Confirm selection (same as click)
- **Home/End**: Jump to first/last agent

Implementation: add `tabIndex={0}` to the roster container, `onKeyDown` handler that tracks a `focusedIndex` state. The focused agent gets a visible focus ring (use `outline` or `box-shadow` in `var(--accent)`). Enter on a focused agent calls `onSelectAgent`.

Follow the pattern of how keyboard shortcuts work in the existing dashboard — `App.tsx` has a `handleGlobalKeyDown` for shortcuts like `/` for search and `?` for shortcuts panel. The agent roster keyboard nav is scoped to the roster component, not global.

**Test scenarios:** (manual verification)
- Tab to roster → first agent focused
- Arrow Down → next agent focused
- Arrow Up → previous agent focused
- Enter → agent selected, detail panel updates
- Arrow at boundary → wraps or stops (no crash)

**Verify:** Manual keyboard testing in browser

---

## Testing Strategy

- **New coverage:** Agent roster query (unit tests in task-service.test.ts), agent events query (unit tests), API endpoints (integration tests in server.test.ts). These validate the core data flow — SQL correctness, sort order, pagination, cross-task event aggregation.
- **Unit tests:** TaskService methods — roster grouping/sorting, events pagination, edge cases (no agents, null agent fields, multiple in-progress tasks). Follow the existing test patterns in task-service.test.ts which use a real SQLite DB with test fixtures.
- **Integration tests:** Server endpoint tests — HTTP request/response, param parsing, error handling. Follow patterns in server.test.ts.
- **Manual verification:** UI behavior — split panel layout, roster interaction, event timeline rendering, SSE updates, URL state persistence, keyboard navigation. Build the CLI test fixture: create a project, add tasks, claim them as different agents, complete some, leave others in-progress — then verify the Agent Ops view shows the expected state.

```bash
# Quick smoke test fixture
node packages/hzl-cli/dist/cli.js task add "Research API design" -p demo
node packages/hzl-cli/dist/cli.js task add "Implement endpoint" -p demo
node packages/hzl-cli/dist/cli.js task add "Write tests" -p demo
node packages/hzl-cli/dist/cli.js task claim <id1> --agent claude-alpha
node packages/hzl-cli/dist/cli.js task claim <id2> --agent claude-beta
node packages/hzl-cli/dist/cli.js task complete <id1> --agent claude-alpha
# Now: claude-alpha has 1 done task (idle), claude-beta has 1 in-progress task (active)
```

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Split-DB query for agent events — events DB and cache DB are separate SQLite files, can't JOIN across them | Three-step query: get task_ids + titles from cache DB, get events from events DB with parameterized IN clause, enrich in JS. Empty task_ids list short-circuits to empty result. Verified this pattern works — `handleTaskEvents` already queries events DB directly |
| Duration display jitter — client-side relative time could drift or flash on re-render | 60-second interval timer for duration updates, not per-second. Relative time format is coarse (minutes/hours) so small drifts are invisible |
| Large event volumes for prolific agents — agent with 1000+ events across many tasks | Pagination with default limit=50, "load more" pattern. Initial load is fast; operator loads more only when investigating |
| `tasks_current.agent` field being empty for tasks created before agent tracking | PRD boundary: "agents without IDs are excluded from the roster." The WHERE clause filters `agent IS NOT NULL AND agent != ''` |
| Agent IDs with special characters in URLs | Use `encodeURIComponent`/`decodeURIComponent` for the `:id` parameter in both client and server |

## Open Questions

None — all decisions resolved. Session semantics investigated and resolved (session_id unpopulated → agent-level metrics). Agent aging resolved (scoped by project/date filters).
