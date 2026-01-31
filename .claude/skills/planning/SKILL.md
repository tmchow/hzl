---
name: planning
description: How to plan work for AI agent swarms - bite-sized, parallelized tasks
---

# Agent Planning Skill

When planning work that agents will execute, optimize for parallelism and small tasks.

## Sizing Tasks

| Size | Duration | Good For |
|------|----------|----------|
| **Small** | 15-30 min | Single file changes, simple features |
| **Medium** | 30-60 min | Multi-file features, refactors |
| **Too Big** | >60 min | **Split it** |

If a task feels like "a lot," it's too big. Break it down.

## Maximize Parallelism

Structure dependencies to unlock concurrent work:

```
❌ Sequential (slow):
   A → B → C → D → E

✅ Parallel (fast):
   A ─┬─ B ─┬─ E
      ├─ C ─┤
      └─ D ─┘
```

### Patterns

**Fan-out**: One setup task, then many independent tasks
```
Schema setup
  ├── Users API
  ├── Posts API  
  ├── Comments API
  └── Auth API
```

**Fan-in**: Many tasks converge to one integration task
```
Users API ──┐
Posts API ──┼── Integration tests
Auth API ───┘
```

**Diamond**: Setup → parallel work → integration
```
Schema ─┬─ Users API ──┬─ Integration
        ├─ Posts API ──┤
        └─ Auth API ───┘
```

## Task Independence

Each task should be completable without coordination:

✅ **Good**: "Implement GET /users endpoint with tests"
- Clear scope
- Includesverification
- No blocking questions

❌ **Bad**: "Implement user functionality"
- Too vague
- Agent will need clarification
- Blocks other agents

## Task Template

```yaml
title: <verb> <specific thing>
description: |
  ## Context
  Why this matters, what problem it solves
  
  ## Files
  - src/api/users.ts (create)
  - src/api/users.test.ts (create)
  
  ## Requirements
  - [ ] GET /users returns list
  - [ ] Pagination via ?page=N
  - [ ] Tests pass
  
  ## Constraints
  - Use existing db connection
  - Follow REST conventions in src/api/README.md
  
depends_on: [schema-task-id]
tags: [api, users]
```

## Dependency Rules

1. **Minimum necessary**: Only add deps that truly block
2. **Shared resources**: If two tasks touch same file, add dep or split differently
3. **Test deps**: Tests depend on the thing they test
4. **Integration deps**: Integration tasks depend on all components

## Splitting Large Tasks

### By layer
```
Big: "Add user feature"
Split:
  - Add users table migration
  - Add User model
  - Add users API endpoints
  - Add users API tests
  - Add user UI component
```

### By entity
```
Big: "Add CRUD for all resources"
Split:
  - Users CRUD
  - Posts CRUD
  - Comments CRUD
```

### By operation
```
Big: "User management"  
Split:
  - Create user
  - Read user
  - Update user
  - Delete user
```

## Checklist Before Handoff

- [ ] No task >60 minutes
- [ ] Each task has clear acceptance criteria
- [ ] Dependencies are minimal and correct
- [ ] File paths are explicit
- [ ] Parallel paths exist where possible
- [ ] No circular dependencies
