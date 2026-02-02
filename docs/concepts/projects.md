---
layout: default
title: Projects
parent: Concepts
nav_order: 1
---

# Projects

Projects are stable containers for related work. They group tasks together and persist across sessions.

## Creating a Project

```bash
hzl project create my-feature
```

Project names should be descriptive and kebab-case:
- `auth-feature`
- `api-refactor`
- `bug-fixes-jan`

## When to Create a Project

**Create a project when:**
- Starting a new feature or initiative
- Work will span multiple sessions
- Multiple agents might contribute
- You want to track progress separately

**Examples:**
- One project per feature branch
- One project per epic/initiative
- One project per repository (for ongoing maintenance)

## Listing Projects

```bash
# List all projects
hzl project list

# JSON output for scripting
hzl project list --json
```

## Project Lifecycle

Projects are meant to be long-lived. Unlike tasks, they don't have statuses like "done."

**Active project:** Has tasks being worked on

**Dormant project:** No recent activity, but may resume

**Archivable:** All tasks complete, work is finished

## Working with Projects

### Adding Tasks to a Project

```bash
hzl task add "My task title" -P my-feature
hzl task add "Another task" --project my-feature
```

### Filtering by Project

```bash
# List tasks in a project
hzl task list -P my-feature

# Get next available task in project
hzl task next -P my-feature
```

## Best Practices

1. **Use descriptive names** - `user-auth` not `project1`
2. **One project per initiative** - Don't mix unrelated work
3. **Check existing projects first** - `hzl project list` before creating
4. **Archive completed work** - Keep active project list manageable

## Example Workflow

```bash
# Check if project exists
hzl project list

# Create if needed
hzl project create api-v2

# Add tasks
hzl task add "Design new endpoints" -P api-v2
hzl task add "Implement auth changes" -P api-v2 --depends-on 1
hzl task add "Update documentation" -P api-v2 --depends-on 2

# View project tasks
hzl task list -P api-v2
```
