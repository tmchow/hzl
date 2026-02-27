---
layout: doc
title: Checkpoints
parent: Concepts
nav_order: 6
---

# Checkpoints

Checkpoints are progress snapshots that preserve context across sessions.

## What is a Checkpoint?

A checkpoint is a compact, durable record of what happened:

- What you tried
- What you found
- What's still missing
- Links, commands, or file paths needed to resume

```bash
hzl task checkpoint <id> "Designed schema with users, sessions, tokens tables"
```

## When to Checkpoint

Checkpoint at natural breakpoints:

- **After completing a component** - "Login endpoint complete"
- **After making a decision** - "Decided on JWT over sessions for stateless auth"
- **Before pausing work** - "Stopping here, next: add validation"
- **When hitting a blocker** - "Blocked on API keys, emailed ops@"

## What Makes a Good Checkpoint

Good checkpoints include context for resuming:

```bash
# Good: specific, actionable
hzl task checkpoint 1 "Auth middleware complete (auth_middleware.rb). Next: add rate limiting. Using Redis for token storage per prior architecture decision."

# Good: captures decision
hzl task checkpoint 1 "Decided on REST over GraphQL for simplicity. Defined endpoints: GET/POST /users, GET/PUT/DELETE /users/:id"

# Bad: vague, no context
hzl task checkpoint 1 "Working on it"
hzl task checkpoint 1 "Made progress"
```

## Viewing Checkpoints

```bash
hzl task show <id>
```

Output:

```
Task #1: Implement user authentication
Status: in_progress
Agent: claude-code

Checkpoints:
  [2024-01-15 10:30] Designed schema with users, sessions, tokens tables
  [2024-01-15 11:45] Implemented User model with bcrypt password hashing
  [2024-01-15 14:20] Started on Session model, need to add expiry logic
```

## Checkpoints vs Comments

| Feature | Checkpoint | Comment |
|---------|------------|---------|
| Purpose | Record progress/state | Communication |
| Typical author | Agent doing the work | Human providing guidance |
| When | During work | Anytime |

```bash
# Checkpoint: agent records progress
hzl task checkpoint 1 "API endpoints complete"

# Comment: human provides feedback
hzl task comment 1 "Also handle the edge case where user is already logged in"
```

## Checkpoints for Handoffs

When passing work to another agent or session:

```bash
hzl task checkpoint 1 "HANDOFF: Auth logic done. Remaining: tests and docs. See auth_service.rb"
```

The next agent reads the checkpoint to understand context:

```bash
hzl task show 1
# Continue from where the previous agent left off
```

## Progress Percentage

For numeric progress tracking:

```bash
hzl task progress <id> 50   # 50% complete
```

Progress is shown in `hzl task show` and the web dashboard.

## Best Practices

1. **Checkpoint at milestones** - Not every line of code, but meaningful progress
2. **Include "next step"** - Future you (or another agent) will thank you
3. **Reference files** - Make it easy to find the code
4. **Capture decisions** - Why you chose an approach
5. **Don't over-checkpoint** - Every commit doesn't need a checkpoint
