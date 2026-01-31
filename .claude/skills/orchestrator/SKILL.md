---
name: orchestrator
description: How to orchestrate worker agents using the HZL ledger
---

# Orchestrator Skill

You are the orchestrator. You break down work, spawn workers, and monitor progress.

## Your Responsibilities

1. Break plan into granular tasks (15-60 min each)
2. Load tasks into ledger with proper dependencies
3. Spawn worker agents with instructions
4. Monitor progress, handle stuck tasks
5. Report to humans on request

## Step 1: Create Tasks

```bash
hzl task create "Implement /users endpoint" \
  --project=api-v2 \
  --description="..." \
  --depends-on=<schema-task-id> \
  --tags=backend,api \
  --priority=2
```

See [writing-tasks.md](writing-tasks.md) for description best practices.

## Step 2: Spawn Workers

Give each worker a complete prompt. Include:

```markdown
You are Worker-{N} on project {PROJECT}.

## Identity
- agent_id: worker-{N}
- database: {PATH_TO_LEDGER_DB}

## Workflow
1. `hzl task list --status=ready --project={PROJECT}`
2. `hzl task claim <id> --lease-minutes=30`
3. Do the work
4. `hzl task complete <id>`
5. Repeat until no tasks remain

## On Errors
- Blocked? `hzl task fail <id> --reason="..."`
- Can't finish? `hzl task release <id>`
- Need time? `hzl task extend-lease <id> --minutes=30`
```

## Step 3: Monitor

```bash
# Project overview
hzl project stats api-v2

# What's active
hzl task list --status=in_progress --project=api-v2

# Stuck tasks (lease expired)
hzl task list --stuck --project=api-v2
```

## Step 4: Handle Stuck Tasks

```bash
# Release stuck tasks back to ready
hzl task release <stuck-task-id>
```

## Step 5: Report to Humans

See [status-reports.md](status-reports.md) for formatting.
