---
layout: doc
title: Breaking Down Work
parent: Workflows
nav_order: 4
---

# Breaking Down Work

Sizing parent tasks and using subtasks effectively.

## Parent Tasks and Subtasks

HZL supports one level of nesting: parent tasks contain subtasks.

```
Project
└── Task (can be a parent)
    └── Subtask (max depth)
```

This constraint is intentional—deeply nested hierarchies become hard to track.

## The Completability Test

Scope parent tasks to completable outcomes. Ask: "I finished [parent task]"—does that describe a real outcome?

| Example | Completable? |
|---------|--------------|
| "Finished the user authentication feature" | ✓ Yes |
| "Finished the backend work" | ✗ No (frontend still pending) |
| "Finished home automation" | ✗ No (open-ended, never done) |

## Scope by Problem, Not Layer

A full-stack feature (frontend + backend + tests) is usually one parent if it ships together.

```bash
# Good: one parent for a complete feature
hzl task add "User authentication" -P myrepo
hzl task add "Design auth flow" --parent 1
hzl task add "Implement login endpoint" --parent 1
hzl task add "Build login UI" --parent 1
hzl task add "Add integration tests" --parent 1
```

## When to Split into Multiple Parents

Split when:
- Parts deliver independent value (can ship separately)
- You're solving distinct problems that happen to be related

```bash
# Two separate features that happen to both involve users
hzl task add "User authentication" -P myrepo    # Ships first
hzl task add "User preferences" -P myrepo       # Ships later
```

## Adding Context

Use `-d` for details, `-l` for reference docs:

```bash
hzl task add "User authentication" -P myrepo \
  -d "OAuth2 flow per linked spec. Use existing session middleware." \
  -l docs/auth-spec.md,https://example.com/design-doc
```

**Don't duplicate specs into descriptions**—this creates drift. Reference docs instead.

**If no docs exist**, include enough detail for another agent to complete the task:

```bash
hzl task add "Add rate limiting" -P myrepo -s ready -d "$(cat <<'EOF'
100 req/min per IP, return 429 with Retry-After header.
Use RateLimiter from src/middleware/.
EOF
)"
```

Description supports markdown (16KB max).

## Subtask Guidelines

- Keep to 3-7 subtasks per parent
- Subtasks can be independent or have dependencies
- Only one level of nesting allowed

```bash
# Create parent
hzl task add "Build user dashboard" -P myrepo

# Add subtasks (independent work)
hzl task add "Create layout component" --parent 1
hzl task add "Build stats widgets" --parent 1
hzl task add "Add activity feed" --parent 1

# Or with dependencies (sequential work)
hzl task add "Design schema" --parent 1
hzl task add "Create migrations" --parent 1 --depends-on 2
hzl task add "Implement models" --parent 1 --depends-on 3
```

## Working with Subtasks

```bash
# Get next subtask of a parent
hzl task claim --next --parent 1

# View parent with all subtasks
hzl task show 1

# After all subtasks complete, complete the parent
hzl task complete 1
```

## Example: Feature Development

```bash
# 1. Create parent task
hzl task add "Payment integration" -P myrepo \
  -d "Stripe integration per design doc" \
  -l docs/payment-design.md

# 2. Break down into subtasks
hzl task add "Set up Stripe SDK" --parent 1
hzl task add "Create payment service" --parent 1 --depends-on 2
hzl task add "Add webhook handlers" --parent 1 --depends-on 3
hzl task add "Build checkout UI" --parent 1 --depends-on 3
hzl task add "Integration tests" --parent 1 --depends-on 4,5

# 3. Work through subtasks
hzl task claim --next --parent 1 --agent my-agent
# ... complete each subtask ...

# 4. Complete parent when done
hzl task complete 1
```

## Anti-Pattern: Project Sprawl

Don't create projects for features:

```bash
# Wrong: feature is not a project
hzl project create "payment-integration"
```

Features are parent tasks within a single repo project:

```bash
# Correct: parent task for the feature
hzl task add "Payment integration" -P myrepo
```

See [Concepts: Projects](../concepts/projects) for more on project structure.
