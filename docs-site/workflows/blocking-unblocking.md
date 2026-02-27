---
layout: default
title: Blocking & Unblocking
parent: Workflows
nav_order: 5
---

# Blocking and Unblocking Tasks

Handling tasks that are stuck waiting on external factors.

## When to Block

Block a task when:

- Waiting for external input (API keys, credentials)
- Waiting for a human decision
- Waiting for an external service or dependency
- Can't proceed without information from another team

**Don't use block for:**
- Dependencies on other HZL tasks (use `--depends-on` instead)
- Work you haven't started yet (leave as `ready`)

## Blocking a Task

```bash
hzl task block <id> --comment "Waiting for API keys from DevOps"
```

The comment is important—it explains why the task is blocked and what's needed to unblock it.

Good blocking comments:
- "Waiting for design review from product team"
- "Blocked on database credentials from ops@company.com"
- "Need clarification on auth requirements - asked in #engineering Slack"

## What Happens When Blocked

- Task status changes to `blocked`
- Task stays visible in dashboard (Blocked column)
- Task keeps its agent
- Task won't appear in `--available` lists
- Blocking comment is recorded in task history

## Unblocking a Task

When the blocker is resolved:

```bash
hzl task unblock <id>
```

This returns the task to `in_progress` status. You can then continue working.

```bash
hzl task unblock <id>
hzl task checkpoint <id> "Received API keys, resuming implementation"
# Continue working...
```

## Blocked vs. Dependency Blocking

Two different concepts:

| Type | Mechanism | Use Case |
|------|-----------|----------|
| **Status: blocked** | `hzl task block` | External factors (waiting on humans, services) |
| **Dependency blocking** | `--depends-on` | Task B can't start until Task A completes |

A task with unmet dependencies doesn't show in `--available` lists, but its status remains `ready`. The `blocked` status is specifically for tasks stuck due to external issues.

## Checking Blocked Tasks

```bash
# List all blocked tasks
hzl task list --status blocked

# See why a task is blocked
hzl task show <id>
# Shows the blocking comment in history
```

Or view in the dashboard:

```bash
hzl serve
```

Blocked tasks appear in their own column for visibility.

## Example Workflow

```bash
# Working on a task
hzl task claim 5 --agent claude-code
hzl task checkpoint 5 "Started auth implementation"

# Hit a blocker
hzl task block 5 --comment "Need OAuth client ID from DevOps team - emailed ops@company.com"

# ... time passes, blocker resolved ...

# Resume work
hzl task unblock 5
hzl task checkpoint 5 "Received OAuth credentials, implementing OAuth flow"
hzl task complete 5
```

## Best Practices

1. **Always include a comment** - Explain what's blocking and who/what can unblock
2. **Check blocked tasks regularly** - They might be unblockable
3. **Unblock promptly** - Don't leave tasks blocked longer than necessary
4. **Use dependencies for task ordering** - Don't block on other HZL tasks
5. **Track in dashboard** - Visual view helps identify stuck work
