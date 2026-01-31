---
name: hzo
description: End-to-end orchestration - from idea to implemented feature via HZL
---

# HZO Skill

**Invoke with:** `/hzo "build feature xyz"`

You take a goal, brainstorm it into a plan, load tasks into HZL, spawn workers, and monitor to completion.

---

## The Process

```
/hzo "goal"
    │
    ├─▶ 1. BRAINSTORM (understand the goal)
    ├─▶ 2. PLAN (create implementation plan)
    ├─▶ 3. LOAD (hzl task create with deps)
    ├─▶ 4. SPAWN (dispatch worker agents)
    ├─▶ 5. MONITOR (watch progress, handle stuck)
    └─▶ 6. REPORT (summarize what was built)
```

---

## Step 1: Brainstorm

**Before writing code, understand what you're building.**

1. Check current project state (files, docs, recent commits)
2. Ask questions **one at a time** to clarify the goal
3. Prefer multiple choice when possible
4. Once clear, propose 2-3 approaches with tradeoffs
5. Lead with your recommended approach

**Output:** A shared understanding of what to build. Optionally save to `docs/plans/YYYY-MM-DD-<topic>-design.md`.

---

## Step 2: Plan

**Create bite-sized tasks that a fresh agent can execute.**

### Task Granularity

| ✅ Good | ❌ Too Big |
|---------|-----------|
| 5-15 min per task | >30 min |
| One clear outcome | Multiple outcomes |
| One file focus | Many files |
| Includes verification | No way to check done |

### Task Format

Each task in the plan should have:

```markdown
### Task N: <title>

**Files:** src/path/file.ts (create/modify)

**Steps:**
1. Write failing test
2. Run test (expect FAIL)
3. Implement minimal code
4. Run test (expect PASS)
5. Commit

**Verification:** `npm test -- src/path/file.test.ts`
```

### Dependencies

Structure for parallelism:

```
Setup ─┬─ Feature A ──┬─ Integration
       ├─ Feature B ──┤
       └─ Feature C ──┘
```

**Output:** Implementation plan in `docs/plans/YYYY-MM-DD-<feature>.md`

---

## Step 3: Load to HZL

For each task in your plan:

```bash
# Create task
hzl task create "Implement user schema" \
  --project=<project> \
  --description="Files: src/types/user.ts\nVerify: npm test" \
  --tags=backend,schema \
  --priority=2
# Returns: TASK_ID_1

# Create dependent task
hzl task create "Implement GET /users" \
  --project=<project> \
  --depends-on=TASK_ID_1 \
  --description="..." \
  --priority=2

# Mark ready when dependencies allow
hzl task ready TASK_ID_1
```

### Description Best Practices

Include in every task description:
- **Files** to create/modify
- **Verification** command
- **Context** if needed (why this matters)
- **Constraints** (what NOT to do)

See [writing-tasks.md](writing-tasks.md) for full guide.

---

## Step 4: Spawn Workers

Generate prompts for worker agents. Each worker gets:

```markdown
You are Worker-{N} on project {PROJECT}.

## Your Skill
Use the worker skill: see skills/worker.md

## Database
HZL_DB={PATH} or default ~/.hzl/data.db

## Workflow
1. `hzl task list --available --project={PROJECT}`
2. `hzl task claim <id>`
3. Execute the task (follow description)
4. `hzl task complete <id>`
5. Repeat until no tasks

## If Stuck
- `hzl task comment <id> "blocked on X"`
- `hzl task release <id>` to give up
```

### Spawning Options

| Method | When to Use |
|--------|-------------|
| **Subagent dispatch** | Same session, platform supports it |
| **Parallel terminals** | Human opens N sessions with prompts |
| **Automated (future)** | `hzl worker spawn --count=3` |

---

## Step 5: Monitor

While workers execute:

```bash
# Overall progress
hzl project stats <project>

# What's active now
hzl task list --status=in_progress --project=<project>

# What's ready to claim
hzl task list --available --project=<project>

# Stuck (lease expired)
hzl task list --stuck --project=<project>
```

### Handle Issues

| Issue | Action |
|-------|--------|
| Task stuck (expired lease) | `hzl task release <id>` |
| Worker needs help | Read comments, provide guidance |
| Task failed | Review, adjust plan, reassign |
| Dependency wrong | `hzl task add-dep` or `remove-dep` |

---

## Step 6: Report

When all tasks complete:

```bash
hzl project stats <project>
# Shows: all done!
```

Summarize:
- What was built
- Key decisions made
- Any issues encountered
- Verification that it works

See [status-reports.md](status-reports.md) for formatting.

---

## Quick Reference

```bash
# === PLANNING ===
hzl task create "<title>" --project=X --description="..." --priority=N
hzl task add-dep <task-id> <depends-on-id>
hzl task ready <task-id>

# === MONITORING ===
hzl project stats <project>
hzl task list --available --project=<project>
hzl task list --stuck --project=<project>

# === INTERVENTION ===
hzl task release <id>          # Unstick
hzl task claim <id>            # Take over yourself
hzl task comment <id> "note"   # Leave guidance
```

---

## When to Use HZO vs Orchestrator

| Use HZO | Use Orchestrator |
|---------|------------------|
| Starting from an idea | Tasks already exist |
| Need brainstorming | Plan is clear |
| Full end-to-end | Just coordination |

HZO = orchestrator + brainstorming + planning

---

## Related Skills

- [orchestrator.md](orchestrator.md) - Simpler coordination (assumes tasks exist)
- [worker.md](worker.md) - Worker agent behavior
- [planning.md](planning.md) - Task sizing and parallelism
- [writing-tasks.md](writing-tasks.md) - Task description best practices
- [status-reports.md](status-reports.md) - Human-friendly reporting
