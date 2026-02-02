---
layout: default
title: Web Dashboard
nav_order: 3
---

# Web Dashboard

HZL includes a built-in web dashboard for visual task management. Launch it with `hzl serve`.

## Starting the Dashboard

```bash
hzl serve
```

Opens a Kanban board at [http://localhost:3456](http://localhost:3456).

### Options

```bash
# Use a different port
hzl serve --port 8080

# Don't auto-open browser
hzl serve --no-open
```

## Features

### Kanban Board

Tasks are displayed in columns by status:

| Column | Tasks Shown |
|--------|-------------|
| Ready | Available to claim |
| In Progress | Currently being worked on |
| Blocked | Waiting on dependencies |
| Done | Completed work |

### Visual Indicators

- **Author badges** - See who's working on each task
- **Dependency lines** - Visualize task relationships
- **Progress indicators** - Checkpoint count per task
- **Project grouping** - Filter by project

### Real-time Updates

The dashboard auto-refreshes when tasks change. Multiple team members can view the same board.

## When to Use the Dashboard

**Great for:**
- Getting a visual overview of project status
- Identifying bottlenecks and blocked work
- Team standups and progress reviews
- Monitoring multi-agent workflows

**CLI is better for:**
- Scripted automation
- Quick task operations
- Integration with other tools

## Example Workflow

```bash
# Set up some work
hzl project create sprint-1
hzl task add "Design API" -P sprint-1
hzl task add "Build endpoints" -P sprint-1 --depends-on 1
hzl task add "Write tests" -P sprint-1 --depends-on 2

# Open dashboard to visualize
hzl serve
```

You'll see three cards showing the dependency chain, with "Design API" in Ready and the others in Blocked.

## Architecture

The dashboard is served by `hzl-web`, which reads from the same event-sourced database as the CLI. Changes made via CLI appear immediately in the dashboard and vice versa.

```
┌─────────────┐     ┌─────────────┐
│   CLI       │     │  Dashboard  │
│  (hzl)      │     │ (hzl serve) │
└──────┬──────┘     └──────┬──────┘
       │                   │
       └───────┬───────────┘
               │
        ┌──────▼──────┐
        │  hzl-core   │
        │  (events.db)│
        └─────────────┘
```
