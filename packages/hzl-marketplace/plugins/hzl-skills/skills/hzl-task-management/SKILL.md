---
name: hzl-task-management
description: This skill should be used when working with HZL for task tracking, when the user asks to "break down work into tasks", "track tasks with HZL", "claim a task", "checkpoint progress", "complete a task", or when working on a project that uses HZL. Provides guidance on effective task management patterns for AI agents.
---

# HZL Task Management

HZL is a lightweight task tracking system for AI agents. It is a dumb ledger—it tracks work state but does not orchestrate, prioritize, or decide what to do next. Orchestration logic belongs in agents, not in HZL.

This skill teaches how to use HZL effectively for tracking work across projects.

## Core Concepts

**Projects** group related work. Use stable identifiers:
- Working in a repo → use the repository name (e.g., `myapp`)
- Long-lived agent → use agent identity (e.g., `openclaw`)

Projects are long-lived. Do not create per-feature projects.

**Tasks** are units of work within projects. Tasks can have:
- Priority (higher number = higher priority)
- Tags for categorization
- Dependencies on other tasks
- A parent task (creating a subtask relationship, max 1 level deep)

**Parent tasks** are organizational containers. They are never returned by `hzl task next`—only leaf tasks (tasks without children) are claimable work.

**Checkpoints** preserve progress. Use them liberally to enable recovery.

## ⚠️ DESTRUCTIVE COMMANDS - READ CAREFULLY

The following commands **PERMANENTLY DELETE ALL HZL DATA** and cannot be undone:

| Command | Effect |
|---------|--------|
| `hzl init --force` | **DELETES ALL DATA.** Prompts for confirmation. |
| `hzl init --force --yes` | **DELETES ALL DATA WITHOUT CONFIRMATION.** Extremely dangerous. |

**NEVER use `--force` or `--force --yes` unless the user explicitly instructs you to destroy all task data.**

These commands delete the entire event history, all projects, all tasks, all checkpoints—everything. There is no recovery without a backup.

## Scenario: Setting Up

When starting work on a project that uses HZL:

```bash
# Check if HZL is initialized
hzl project list --json

# If no projects exist, initialize (safe, won't overwrite existing data)
hzl init

# Create or verify project exists
hzl project create <project-name>
```

Use the repository name as the project name for consistency.

## Scenario: Breaking Down Work

When facing a complex task or feature, use subtasks for organization and dependencies for sequencing.

### Using subtasks for organization

Subtasks group related work under a parent:

```bash
# Create the parent task (organizational container)
hzl task add "Implement user authentication" -P myapp --priority 2
# → Created task abc123

# Create subtasks (project inherited automatically)
hzl task add "Set up database schema" --parent abc123
hzl task add "Create auth endpoints" --parent abc123
hzl task add "Write auth tests" --parent abc123

# View the breakdown
hzl task show abc123
```

**Key behavior:** Parent tasks are organizational containers. When you call `hzl task next`, only leaf tasks (tasks without children) are returned. The parent is never "available work"—it represents the umbrella.

```bash
# Get next available subtask
hzl task next --project myapp
# → Returns a subtask, never the parent

# Scope to specific parent's subtasks
hzl task next --parent abc123
# → Returns next available subtask of abc123
```

When all subtasks are done, manually complete the parent:
```bash
hzl task complete abc123
```

### Using dependencies for sequencing

Dependencies express "must complete before" relationships:

```bash
# Create tasks with sequencing
hzl task add "Set up database schema" -P myapp --priority 2
hzl task add "Create auth endpoints" -P myapp --depends-on <schema-task-id>
hzl task add "Write auth tests" -P myapp --depends-on <endpoints-task-id>

# Validate no circular dependencies
hzl validate
```

### Combining subtasks and dependencies

Subtasks can have dependencies on other subtasks:

```bash
hzl task add "Auth feature" -P myapp --priority 2
# → parent123

hzl task add "Database schema" --parent parent123
# → schema456

hzl task add "Auth endpoints" --parent parent123 --depends-on schema456
hzl task add "Auth tests" --parent parent123 --depends-on <endpoints-id>
```

**Work breakdown principles:**
- Use subtasks to group related work under a logical parent
- Use dependencies to express sequencing requirements
- Break work into tasks that can be completed in a single session
- Parent tasks are never claimable—work happens on leaf tasks

## Scenario: Working on Tasks

The core workflow: list available → claim → work → checkpoint → complete.

### Find available work

```bash
# List tasks ready to be claimed (no unmet dependencies)
hzl task list --project myapp --available --json

# See what's next by priority
hzl task next --project myapp --json
```

Always use `--json` for structured output that can be parsed programmatically.

### Claim a task

```bash
# Claim by ID
hzl task claim <task-id> --author <agent-name>

# Or claim the next available task
hzl task next --project myapp --claim --author <agent-name>
```

Use `--author` to identify which agent owns the task. This enables tracking who is working on what.

For long-running work, use leases:

```bash
hzl task claim <task-id> --author <agent-name> --lease 30
```

The lease (in minutes) indicates how long before the task is considered stuck.

### Checkpoint progress

Checkpoint frequently to preserve progress:

```bash
# Simple checkpoint
hzl task checkpoint <task-id> "Completed database schema migration"

# Checkpoint with structured data
hzl task checkpoint <task-id> "step-3-complete" --data '{"files":["auth.ts","user.ts"]}'
```

Checkpoints serve two purposes:
1. Progress visibility for humans monitoring work
2. Recovery context if another agent needs to take over

### Check for steering comments

Before completing a task, check for human guidance:

```bash
hzl task show <task-id> --json
```

Review the task history for any comments added by humans. Incorporate steering feedback before marking complete.

### Complete the task

```bash
hzl task complete <task-id>
```

Only mark complete when the work is fully done and verified.

## Scenario: Handling Blocked Work

When a task cannot proceed:

```bash
# Add a comment explaining the blocker
hzl task comment <task-id> "Blocked: waiting for API credentials"

# If the task depends on another task, the dependency system handles this
# Check what's blocking
hzl task show <task-id> --json
```

Do not complete blocked tasks. Leave them claimed or unclaim if another agent should take over.

## Scenario: Multi-Agent Coordination

When multiple agents work on the same project:

### Claiming prevents conflicts

HZL uses atomic claiming. Two agents calling `task next --claim` simultaneously will get different tasks. This prevents duplicate work.

### Use author consistently

```bash
hzl task claim <id> --author agent-1
hzl task checkpoint <id> "progress" --author agent-1
```

The author field tracks which agent is responsible.

### Recover stuck tasks

If an agent dies or becomes unresponsive:

```bash
# Find tasks with expired leases
hzl task stuck --json

# Take over an expired task
hzl task steal <task-id> --if-expired --author agent-2
```

Before stealing, review checkpoints to understand where the previous agent left off:

```bash
hzl task show <task-id> --json
```

For advanced lease and recovery options, see `hzl task claim --help` and `hzl task steal --help`.

## Scenario: Human Oversight

Humans can monitor and steer agent work through HZL:

### Monitoring progress

```bash
hzl project list
hzl task list --project myapp --status in_progress
hzl task show <task-id>
```

### Providing guidance

```bash
hzl task comment <task-id> "Please also handle the edge case where user is already logged in"
```

Agents should check for comments before completing tasks (see "Check for steering comments" above).

## Command Quick Reference

| Action | Command |
|--------|---------|
| List projects | `hzl project list` |
| Create project | `hzl project create <name>` |
| Add task | `hzl task add "<title>" -P <project>` |
| Create subtask | `hzl task add "<title>" --parent <id>` |
| List available | `hzl task list --project <p> --available --json` |
| List subtasks | `hzl task list --parent <id>` |
| List root tasks | `hzl task list --root` |
| Claim task | `hzl task claim <id> --author <name>` |
| Checkpoint | `hzl task checkpoint <id> "<message>"` |
| Show task | `hzl task show <id> --json` |
| Complete | `hzl task complete <id>` |
| Next subtask | `hzl task next --parent <id>` |
| Add dependency | `hzl task add-dep <task> <depends-on>` |
| Archive cascade | `hzl task archive <id> --cascade` |
| Validate | `hzl validate` |

For complete command options, use `hzl <command> --help`.

## Best Practices

1. **Always use `--json`** for programmatic output
2. **Checkpoint frequently** to enable recovery
3. **Check for comments** before completing tasks
4. **Use stable project names** derived from repo or agent identity
5. **Break down work** into single-session tasks
6. **Use dependencies** to express sequencing, not priority
7. **Use leases** for long-running work to enable stuck detection
8. **Review checkpoints** before stealing stuck tasks

## What HZL Does Not Do

HZL is deliberately limited:

- **No orchestration** - Does not spawn agents or assign work
- **No task decomposition** - Does not break down tasks automatically
- **No smart scheduling** - Uses simple priority + FIFO ordering

These are features for your orchestration layer, not for the task tracker.

**What HZL does provide** (but isn't covered in this skill):

- Cloud sync via Turso for backup and multi-device access (`hzl init --sync-url ...`)
- Web dashboard for human monitoring (`hzl serve`)
