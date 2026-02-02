---
layout: default
title: Project Organization
parent: Scenarios
nav_order: 3
---

# Project Organization

Structuring HZL projects and tasks for different workflows.

## Project Strategies

### One Project Per Feature

Best for: Feature branches, isolated work

```bash
hzl project create user-auth
hzl task add "Design auth flow" -P user-auth
hzl task add "Implement login" -P user-auth
hzl task add "Implement logout" -P user-auth
hzl task add "Add session management" -P user-auth
```

### One Project Per Sprint

Best for: Time-boxed work, team sprints

```bash
hzl project create sprint-23
hzl task add "Fix login bug #142" -P sprint-23
hzl task add "Add export feature" -P sprint-23
hzl task add "Update dependencies" -P sprint-23
```

### One Project Per Repository

Best for: Ongoing maintenance, long-lived work

```bash
hzl project create api-service
# Tasks accumulate over time
hzl task add "Refactor auth module" -P api-service
hzl task add "Add rate limiting" -P api-service
hzl task add "Fix memory leak" -P api-service
```

## Using Subtasks

Break large tasks into manageable pieces:

```bash
# Parent task
hzl task add "Build user dashboard" -P frontend

# Subtasks
hzl task add "Create layout component" -P frontend --parent 1
hzl task add "Build stats widgets" -P frontend --parent 1
hzl task add "Add activity feed" -P frontend --parent 1
```

Guidelines:
- Keep to 3-5 subtasks per parent
- Subtasks should be independent (can work in any order)
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
hzl task add "Design API" -P feature --parent 1
hzl task add "Design UI" -P feature --parent 1

# Phase 2: Implementation (depends on design)
hzl task add "Implementation phase" -P feature --depends-on 1
hzl task add "Build backend" -P feature --parent 4
hzl task add "Build frontend" -P feature --parent 4

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
# 1. Create project
hzl project create payment-integration

# 2. Add high-level tasks with dependencies
hzl task add "Research payment providers" -P payment-integration
hzl task add "Design payment flow" -P payment-integration --depends-on 1
hzl task add "Implement Stripe integration" -P payment-integration --depends-on 2
hzl task add "Add payment UI" -P payment-integration --depends-on 3
hzl task add "Write tests" -P payment-integration --depends-on 3,4

# 3. Break down implementation into subtasks
hzl task add "Set up Stripe SDK" -P payment-integration --parent 3
hzl task add "Create payment service" -P payment-integration --parent 3
hzl task add "Add webhook handlers" -P payment-integration --parent 3

# 4. View the structure
hzl task list -P payment-integration
```

## Best Practices

1. **Check before creating** - `hzl project list` to avoid duplicates
2. **One project per initiative** - Don't mix unrelated work
3. **Keep tasks small** - 1-2 hours of focused work
4. **Use dependencies sparingly** - Not everything needs to be sequential
5. **Archive completed projects** - Keep the active list manageable
