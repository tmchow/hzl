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

### The "inbox" Project

- Always exists, created automatically on `hzl init`
- Cannot be deleted or renamed (protected)
- Default target when adding tasks without specifying project
- `hzl task add "Fix bug"` → goes to inbox

### Project Deletion Requires Explicit Task Handling

```bash
hzl project delete <name>                    # Fails if has tasks
hzl project delete <name> --move-to inbox    # Moves tasks to inbox first
hzl project delete <name> --move-to other    # Moves tasks to another project
hzl project delete <name> --archive-tasks    # Archives all tasks first
hzl project delete <name> --delete-tasks     # Deletes project and all tasks
```

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

## Command Reference

### Project Commands

```bash
hzl project create <name>                    # Create a new project
hzl project create <name> --description "..."
hzl project delete <name> [--move-to <project> | --archive-tasks | --delete-tasks]
hzl project list                             # List all projects
hzl project rename <from> <to>               # Rename project
hzl project show <name>                      # Show project details + task summary
```

### Task Commands

| Current | New |
|---------|-----|
| `hzl add <project> <title>` | `hzl task add <title> [-p <project>]` |
| `hzl list` | `hzl task list` |
| `hzl show <id>` | `hzl task show <id>` |
| `hzl claim <id>` | `hzl task claim <id>` |
| `hzl next` | `hzl task next` |
| `hzl complete <id>` | `hzl task complete <id>` |
| `hzl update <id>` | `hzl task update <id>` |
| `hzl move <id> <project>` | `hzl task move <id> --to <project>` |
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

### Top-Level Commands (unchanged)

These stay top-level as they're not resource-specific:

- `hzl init` - Initialize database
- `hzl config` - Configuration management
- `hzl stats` - Cross-cutting analytics
- `hzl validate` - Database integrity check
- `hzl export-events` - Backup/export utility
- `hzl which-db` - Diagnostic utility
- `hzl sample-project` - Demo/onboarding utility

### Commands to Remove

- `hzl projects` → replaced by `hzl project list`
- `hzl rename-project` → replaced by `hzl project rename`

## Technical Implementation

### New Event Types

```typescript
EventType.ProjectCreated    // { name: string, description?: string, is_protected?: boolean }
EventType.ProjectDeleted    // { name: string, tasks_action: 'moved' | 'archived' | 'deleted', moved_to?: string }
```

### New Projection: projects

```sql
CREATE TABLE projects (
  name TEXT PRIMARY KEY,
  description TEXT,
  created_at TEXT NOT NULL,
  is_protected INTEGER DEFAULT 0  -- 1 for inbox
);
```

### Service Changes

**TaskService.createTask():**
- Validate project exists before creating task
- If no project specified, default to "inbox"
- Throw error if project doesn't exist

**New ProjectService:**
- `createProject(name, options?)` - Create project, emit ProjectCreated
- `deleteProject(name, options)` - Handle tasks per options, emit ProjectDeleted
- `getProject(name)` - Get project details
- `listProjects()` - List all projects
- `renameProject(from, to)` - Rename via task moves (existing logic)

**Init changes:**
- `hzl init` emits ProjectCreated event for "inbox" with is_protected: true

### Documentation Updates

Files to update:
- README.md - All CLI examples, AGENTS.md snippet
- AGENTS.md - Command examples
- skills/*.md - Any CLI examples

## Out of Scope

- Project descriptions/metadata beyond name
- Project-level settings or configurations
- Archiving projects (use delete with --archive-tasks)
- TTY detection for output format
- Backwards compatibility aliases

## References

- [CLI Guidelines](https://clig.dev/)
- [GitHub CLI Manual](https://cli.github.com/manual/)
- [Thoughtworks CLI Design Guidelines](https://www.thoughtworks.com/en-us/insights/blog/engineering-effectiveness/elevate-developer-experiences-cli-design-guidelines)
