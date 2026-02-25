---
layout: default
title: CLI Reference
parent: Reference
nav_order: 1
---

# CLI Reference

Complete command documentation for the HZL CLI.

## Setup Commands

### hzl init

Initialize HZL database.

```bash
hzl init                          # Initialize with default settings
hzl init --sync-url <url>         # Initialize with cloud sync
hzl init --sync-url <url> --auth-token <token>  # With auth
hzl init --reset-config           # Reset to default database location
hzl init --force                  # Reinitialize (prompts for confirmation)
hzl init --force --yes            # Reinitialize without confirmation (DANGEROUS)
```

### hzl status

Show database and sync state.

```bash
hzl status
```

### hzl sync

Sync with cloud database (if configured).

```bash
hzl sync
```

### hzl doctor

Run health checks.

```bash
hzl doctor
```

### hzl guide

Display the full workflow documentation.

```bash
hzl guide
```

---

## Project Commands

### hzl project create

Create a new project.

```bash
hzl project create <name>
```

### hzl project list

List all projects.

```bash
hzl project list
hzl project list --json           # JSON output
```

---

## Task Commands

### Authorship and Ownership

- `--assignee` sets who owns a task.
- `--author` (where supported) records who performed a mutation.
- `hzl task claim` does not take `--author`; the claim `--assignee` is recorded as the event author.

### Creating Tasks

#### hzl task add

Create a new task.

```bash
hzl task add "<title>" -P <project>
hzl task add "<title>" --project <project>
```

**Options:**

| Flag | Description |
|------|-------------|
| `-P, --project <name>` | Project to add task to (required unless using --parent) |
| `-d, --description <text>` | Detailed description |
| `-l, --links <urls>` | Comma-separated URLs or file paths |
| `-t, --tags <tags>` | Comma-separated tags |
| `-p, --priority <0-3>` | Priority (higher = more important) |
| `-s, --status <status>` | Initial status (backlog, ready, in_progress, blocked, done) |
| `--depends-on <ids>` | Comma-separated task IDs this depends on |
| `--parent <id>` | Parent task ID (creates subtask) |
| `--assignee <name>` | Initial assignee (free-form string) |
| `--author <name>` | Actor creating/assigning the task (event attribution) |

**Examples:**

```bash
# Simple task
hzl task add "Implement login" -P myapp

# With all options
hzl task add "Implement rate limiting" -P myapp \
  -d "100 req/min per IP, return 429" \
  -l docs/spec.md \
  -t backend,security \
  -p 3 \
  -s ready

# Subtask
hzl task add "Add unit tests" --parent 1

# With dependency
hzl task add "Deploy" -P myapp --depends-on 1,2,3

# Assign to another agent at creation
hzl task add "Implement cache layer" -P myapp -s ready --assignee kenji

# Attribution: Clara assigns to Kenji
hzl task add "Investigate flaky auth test" -P myapp -s ready --assignee kenji --author clara

# Multiline markdown description
hzl task add "Write rollout plan" -P myapp \
  -d "$(cat <<'EOF'
## Goal
- Roll out behind a feature flag

## Acceptance Criteria
- [ ] Canary metrics stay stable
EOF
)"
```

### Listing Tasks

#### hzl task list

List tasks with filtering.

```bash
hzl task list
hzl task list -P <project>
hzl task list --assignee <name>
hzl task list -P <project> --assignee <name>
```

**Options:**

| Flag | Description |
|------|-------------|
| `-P, --project <name>` | Filter by project |
| `--status <status>` | Filter by status |
| `--available` | Only claimable tasks (ready, deps met) |
| `--parent <id>` | Only subtasks of this parent |
| `--root` | Only top-level tasks (no parent) |
| `--assignee <name>` | Filter by assignee |
| `--json` | JSON output |

#### hzl task next

Get the next available task (highest priority, ready, deps met).

```bash
hzl task next -P <project>
hzl task next --parent <id>       # Next subtask of parent
hzl task next -P <project> --claim --assignee <name>  # Claim immediately
hzl task next --json
```

#### hzl task show

Show task details.

```bash
hzl task show <id>
hzl task show <id> --json
hzl task show <id> --deep --json   # Full subtask fields + blocked_by
hzl task show <id> --no-subtasks   # Hide subtasks from output
```

| Flag | Description |
|------|-------------|
| `--deep` | Expand subtasks to full Task fields plus computed `blocked_by` array (best with `--json`) |
| `--no-subtasks` | Hide subtasks from output. Takes precedence over `--deep` |

### Working on Tasks

#### hzl task claim

Claim a task (start working on it). Alias: `hzl task start`

```bash
hzl task claim <id>
hzl task claim <id> --assignee <name>
hzl task claim <id> --assignee <name> --agent-id <session-id>
hzl task claim <id> --assignee <name> --lease <minutes>
```

**Options:**

| Flag | Description |
|------|-------------|
| `--assignee <name>` | Who is claiming the task |
| `--agent-id <id>` | Session/agent identifier |
| `--lease <minutes>` | Lease duration before considered stuck |

#### hzl task checkpoint

Record progress on a task.

```bash
hzl task checkpoint <id> "<message>"
hzl task checkpoint <id> "<message>" --author <name>
```

#### hzl task progress

Set completion percentage.

```bash
hzl task progress <id> <0-100>
```

#### hzl task comment

Add a comment to a task.

```bash
hzl task comment <id> "<message>"
hzl task comment <id> "<message>" --author <name>
```

#### hzl task complete

Mark a task as done.

```bash
hzl task complete <id>
```

### Status Management

#### hzl task set-status

Change task status.

```bash
hzl task set-status <id> <status>
```

Statuses: `backlog`, `ready`, `in_progress`, `blocked`, `done`

#### hzl task block

Mark a task as blocked.

```bash
hzl task block <id> --comment "<reason>"
```

#### hzl task unblock

Remove blocked status (returns to in_progress).

```bash
hzl task unblock <id>
```

### Updating Tasks

#### hzl task update

Modify task properties.

```bash
hzl task update <id> --title "New title"
hzl task update <id> --desc "Updated description"
hzl task update <id> --links doc1.md,doc2.md
hzl task update <id> --tags bug,urgent
hzl task update <id> --priority 2
hzl task update <id> --title "Reword title" --author clara
```

To clear a field, pass empty string:

```bash
hzl task update <id> --desc ""
hzl task update <id> --links ""
hzl task update <id> --tags ""
```

**Options:**

| Flag | Description |
|------|-------------|
| `--title <title>` | Update title |
| `--desc <text>` | Update description |
| `-l, --links <links>` | Replace links with comma-separated list |
| `-t, --tags <tags>` | Replace tags with comma-separated list |
| `-p, --priority <0-3>` | Update priority |
| `--parent <id>` | Set parent task (`""` to remove parent) |
| `--author <name>` | Optional actor attribution for this update |

#### hzl task move

Move a task (and its subtasks) to another project.

```bash
hzl task move <task-id> <project>
hzl task move <task-id> <project> --author clara
```

**Options:**

| Flag | Description |
|------|-------------|
| `--author <name>` | Optional actor attribution for this move |

#### hzl task add-dep

Add a dependency after task creation.

```bash
hzl task add-dep <task-id> <depends-on-id>
hzl task add-dep <task-id> <depends-on-id> --author clara
```

**Options:**

| Flag | Description |
|------|-------------|
| `--author <name>` | Optional actor attribution for this dependency change |

#### hzl task remove-dep

Remove a dependency after task creation.

```bash
hzl task remove-dep <task-id> <depends-on-id>
hzl task remove-dep <task-id> <depends-on-id> --author clara
```

**Options:**

| Flag | Description |
|------|-------------|
| `--author <name>` | Optional actor attribution for this dependency change |

### Coordination

#### hzl task stuck

Find tasks with expired leases.

```bash
hzl task stuck
hzl task stuck --json
```

#### hzl task steal

Take over an abandoned task.

```bash
hzl task steal <id> --if-expired --assignee <name>
hzl task steal <id> --if-expired --assignee kenji --author clara
```

Use `--assignee` for the new assignee. Use `--author` only when the actor is different from the assignee.

**Options:**

| Flag | Description |
|------|-------------|
| `--assignee <name>` | New assignee after steal |
| `--owner <name>` | Deprecated alias for `--assignee` |
| `--author <name>` | Optional actor attribution for the steal event |
| `--force` | Steal even if lease is still active |
| `--if-expired` | Steal only when lease is expired |

### Subtasks

```bash
# Create subtask
hzl task add "Subtask" --parent <id>

# List subtasks
hzl task list --parent <id>

# List only root tasks
hzl task list --root

# Get next subtask
hzl task next --parent <id>

# Archive with subtasks
hzl task archive <id> --cascade

# Archive, promote subtasks
hzl task archive <id> --orphan
```

### Cleanup

#### hzl task archive

Archive a task (hidden but preserved).

```bash
hzl task archive <id>
hzl task archive <id> --cascade   # With all subtasks
hzl task archive <id> --orphan    # Promote subtasks first
```

#### hzl task prune

Permanently delete old completed/archived tasks.

```bash
hzl task prune -P <project>                   # Preview what would be deleted
hzl task prune -P <project> --dry-run         # Same as above
hzl task prune -P <project> --older-than 30d  # Only tasks older than 30 days
hzl task prune -P <project> --yes             # Delete without confirmation
hzl task prune --all --older-than 30d --yes   # All projects
```

**Warning:** Pruning permanently deletes tasks. Cannot be undone.

---

## Validation

### hzl validate

Check for issues in the task graph.

```bash
hzl validate
```

Detects circular dependencies and other problems.

---

## Web Dashboard

### hzl serve

Start the web dashboard.

```bash
hzl serve                         # Start on port 3456
hzl serve --port 8080             # Custom port
hzl serve --host 127.0.0.1        # Localhost only
hzl serve --background            # Run in background
hzl serve --status                # Check if running
hzl serve --stop                  # Stop background server
hzl serve --print-systemd         # Generate systemd unit file
```

---

## JSON Output

Most commands support `--json` for scripting:

```bash
hzl project list --json
hzl task list --json
hzl task show <id> --json
hzl task next --json
hzl task stuck --json
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `HZL_DB` | Database directory path |
| `HZL_DEV_MODE` | Set to `0` to disable dev mode |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (see stderr for details) |
