---
layout: default
title: Projects
parent: Concepts
nav_order: 1
---

# Projects

Projects are stable containers for related work. They group tasks together and persist across sessions.

## Typical Pattern: One Repo = One Project

| Repo Structure | HZL Mapping |
|---------------|-------------|
| Single repo | One project |
| Monorepo | One project (intra-repo deps work) |
| Split repos with shared features | One project per initiative |

See [Simplicity through Constraints](./index#simplicity-through-constraints) for why HZL enforces this pattern.

## Creating a Project

```bash
hzl project create my-feature
```

Project names should be descriptive and kebab-case:
- `auth-feature`
- `api-refactor`
- `myapp-backend`

## Anti-pattern: Project Sprawl

**Don't create a new project for every feature.** Features should be parent tasks within a single project.

```bash
# Wrong: feature is not a project
hzl project create "query-perf"

# Correct: parent task for the feature
hzl task add "Query perf" -P myrepo
hzl task add "Fix N+1 queries" --parent <parent-id>
hzl task add "Add query caching" --parent <parent-id>
```

**Why?**
- Projects are meant to be long-lived containers
- Features come and go; repos persist
- Dependencies only work within a project
- Too many projects = cognitive overhead

## When to Create a Project

**Good reasons:**
- Starting work in a new repository
- New codebase or major initiative
- Work that needs its own dependency graph

**Bad reasons:**
- Every feature or bug fix
- Every sprint or iteration
- Every pull request

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

1. **One project per repo** - The typical pattern
2. **Check existing projects first** - `hzl project list` before creating
3. **Use descriptive names** - `user-auth` not `project1`
4. **Features are parent tasks** - Not separate projects
5. **Dependencies stay within projects** - By design

## Example Workflow

```bash
# Check if project exists
hzl project list

# Create if needed (typically once per repo)
hzl project create api-v2

# Add tasks (features as parent tasks)
hzl task add "Design new endpoints" -P api-v2
hzl task add "Implement auth changes" -P api-v2 --depends-on 1
hzl task add "Update documentation" -P api-v2 --depends-on 2

# View project tasks
hzl task list -P api-v2
```
