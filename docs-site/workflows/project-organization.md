---
layout: default
title: Project Organization
parent: Workflows
nav_order: 7
---

# Project Organization

Structuring HZL projects and tasks for different workflows.

## Project Strategies

### One Project Per Repository (Recommended)

Best for: Ongoing development, long-lived work

```bash
hzl project create api-service
# Tasks accumulate over time
hzl task add "Refactor auth module" -P api-service
hzl task add "Add rate limiting" -P api-service
hzl task add "Fix memory leak" -P api-service
```

This is the most common pattern. One repo = one project.

### One Project Per Feature

Best for: Feature branches, isolated work that will complete

```bash
hzl project create user-auth
hzl task add "Design auth flow" -P user-auth
hzl task add "Implement login" -P user-auth
hzl task add "Implement logout" -P user-auth
hzl task add "Add session management" -P user-auth
```

**Note:** Consider using a parent task instead if the feature is within an existing repo project.

### One Project Per Sprint

Best for: Time-boxed work, team sprints

```bash
hzl project create sprint-23
hzl task add "Fix login bug #142" -P sprint-23
hzl task add "Add export feature" -P sprint-23
hzl task add "Update dependencies" -P sprint-23
```

## Using Subtasks

Break large tasks into manageable pieces:

```bash
# Parent task
hzl task add "Build user dashboard" -P frontend

# Subtasks
hzl task add "Create layout component" --parent 1
hzl task add "Build stats widgets" --parent 1
hzl task add "Add activity feed" --parent 1
```

Guidelines:
- Keep to 3-7 subtasks per parent
- Subtasks should be independently workable
- Only one level of nesting allowed

## Using Dependencies

Sequence work that must happen in order:

```bash
# Sequential tasks
hzl task add "Design database schema" -P backend
hzl task add "Create migrations" -P backend --depends-on 1
hzl task add "Implement models" -P backend --depends-on 2
hzl task add "Add API endpoints" -P backend --depends-on 3
```

## Combining Subtasks and Dependencies

For complex features, combine both:

```bash
# Phase 1: Design (subtasks for parallel design work)
hzl task add "Design phase" -P feature
hzl task add "Design API" --parent 1
hzl task add "Design UI" --parent 1

# Phase 2: Implementation (depends on design)
hzl task add "Implementation phase" -P feature --depends-on 1
hzl task add "Build backend" --parent 4
hzl task add "Build frontend" --parent 4

# Phase 3: Testing (depends on implementation)
hzl task add "Testing phase" -P feature --depends-on 4
```

## Naming Conventions

### Projects

Use kebab-case, be descriptive:

```bash
# Good
hzl project create user-authentication
hzl project create api-v2-migration
hzl project create q1-2024-bugs

# Avoid
hzl project create project1
hzl project create stuff
```

### Tasks

Start with a verb, be specific:

```bash
# Good
hzl task add "Implement password reset flow" -P auth
hzl task add "Fix race condition in claim logic" -P core
hzl task add "Add rate limiting to /api/users" -P api

# Avoid
hzl task add "auth stuff" -P auth
hzl task add "bug fix" -P core
```

## Example: Feature Development

```bash
# 1. Create project (or use existing repo project)
hzl project create payment-integration

# 2. Add high-level tasks with dependencies
hzl task add "Research payment providers" -P payment-integration
hzl task add "Design payment flow" -P payment-integration --depends-on 1
hzl task add "Implement Stripe integration" -P payment-integration --depends-on 2
hzl task add "Add payment UI" -P payment-integration --depends-on 3
hzl task add "Write tests" -P payment-integration --depends-on 3,4

# 3. Break down implementation into subtasks
hzl task add "Set up Stripe SDK" --parent 3
hzl task add "Create payment service" --parent 3
hzl task add "Add webhook handlers" --parent 3

# 4. View the structure
hzl task list -P payment-integration
```

## Anti-Pattern: Project Sprawl

Don't create a project for every feature:

```bash
# Wrong: creates project proliferation
hzl project create "add-login"
hzl project create "fix-header-bug"
hzl project create "update-docs"
```

Use parent tasks within a single repo project instead:

```bash
# Correct: one project, features as parent tasks
hzl project create myrepo
hzl task add "Add login" -P myrepo
hzl task add "Fix header bug" -P myrepo
hzl task add "Update docs" -P myrepo
```

## Best Practices

1. **Check before creating** - `hzl project list` to avoid duplicates
2. **One project per repo** - Most common and simplest pattern
3. **Keep tasks small** - 1-2 hours of focused work
4. **Use dependencies sparingly** - Not everything needs to be sequential
5. **Archive completed projects** - Keep the active list manageable
6. **Use subtasks for breakdown** - Not new projects for features
