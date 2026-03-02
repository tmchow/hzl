---
layout: doc
title: Human Oversight
parent: Workflows
nav_order: 6
---

# Human Oversight

Monitoring and steering agent work through HZL.

You don't have to run CLI commands for most oversight tasks. Ask your primary agent — *"what's in progress across all projects?"* or *"show me what kenji completed today"* — and it can query HZL and summarize in plain language. The CLI and dashboard are there when you want direct access or a visual overview.

## Monitoring Progress

### Conversational

Ask your primary OpenClaw agent:

> "What's the status of the auth migration?"
> "Is anyone blocked right now?"
> "What did clara finish this week?"

The agent runs the appropriate `hzl` commands and summarizes the results. This is the most natural way to stay informed without context-switching.

### Command Line

```bash
# See all projects
hzl project list

# Check what's in progress
hzl task list --project myapp --status in_progress

# View task details and history
hzl task show <task-id>

# See who's working on what
hzl task list --project myapp
```

### Web Dashboard

```bash
hzl serve  # Opens at http://localhost:3456
```

`hzl serve` runs in the foreground — closing the terminal stops the dashboard. To run it persistently, see the [service setup instructions](/getting-started/installation#optional-run-the-web-dashboard-as-a-service).

The [dashboard](/dashboard) provides multiple views:
- **Kanban board** — task workflow columns (Backlog → Ready → In Progress → Blocked → Done)
- **Agent Operations** — monitor agent fleet health, task assignments, and event timelines
- **Graph view** — visualize project structure, task dependencies, and hierarchy

All views share real-time updates, task detail modals, search, and filtering.

## Providing Guidance

### Comments (best-effort steering)

```bash
hzl task comment <task-id> "Please also handle the edge case where user is already logged in"
```

Comments are recorded in task history, but there is no push notification to the agent. An agent only sees new comments when it re-reads task state — typically at checkpoints or before completion. This means comments work best when the agent checkpoints frequently, and may be missed entirely on fast tasks.

**If you need the agent to stop and respond**, use `hzl task block` instead — it changes the task status, which the agent will see on its next status check.

### Blocking (guaranteed stop)

```bash
hzl task block <task-id> --comment "HOLD: Need to review approach before proceeding"
```

Blocking changes the task status. An agent that checks status before continuing work will see the block and stop. Use this when a comment alone isn't enough.

## Creating Work for Agents

The most natural way to create work is to **chat with your OpenClaw agents directly**. Ask the main agent (or any agent with task-creation permissions) to create and route work:

> "Create an HZL task for clara to write the blog post about the new API. Link the draft outline."

The agent handles the `hzl task add` call, project routing, and any flags. This is the fastest path for most humans — no CLI required.

You can also queue work directly from the command line:

```bash
# Create tasks for agents to pick up
hzl task add "Implement feature X" -P myapp -s ready \
  -d "Requirements documented in linked spec" \
  -l docs/feature-x-spec.md

# Set priority to influence order (0-3)
hzl task add "Fix critical bug" -P myapp -s ready --priority 3

# Add dependencies to enforce sequencing
hzl task add "Write tests" -P myapp -s ready --depends-on 1,2
```

## Reviewing Completed Work

```bash
# See recently completed tasks
hzl task list --project myapp --status done

# Review what was done
hzl task show <task-id>
# Shows all checkpoints and comments

# Archive after review
hzl task archive <task-id>
```

## Intervention Patterns

### Redirecting Work

For non-urgent redirects, add a comment. The agent will see it when it next reads task state (typically at checkpoints):

```bash
hzl task comment <task-id> "Change of plans: use PostgreSQL instead of MongoDB. See updated spec."
```

For urgent redirects where you need the agent to stop first, block the task and include the new direction in the comment:

```bash
hzl task block <task-id> --comment "STOP: switching to PostgreSQL. See updated spec before continuing."
```

### Taking Over

If an agent is stuck or unavailable:

```bash
# Check current state
hzl task show <task-id>

# Take over if needed
hzl task steal <task-id> --if-expired --agent human
```

## Audit Trail

HZL's event-sourced architecture provides a complete audit trail:

```bash
# See full task history
hzl task show <task-id>
```

Every action is recorded:
- Who created the task
- Who claimed it
- All checkpoints and comments
- Status changes
- Completion

## Best Practices

1. **Ask your agent first** — Conversational queries are the fastest way to check status without context-switching
2. **Use the dashboard for visual overview** — Kanban board and graph views surface patterns that text summaries miss
3. **Comments for soft steering, blocking for hard stops** — Comments are best-effort; if you need a guaranteed pause, block the task
4. **Set priorities** — Guide which work agents tackle first
5. **Review before archiving** — Check completed work meets requirements
