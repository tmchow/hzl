---
layout: default
title: Tasks
parent: Concepts
nav_order: 2
---

# Tasks

Tasks are the units of work in HZL. They track what needs to be done, who's working on it, and progress made.

## Creating Tasks

```bash
hzl task add "Implement user authentication" -P my-project
```

Tasks require a title and project:
- **Title:** Clear description of what to do
- **Project:** Which project this belongs to (`-P` or `--project`)

## Task Statuses

Tasks move through these statuses:

| Status | Meaning |
|--------|---------|
| `ready` | Available to be claimed |
| `in_progress` | Someone is working on it |
| `blocked` | Waiting on dependencies |
| `done` | Work complete |
| `archived` | No longer relevant |

## Claiming Tasks

Before working on a task, claim it:

```bash
hzl task claim <id> --author claude-code
```

The `--author` flag identifies who's working:
- `claude-code` - Claude Code agent
- `codex` - OpenAI Codex
- `human` - Manual work
- Any identifier you choose

### Why Claim?

- Prevents two agents from working on the same task
- Creates audit trail of who did what
- Enables `hzl task next` to skip claimed tasks

## Recording Progress

Use checkpoints to record progress while working:

```bash
hzl task checkpoint <id> "Designed the schema, moving to implementation"
```

Checkpoints:
- Preserve context for future sessions
- Show progress in the dashboard
- Help other agents understand status

## Completing Tasks

When done:

```bash
hzl task complete <id>
```

This marks the task as `done` and unblocks any dependent tasks.

## Listing Tasks

```bash
# All tasks
hzl task list

# In a specific project
hzl task list -P my-project

# Only available (ready, not blocked)
hzl task list --available

# JSON output
hzl task list --json
```

## Getting the Next Task

Let HZL pick the next available task:

```bash
hzl task next -P my-project
```

This returns a task that is:
- Status: `ready`
- Not claimed by anyone
- All dependencies satisfied

## Task Details

View full task information:

```bash
hzl task show <id>
```

Shows:
- Title and description
- Status and author
- Dependencies
- Checkpoints

## Archiving Tasks

For tasks no longer needed:

```bash
hzl task archive <id>
```

Archived tasks are hidden from normal lists but preserved in history.

## Example Workflow

```bash
# Create task
hzl task add "Build login form" -P auth

# Claim it
hzl task claim 1 --author claude-code

# Record progress
hzl task checkpoint 1 "Form HTML complete, adding validation"
hzl task checkpoint 1 "Validation done, testing"

# Mark complete
hzl task complete 1
```

## Best Practices

1. **Keep tasks small** - 1-2 hours of focused work
2. **Use descriptive titles** - Future you will thank you
3. **Checkpoint frequently** - Preserve context
4. **Always use --author** - Track who did what
5. **Complete or archive** - Don't leave tasks hanging
