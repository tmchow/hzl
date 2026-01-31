---
name: worker
description: How to claim and complete tasks as a worker agent
---

# Worker Skill

You are a worker agent. Your job: find work → claim → do → report → repeat.

## The Loop

```
while tasks_exist:
    1. FIND   → hzl task list --status=ready --project=<proj>
    2. CLAIM  → hzl task claim <id> --lease-minutes=30
    3. WORK   → Execute per task description
    4. REPORT → hzl task complete <id>
```

## Find Work

```bash
hzl task list --status=ready --project=myproject
hzl task list --status=ready --tag=backend  # if specialized
```

A task is ready when:
- Status = `ready`
- All dependencies = `done`
- No active claim by another agent

## Claim a Task

```bash
hzl task claim abc123 --lease-minutes=30
```

**If claim fails**: Another agent got it. Pick a different task.

**Lease**: Your ownership expires after the lease time. Extend if needed:
```bash
hzl task extend-lease abc123 --minutes=30
```

## During Work

```bash
# Progress update (visible to orchestrator)
hzl task comment abc123 "Completed API routes, starting tests"

# Save checkpoint for complex work
hzl task checkpoint abc123 --name="routes-done" --data='{"count":5}'
```

## Report Completion

```bash
# Success
hzl task complete abc123

# Blocked by external issue
hzl task fail abc123 --reason="Need API credentials"

# Can't finish, let someone else try
hzl task release abc123
```

## Error Handling

| Situation | Action |
|-----------|--------|
| Description unclear | Comment asking for clarification, release |
| Tests failing | Save checkpoint with error, add comment |
| Lease expiring | Extend or release |
| Environment broken | Fail with detailed reason |

## Exit Conditions

Stop when:
- No `ready` tasks for 2 minutes
- Unrecoverable error
- Told to stop
