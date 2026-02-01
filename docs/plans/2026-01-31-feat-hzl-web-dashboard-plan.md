# feat: Add hzl-web dashboard

**Date:** 2026-01-31
**Type:** feat
**Brainstorm:** [2026-01-31-hzl-web-dashboard-brainstorm.md](../brainstorms/2026-01-31-hzl-web-dashboard-brainstorm.md)

## Overview

A lightweight Kanban-style web dashboard for monitoring hzl tasks in near real-time. Each hzl instance runs its own dashboard server, started via `hzl serve --port 3456`.

## Problem Statement

hzl is opaque by design - it's a CLI tool where agents work autonomously. But developers need visibility into what's happening: which tasks are in progress, what's blocked, what's completed. Currently, the only way to see this is by running CLI commands repeatedly.

## Proposed Solution

Add a web-based dashboard that:
- Runs locally via `hzl serve`
- Shows a Kanban board with live task status
- Provides filtering by date and project
- Works on desktop (Kanban) and mobile (tabs)
- Requires zero build step - single embedded HTML file

## Architecture

```
┌─────────────────┐     polls every 1-30s   ┌──────────────────┐
│   Browser UI    │ ◄─────────────────────► │   hzl serve      │
│ (vanilla JS)    │        JSON API         │ (Node.js http)   │
└─────────────────┘                         └────────┬─────────┘
                                                     │
                                                     ▼
                                            ┌──────────────────┐
                                            │   hzl-core       │
                                            │ TaskService      │
                                            │ EventStore       │
                                            └────────┬─────────┘
                                                     │
                                                     ▼
                                            ┌──────────────────┐
                                            │   SQLite DBs     │
                                            └──────────────────┘
```

## Technical Approach

### Phase 1: Package Scaffolding

Create `packages/hzl-web/` following existing patterns.

**Tasks:**
- [ ] Create `packages/hzl-web/package.json` (type: module, workspace dependency on hzl-core)
- [ ] Create `packages/hzl-web/tsconfig.json` (extends root, references hzl-core)
- [ ] Create `packages/hzl-web/src/index.ts` (exports startServer)
- [ ] Add hzl-web to root package.json workspaces
- [ ] Verify `npm run build` succeeds

**Files:**
- `packages/hzl-web/package.json`
- `packages/hzl-web/tsconfig.json`
- `packages/hzl-web/src/index.ts`

### Phase 2: HTTP Server & API

Implement the JSON API using Node's built-in `http` module.

**API Endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /` | Serve embedded HTML |
| `GET /api/tasks` | Task list with filters |
| `GET /api/tasks/:id` | Task detail |
| `GET /api/tasks/:id/comments` | Task comments |
| `GET /api/tasks/:id/checkpoints` | Task checkpoints |
| `GET /api/events` | Recent events (max 50) |
| `GET /api/stats` | Counts by status |

**Query Parameters for `/api/tasks`:**
- `since` - Date preset: `1d`, `3d`, `7d`, `14d`, `30d` (filters by `updated_at`)
- `project` - Project name filter

**Tasks:**
- [ ] Create `packages/hzl-web/src/server.ts` with HTTP server
- [ ] Implement routing (simple switch on pathname)
- [ ] Implement `GET /api/tasks` with date/project filtering
- [ ] Implement `GET /api/tasks/:id` using TaskService.getTaskById()
- [ ] Implement `GET /api/tasks/:id/comments`
- [ ] Implement `GET /api/tasks/:id/checkpoints`
- [ ] Implement `GET /api/events?since=<event_id>` (query events table)
- [ ] Implement `GET /api/stats` (counts by status)
- [ ] Add blocked task detection (ready status + unmet dependencies)
- [ ] Bind to 0.0.0.0 for Tailscale access

**Files:**
- `packages/hzl-web/src/server.ts`
- `packages/hzl-web/src/routes/tasks.ts`
- `packages/hzl-web/src/routes/events.ts`
- `packages/hzl-web/src/routes/stats.ts`

**Key Queries:**

```sql
-- Tasks with date filter (updated_at within range)
SELECT task_id, title, project, status, priority,
       claimed_by_agent_id, lease_until, updated_at
FROM tasks_current
WHERE status != 'archived'
  AND updated_at >= datetime('now', '-3 days')
ORDER BY priority DESC, updated_at DESC;

-- Blocked detection: ready tasks with unmet dependencies
SELECT tc.task_id, GROUP_CONCAT(td.depends_on_task_id) as blocked_by
FROM tasks_current tc
JOIN task_dependencies td ON tc.task_id = td.task_id
JOIN tasks_current dep ON td.depends_on_task_id = dep.task_id
WHERE tc.status = 'ready' AND dep.status != 'done'
GROUP BY tc.task_id;

-- Recent events for activity feed
SELECT e.*, tc.title as task_title
FROM events e
LEFT JOIN tasks_current tc ON e.task_id = tc.task_id
WHERE e.type IN ('status_changed', 'comment_added', 'checkpoint_recorded', 'task_created')
  AND e.id > ?
ORDER BY e.id DESC
LIMIT 50;
```

### Phase 3: CLI Command

Add `hzl serve` command to hzl-cli.

**Usage:**
```bash
hzl serve                # Start foreground on default port 3456
hzl serve --port 8080    # Start on custom port
hzl serve --background   # Fork to background, write PID
hzl serve --stop         # Stop background server
hzl serve --status       # Check if running
hzl serve --print-systemd  # Output systemd unit file for OpenClaw
```

**Foreground Output:**
```
hzl dashboard running at http://localhost:3456
Listening on 0.0.0.0:3456 (accessible from network)
Press Ctrl+C to stop
```

**Background Output:**
```
hzl dashboard started in background
  URL: http://localhost:3456
  PID: 12345
  Log: ~/.local/share/hzl/serve.log

Run 'hzl serve --stop' to stop
```

**Background Mode Implementation:**
- PID stored in `$XDG_DATA_HOME/hzl/serve.pid` (or `.local/hzl/serve.pid` in dev mode)
- Logs to `serve.log` in same directory
- `--background` uses `spawn(..., { detached: true, stdio: 'ignore' })`
- `--stop` reads PID file and sends SIGTERM
- `--status` checks if PID is running and shows port

**systemd Helper (--print-systemd):**
```ini
[Unit]
Description=hzl task dashboard
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/hzl serve --port 3456
Restart=on-failure

[Install]
WantedBy=default.target
```

User installs with:
```bash
hzl serve --print-systemd > ~/.config/systemd/user/hzl-web.service
systemctl --user daemon-reload
systemctl --user enable --now hzl-web
```

**Tasks:**
- [ ] Create `packages/hzl-cli/src/commands/serve.ts`
- [ ] Register command in `packages/hzl-cli/src/index.ts`
- [ ] Implement foreground mode with graceful shutdown
- [ ] Implement `--background` with PID/log management
- [ ] Implement `--stop` to kill background process
- [ ] Implement `--status` to check running state
- [ ] Implement `--print-systemd` to output unit file
- [ ] Handle port-in-use error gracefully
- [ ] Add `hzl-web` dependency to hzl-cli package.json

**Files:**
- `packages/hzl-cli/src/commands/serve.ts`
- `packages/hzl-cli/src/index.ts` (add import)
- `packages/hzl-cli/package.json` (add dependency)

### Phase 4: Frontend - Kanban Board

Single HTML file with embedded CSS and JavaScript.

**Layout (Desktop):**
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  hzl dashboard      Last 3 days ▼   Project: All ▼   Refresh: 5s ▼   ●   [Activity] │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────────┐ ┌───────────┐             │
│ │BACKLOG (8)│ │BLOCKED (2)│ │ READY (3) │ │IN_PROGRESS 2│ │  DONE (12)│             │
│ └───────────┘ └───────────┘ └───────────┘ └─────────────┘ └───────────┘             │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Task Card Content:**
- Task ID (truncated)
- Title (2 lines max, ellipsis)
- Project name
- For blocked: "Blocked by: task-xx, task-yy"
- For in_progress: Agent name + lease time remaining

**Style:**
- Background: `#1a1a1a`
- Accent: `#f59e0b` (amber)
- Font: system monospace stack
- Cards: muted borders, no shadows

**Tasks:**
- [ ] Create `packages/hzl-web/src/ui/index.html`
- [ ] Implement CSS (dark theme, responsive)
- [ ] Implement Kanban column layout (flexbox)
- [ ] Implement task card component
- [ ] Implement header with filters (date, project, refresh)
- [ ] Implement connection indicator
- [ ] Embed HTML as string constant at build time

**Files:**
- `packages/hzl-web/src/ui/index.html`
- `packages/hzl-web/src/ui-embed.ts` (embeds HTML as const)

### Phase 5: Frontend - Interactivity

**Polling:**
```javascript
let pollInterval = 5000; // Default 5s
let pollTimer = null;

function startPolling() {
  poll();
  pollTimer = setInterval(poll, pollInterval);
}

function stopPolling() {
  clearInterval(pollTimer);
}

// Pause when tab hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopPolling();
  else startPolling();
});
```

**Filters:**
- Date preset dropdown: today, 3d (default), 7d, 14d, 30d
- Project dropdown: populated from current tasks
- Refresh dropdown: 1s, 2s, 5s (default), 10s, 30s
- All stored in localStorage

**Tasks:**
- [ ] Implement polling with visibility API
- [ ] Implement date filter dropdown
- [ ] Implement project filter dropdown (derived from tasks)
- [ ] Implement refresh interval dropdown
- [ ] Persist filter selections to localStorage
- [ ] Show last-updated indicator
- [ ] Handle poll failures (amber indicator, retry)

### Phase 6: Frontend - Task Detail Modal

**Modal content:**
- Full title
- Status, project, priority
- Owner and lease info (if in_progress)
- Dependencies (if blocked)
- Description (scrollable)
- Comments (chronological)
- Checkpoints

**Behavior:**
- Click card → open modal
- Click outside / ESC / X button → close
- Fetches detail data on open

**Tasks:**
- [ ] Implement modal overlay
- [ ] Implement modal content layout
- [ ] Fetch task detail on open
- [ ] Fetch comments and checkpoints
- [ ] Handle "task not found" gracefully
- [ ] Close on ESC key

### Phase 7: Frontend - Activity Panel

**Slide-out panel:**
- Triggered by [Activity] button
- Shows recent events (status changes, comments, checkpoints)
- Each event: timestamp, event type, task title, agent
- Newest at top

**Tasks:**
- [ ] Implement slide-out panel CSS (right side)
- [ ] Implement event list rendering
- [ ] Track last-seen event ID for incremental updates
- [ ] Add close button

### Phase 8: Mobile Layout

**Breakpoint:** 768px

**Mobile layout:**
- Tabs instead of columns
- Hamburger menu for filters + activity
- Full-width cards
- Tab badges show task counts

**Tasks:**
- [ ] Add responsive CSS with media query
- [ ] Implement tab navigation
- [ ] Implement hamburger menu
- [ ] Implement swipe gesture (stretch)
- [ ] Test on mobile viewport sizes

### Phase 9: Testing & Polish

**Tasks:**
- [ ] Add unit tests for API routes
- [ ] Add integration test for server startup
- [ ] Test with empty database
- [ ] Test with large dataset (100+ tasks)
- [ ] Test mobile breakpoint
- [ ] Test polling pause/resume
- [ ] Manual testing on real device

### Phase 10: Documentation

Update docs to make the dashboard discoverable.

**Tasks:**
- [ ] Update `/README.md` with `hzl serve` command in CLI reference
- [ ] Add "Web Dashboard" section explaining the feature
- [ ] Update OpenClaw skill (`docs/openclaw/`) to mention dashboard availability
- [ ] Include example usage for background mode and systemd setup

**Files:**
- `/README.md`
- `docs/openclaw/` (skill definition)

## Acceptance Criteria

### Functional Requirements
- [ ] `hzl serve` starts HTTP server on specified port
- [ ] `hzl serve --background` forks to background with PID management
- [ ] `hzl serve --stop` stops background server
- [ ] `hzl serve --status` shows running state
- [ ] `hzl serve --print-systemd` outputs valid unit file
- [ ] Dashboard shows Kanban board with 5 columns
- [ ] Date filter limits tasks by updated_at
- [ ] Project filter limits tasks to selected project
- [ ] Refresh interval is configurable (1s-30s)
- [ ] Clicking task opens detail modal
- [ ] Activity panel shows recent events
- [ ] Mobile view uses tabs instead of columns
- [ ] Polling pauses when tab is hidden

### Non-Functional Requirements
- [ ] Page loads in < 500ms on localhost
- [ ] Polling handles network failures gracefully
- [ ] Works on Chrome, Firefox, Safari (latest)
- [ ] Responsive down to 320px width

### Documentation Requirements
- [ ] README documents `hzl serve` command
- [ ] OpenClaw skill updated to mention dashboard

## Dependencies

- Node.js built-in `http` module (no external deps for server)
- hzl-core services (TaskService, EventStore, cacheDb)

## Risks

| Risk | Mitigation |
|------|------------|
| Large task counts slow down UI | Date filter limits to 30d max; consider virtual scrolling if needed |
| Polling creates too many DB queries | SQLite is fast for reads; monitor and add caching if needed |
| HTML embedding complicates dev workflow | Add dev mode that serves file directly |

## References

### Internal
- Command pattern: `packages/hzl-cli/src/commands/stats.ts`
- Service initialization: `packages/hzl-cli/src/db.ts:initializeDb()`
- Task queries: `packages/hzl-cli/src/commands/task/list.ts`
- Event schema: `packages/hzl-core/src/events/types.ts`

### Brainstorm
- [2026-01-31-hzl-web-dashboard-brainstorm.md](../brainstorms/2026-01-31-hzl-web-dashboard-brainstorm.md)
