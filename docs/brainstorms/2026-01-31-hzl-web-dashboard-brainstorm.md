# hzl Web Dashboard Brainstorm

**Date:** 2026-01-31

## What We're Building

A lightweight Kanban-style web dashboard for monitoring hzl tasks in near real-time. Each hzl instance runs its own dashboard, viewed by the developer on that machine. For remote machines (e.g., OpenClaw boxes), access via Tailscale network.

### Goals

1. **Visibility into agent work** - See what agents are doing in real-time
2. **Task board overview** - Kanban view of all tasks across projects
3. **Debugging/troubleshooting** - Investigate issues, see event history

## Why This Approach

- **`hzl serve` command** - Explicit, simple, one process to manage
- **Single HTML file + vanilla JS** - No build step, embedded in server binary
- **Polling (not WebSocket)** - Simpler, good enough for 1-5s refresh
- **Dark minimal style** - Terminal-native feel for CLI developers
- **Per-machine instance** - No central server, relies on network security (localhost or Tailscale)

## Key Decisions

| Decision | Choice |
|----------|--------|
| Location | New `hzl-web` package in monorepo |
| Startup | `hzl serve --port 3456` CLI command |
| Background mode | `--background` for dev, `--print-systemd` for OpenClaw services |
| UI stack | Single HTML file, vanilla JS, no build step |
| Style | Dark background, amber/orange accent, monospace font |
| Layout | Kanban: backlog → blocked → ready → in_progress → done |
| Date filter | Presets: today, 3d (default), 7d, 14d, 30d max. Persists to localStorage |
| Project filter | Dropdown, populated from tasks |
| Refresh | UI configurable: 1s, 2s, 5s (default), 10s, 30s. Pauses when tab hidden |
| Activity | Slide-out panel showing recent events |
| Task detail | Modal on card click (full description, comments, checkpoints) |
| Remote access | Plain HTTP on configurable port, rely on Tailscale for security |
| Archived tasks | Not shown in web UI, use CLI |
| Blocked column | Derived - ready tasks with unmet dependencies |
| Mobile | Single column with status tabs, hamburger menu for filters |

## Architecture

```
┌─────────────────┐     polls every 1-5s    ┌──────────────────┐
│   Browser UI    │ ◄─────────────────────► │   hzl serve      │
│ (vanilla JS)    │        JSON API         │ (Node.js server) │
└─────────────────┘                         └────────┬─────────┘
                                                     │
                                                     ▼
                                            ┌──────────────────┐
                                            │   hzl-core       │
                                            │ (TaskService,    │
                                            │  EventStore)     │
                                            └────────┬─────────┘
                                                     │
                                                     ▼
                                            ┌──────────────────┐
                                            │   SQLite DBs     │
                                            │ events + cache   │
                                            └──────────────────┘
```

## Package Structure

```
packages/hzl-web/
├── src/
│   ├── server.ts        # HTTP server, routes, API handlers
│   ├── index.ts         # Exports for hzl-cli to import
│   └── ui/
│       └── index.html   # Single HTML file with embedded CSS + JS
├── package.json
└── tsconfig.json
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Serves embedded HTML dashboard |
| `GET /api/tasks` | All tasks, supports `?since=<date>&project=<name>` filters |
| `GET /api/tasks/:id` | Full task detail |
| `GET /api/tasks/:id/comments` | Comments for a task |
| `GET /api/tasks/:id/checkpoints` | Checkpoints for a task |
| `GET /api/events?since=<event_id>` | Recent events for activity feed (max 50) |
| `GET /api/stats` | Quick counts by status |

Read-only API - no mutations from web UI.

## UI Layout

### Desktop (Kanban)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  hzl dashboard      Last 3 days ▼   Project: All ▼   Refresh: 5s ▼   ●   [Activity] │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────────┐ ┌───────────┐             │
│ │BACKLOG (8)│ │BLOCKED (2)│ │ READY (3) │ │IN_PROGRESS 2│ │  DONE (12)│             │
│ ├───────────┤ ├───────────┤ ├───────────┤ ├─────────────┤ ├───────────┤             │
│ │  cards... │ │  cards... │ │  cards... │ │   cards...  │ │  cards... │             │
│ └───────────┘ └───────────┘ └───────────┘ └─────────────┘ └───────────┘             │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Mobile (Tabs)

```
┌─────────────────────────┐
│ hzl            ≡  ●     │
├─────────────────────────┤
│ [Backlog][Ready][In Pr..]│
├─────────────────────────┤
│      cards stacked      │
└─────────────────────────┘
```

Breakpoint ~768px.

## Visual Style

- **Background:** Dark (`#1a1a1a` or similar)
- **Accent:** Amber/orange (`#f59e0b`) for highlights, active states, connection indicator
- **Font:** System monospace stack
- **Cards:** Simple rectangles, muted borders, no heavy shadows
- **Columns:** Status differentiated by position, not color

## Polling Behavior

- Default: 5s refresh interval
- Configurable via UI dropdown (1s, 2s, 5s, 10s, 30s)
- Pauses when tab is hidden (Page Visibility API)
- Immediate refresh when tab becomes visible
- Preference stored in localStorage

## Open Questions

None - all resolved during brainstorm.

## Next Steps

Run `/workflows:plan` to create implementation plan.
