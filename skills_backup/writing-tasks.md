---
description: How to write effective task descriptions for AI workers
---

# Writing Tasks Skill

Good task descriptions enable autonomous work. Bad ones cause confusion and wasted effort.

## Bad Task ❌

```
title: "Fix the login bug"
```

Problem: No context, no location, no acceptance criteria.

## Good Task ✅

```yaml
title: "Fix authentication timeout on login form"

description: |
  ## Context
  Users report being logged out after 5 minutes. Should last 24 hours.
  
  ## Location
  - Auth logic: src/auth/session.ts
  - Config: src/config/auth.yaml
  - Tests: src/auth/__tests__/session.test.ts
  
  ## Acceptance Criteria
  - [ ] Session timeout = 24 hours
  - [ ] Existing sessions not invalidated
  - [ ] Tests updated and passing
  
  ## Constraints
  - Do NOT modify the login API signature
  - Must be backwards compatible
  
  ## Verification
  Run: npm test -- --grep session

tags: [backend, auth, bugfix]
priority: 2
```

## Required Sections

1. **Context**: Why this matters, what's broken
2. **Location**: Exact file paths to modify
3. **Acceptance Criteria**: Checkboxes for done-ness
4. **Verification**: How to confirm it works

## Optional Sections

- **Constraints**: What NOT to do
- **Related**: Links to docs, issues, other tasks
- **Examples**: Sample inputs/outputs

## Sizing

- Aim for 15-60 minutes of work per task
- If larger, break into subtasks with dependencies
- One clear outcome per task

## Dependencies

Use `--depends-on` when:
- Task B needs Task A's output
- Task B modifies files Task A creates
- Ordering matters for correctness

```bash
hzl task create "Write API tests" \
  --depends-on=<users-endpoint-id>,<posts-endpoint-id>
```
