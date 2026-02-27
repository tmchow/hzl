---
layout: default
title: Human Oversight
parent: Workflows
nav_order: 6
---

# Human Oversight

Monitoring and steering agent work through HZL.

## Monitoring Progress

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

The dashboard provides:
- Kanban board view (Backlog → Ready → In Progress → Blocked → Done)
- Real-time updates
- Task details on click
- Project filtering
- Activity feed

## Providing Guidance

Add comments to steer agent work:

```bash
hzl task comment <task-id> "Please also handle the edge case where user is already logged in"
```

Comments are visible in task history and can provide mid-task direction.

## Agents Checking for Feedback

**Important:** Agents should check for comments before completing tasks:

```bash
hzl task show <task-id>
```

Review the task history for steering feedback before marking complete. This ensures human guidance is incorporated.

## Creating Work for Agents

Humans can queue up work:

```bash
# Create tasks for agents to pick up
hzl task add "Implement feature X" -P myapp -s ready \
  -d "Requirements documented in linked spec" \
  -l docs/feature-x-spec.md

# Set priority to influence order
hzl task add "Fix critical bug" -P myapp -s ready --priority 5

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

### Pausing Work

Block a task to prevent an agent from continuing:

```bash
hzl task block <task-id> --comment "HOLD: Need to review approach before proceeding"
```

### Redirecting Work

Add a comment with new direction:

```bash
hzl task comment <task-id> "Change of plans: use PostgreSQL instead of MongoDB. See updated spec."
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

1. **Use the dashboard** - Visual overview beats command-line for monitoring
2. **Comment for steering** - Don't just watch, provide direction when needed
3. **Set priorities** - Guide which work agents tackle first
4. **Review before archiving** - Check completed work meets requirements
5. **Use blocking for hard stops** - When you need an agent to pause
6. **Check JSON output** - Full history for detailed review
