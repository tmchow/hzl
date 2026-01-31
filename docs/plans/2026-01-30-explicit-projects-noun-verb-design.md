# Explicit Projects & Noun-Verb CLI Restructure

## Overview

Redesign HZL CLI to use explicit project management and consistent noun-verb command structure.

## Goals

1. **Explicit projects** - Projects must be created before tasks can be added to them
2. **Consistent CLI** - Full noun-verb structure (`hzl project create`, `hzl task add`)
3. **Protected inbox** - Default catch-all project that always exists

## Design Decisions

### Projects Are Explicit

- Projects must be created with `hzl project create <name>` before tasks can be added
- `hzl task add "title" --project nonexistent` fails if project doesn't exist
- Prevents typo-based project creation
- **All operations that reference a project validate it exists** (task add, task move, project rename target, project delete --move-to)

### The "inbox" Project

- Always exists, created automatically on `hzl init`
- Cannot be deleted or renamed (protected)
- Default target when adding tasks without specifying project
- `hzl task add "Fix bug"` → goes to inbox

### Project Deletion Requires Explicit Task Handling

```bash
hzl project delete <name>                    # Fails if has tasks (including archived)
hzl project delete <name> --move-to inbox    # Moves ALL tasks (including archived) to inbox first
hzl project delete <name> --move-to other    # Moves ALL tasks to another project (must exist)
hzl project delete <name> --archive-tasks    # Archives all non-archived tasks first
hzl project delete <name> --delete-tasks     # Deletes project and ALL tasks (including archived)
```

**Important:** These flags are mutually exclusive. Only one can be specified.

**Cascading effects:** When `--delete-tasks` is used, any tasks in OTHER projects that depend on the deleted tasks will have broken dependencies. The `hzl validate` command can detect this.

### Full Noun-Verb Command Structure

Based on CLI best practices research (clig.dev, GitHub CLI patterns):
- Noun-verb is more common in modern CLIs (gh, gcloud, aws)
- Consistency is paramount - one mental model
- Subcommands aid discoverability (`hzl project --help`)

### Output Format

Keep current behavior:
- Human-readable by default
- `--json` flag for machine output
- Agents instructed to use `--json`

### Migration Strategy

Clean break - no backwards compatibility aliases. No users yet.

**Database migration:** Existing databases will have synthetic `ProjectCreated` events emitted for all unique projects found in `tasks_current`.

## Command Reference

### Project Commands

```bash
hzl project create <name>                    # Create a new project
hzl project create <name> -d "description"   # Create with description
hzl project delete <name> [--move-to <project> | --archive-tasks | --delete-tasks]
hzl project list                             # List all projects with task counts
hzl project rename <from> <to>               # Rename project (atomic event)
hzl project show <name>                      # Show project details + task breakdown by status
```

### Task Commands

| Current | New |
|---------|-----|
| `hzl add <project> <title>` | `hzl task add <title> [-P <project>]` |
| `hzl list` | `hzl task list` |
| `hzl show <id>` | `hzl task show <id>` |
| `hzl claim <id>` | `hzl task claim <id>` |
| `hzl next` | `hzl task next` |
| `hzl complete <id>` | `hzl task complete <id>` |
| `hzl update <id>` | `hzl task update <id>` |
| `hzl move <id> <project>` | `hzl task move <id> <project>` |
| `hzl archive <id>` | `hzl task archive <id>` |
| `hzl reopen <id>` | `hzl task reopen <id>` |
| `hzl release <id>` | `hzl task release <id>` |
| `hzl comment <id>` | `hzl task comment <id>` |
| `hzl checkpoint <id>` | `hzl task checkpoint <id>` |
| `hzl history <id>` | `hzl task history <id>` |
| `hzl search <query>` | `hzl task search <query>` |
| `hzl stuck <id>` | `hzl task stuck <id>` |
| `hzl steal <id>` | `hzl task steal <id>` |
| `hzl add-dep <id> <dep>` | `hzl task add-dep <id> <dep>` |
| `hzl remove-dep <id> <dep>` | `hzl task remove-dep <id> <dep>` |
| `hzl set-status <id> <status>` | `hzl task set-status <id> <status>` |

**Flag conventions:**
- `-P, --project` for project (uppercase to avoid collision with `-p, --priority`)
- `-p, --priority` for priority (unchanged)
- `hzl task move` uses positional argument for target project (not `--to` flag)

### Top-Level Commands (unchanged)

These stay top-level as they're not resource-specific:

- `hzl init` - Initialize database
- `hzl config` - Configuration management
- `hzl stats` - Cross-cutting analytics
- `hzl validate` - Database integrity check (now also detects broken dependencies)
- `hzl export-events` - Backup/export utility
- `hzl which-db` - Diagnostic utility
- `hzl sample-project` - Demo/onboarding utility (updated to create project first)

### Commands to Remove

- `hzl projects` → replaced by `hzl project list`
- `hzl rename-project` → replaced by `hzl project rename`

## Technical Implementation

### New Event Types

```typescript
// Project events use task_id = '__project__' as a reserved sentinel value
// to distinguish them from task events while keeping the NOT NULL constraint

EventType.ProjectCreated  // { name: string, description?: string, is_protected?: boolean }
EventType.ProjectRenamed  // { old_name: string, new_name: string }
EventType.ProjectDeleted  // { name: string, task_count: number, archived_task_count: number }
```

**Note:** `ProjectDeleted` is only emitted AFTER all tasks have been handled (moved, archived, or deleted via their own events). The `task_count` and `archived_task_count` fields record what was in the project at deletion time for audit purposes.

### New Projection: projects

```sql
CREATE TABLE projects (
  name TEXT PRIMARY KEY,
  description TEXT,
  is_protected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_event_id INTEGER NOT NULL
);

CREATE INDEX idx_projects_protected ON projects(is_protected);
```

### Service Changes

**TaskService.createTask():**
- Validate project exists before creating task
- If no project specified, default to "inbox"
- Throw `ProjectNotFoundError` if project doesn't exist

**TaskService - add target validation to:**
- `moveTask()` - validate target project exists

**New ProjectService:**
- `createProject(name, options?)` - Create project, emit ProjectCreated
- `deleteProject(name, options)` - Handle tasks FIRST (move/archive/delete), THEN emit ProjectDeleted
- `getProject(name)` - Get project details
- `listProjects()` - List all projects with task counts
- `renameProject(from, to)` - Validate target doesn't exist (unless force), emit ProjectRenamed
- `projectExists(name)` - Check if project exists
- `ensureInboxExists()` - Idempotent inbox creation (uses INSERT OR IGNORE semantics)
- `getTaskCount(name, includeArchived)` - Get task count for project

**Error types:**
- `ProjectNotFoundError` - Project doesn't exist
- `ProjectAlreadyExistsError` - Project already exists (on create or rename target)
- `ProtectedProjectError` - Cannot delete/rename protected project
- `ProjectHasTasksError` - Project has tasks, must specify how to handle them

**Init changes:**
- `hzl init` emits ProjectCreated event for "inbox" with is_protected: true
- Inbox creation is idempotent (safe to call multiple times)

**Migration:**
- Emit synthetic `ProjectCreated` events for all unique projects in `tasks_current`
- Emit `ProjectCreated` for "inbox" with is_protected: true if not already present

### Documentation Updates

Files to update:
- README.md - All CLI examples, AGENTS.md snippet
- AGENTS.md - Command examples
- sample-project.ts - Create project before adding tasks

## Out of Scope

- Project-level settings or configurations
- Archiving projects as a status (use delete with --archive-tasks)
- TTY detection for output format
- Backwards compatibility aliases
- Configurable default project name (hardcoded to "inbox" for V1)

## References

- [CLI Guidelines](https://clig.dev/)
- [GitHub CLI Manual](https://cli.github.com/manual/)
- [Thoughtworks CLI Design Guidelines](https://www.thoughtworks.com/en-us/insights/blog/engineering-effectiveness/elevate-developer-experiences-cli-design-guidelines)
