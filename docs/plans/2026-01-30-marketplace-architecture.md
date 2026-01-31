# HZL Marketplace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the hzl monorepo to include a Claude Code plugin marketplace, distributing HZL coordination skills to Claude Code users.

**Architecture:** Create a marketplace at repo root (`.claude-plugin/marketplace.json`) containing one plugin (`hzl-skills`) with six skills converted from existing agent guides. Original guides move to `docs/agent-guides/` as reference documentation.

**Tech Stack:** Claude Code plugins, YAML frontmatter, Markdown skills

---

## Task 1: Create Marketplace Configuration

**Files:**
- Create: `.claude-plugin/marketplace.json`

**Step 1: Create the .claude-plugin directory**

```bash
mkdir -p .claude-plugin
```

**Step 2: Create marketplace.json**

```json
{
  "name": "hzl-marketplace",
  "owner": {
    "name": "tmchow",
    "url": "https://github.com/tmchow/hzl"
  },
  "metadata": {
    "description": "HZL task coordination skills for Claude Code",
    "version": "1.0.0",
    "pluginRoot": "./plugins"
  },
  "plugins": [
    {
      "name": "hzl-skills",
      "source": "./plugins/hzl-skills",
      "description": "Skills for AI agents using HZL task coordination",
      "version": "1.0.0",
      "category": "agent-coordination",
      "tags": ["hzl", "task-management", "agents", "orchestration"]
    }
  ]
}
```

**Step 3: Commit**

```bash
git add .claude-plugin/marketplace.json
git commit -m "feat: add marketplace configuration"
```

---

## Task 2: Create Plugin Configuration

**Files:**
- Create: `plugins/hzl-skills/.claude-plugin/plugin.json`

**Step 1: Create the plugin directory structure**

```bash
mkdir -p plugins/hzl-skills/.claude-plugin
mkdir -p plugins/hzl-skills/skills
```

**Step 2: Create plugin.json**

```json
{
  "name": "hzl-skills",
  "description": "Skills for AI agents using HZL task coordination",
  "version": "1.0.0",
  "author": {
    "name": "tmchow",
    "url": "https://github.com/tmchow"
  },
  "keywords": ["hzl", "task-management", "agents", "orchestration", "worker", "coordination"]
}
```

**Step 3: Commit**

```bash
git add plugins/
git commit -m "feat: add hzl-skills plugin configuration"
```

---

## Task 3: Convert Orchestrator Skill

**Files:**
- Create: `plugins/hzl-skills/skills/orchestrator/SKILL.md`
- Source: `skills/orchestrator.md`

**Step 1: Create skill directory**

```bash
mkdir -p plugins/hzl-skills/skills/orchestrator
```

**Step 2: Create SKILL.md with proper frontmatter**

The skill needs:
- `name`: `hzl-orchestrator`
- `description`: Trigger conditions for auto-invocation

```markdown
---
name: hzl-orchestrator
description: Orchestrate multi-agent workflows using HZL. Use when breaking down projects into tasks, spawning worker agents, monitoring progress, or coordinating parallel task execution with the hzl CLI.
---

# HZL Orchestrator Skill

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

See @hzl-writing-tasks for description best practices.

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

See @hzl-status-reports for formatting.
```

**Step 3: Commit**

```bash
git add plugins/hzl-skills/skills/orchestrator/SKILL.md
git commit -m "feat: add hzl-orchestrator skill"
```

---

## Task 4: Convert Worker Skill

**Files:**
- Create: `plugins/hzl-skills/skills/worker/SKILL.md`
- Source: `skills/worker.md`

**Step 1: Create skill directory**

```bash
mkdir -p plugins/hzl-skills/skills/worker
```

**Step 2: Create SKILL.md with proper frontmatter**

```markdown
---
name: hzl-worker
description: Claim and complete tasks as a worker agent using HZL. Use when you need to find available work, claim tasks, report progress, or complete assignments in an hzl-coordinated workflow.
---

# HZL Worker Skill

You are a worker agent. Your job: find work -> claim -> do -> report -> repeat.

## The Loop

```
while tasks_exist:
    1. FIND   -> hzl task list --status=ready --project=<proj>
    2. CLAIM  -> hzl task claim <id> --lease-minutes=30
    3. WORK   -> Execute per task description
    4. REPORT -> hzl task complete <id>
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
```

**Step 3: Commit**

```bash
git add plugins/hzl-skills/skills/worker/SKILL.md
git commit -m "feat: add hzl-worker skill"
```

---

## Task 5: Convert Planning Skill

**Files:**
- Create: `plugins/hzl-skills/skills/planning/SKILL.md`
- Source: `skills/planning.md`

**Step 1: Create skill directory**

```bash
mkdir -p plugins/hzl-skills/skills/planning
```

**Step 2: Create SKILL.md with proper frontmatter**

```markdown
---
name: hzl-planning
description: Plan work for AI agent swarms using HZL. Use when breaking down projects into bite-sized tasks, optimizing for parallelism, or structuring task dependencies for multi-agent execution.
---

# HZL Planning Skill

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
Bad - Sequential (slow):
   A -> B -> C -> D -> E

Good - Parallel (fast):
   A --+-- B --+-- E
       +-- C --+
       +-- D --+
```

### Patterns

**Fan-out**: One setup task, then many independent tasks
```
Schema setup
  +-- Users API
  +-- Posts API
  +-- Comments API
  +-- Auth API
```

**Fan-in**: Many tasks converge to one integration task
```
Users API --+
Posts API --+-- Integration tests
Auth API ---+
```

**Diamond**: Setup -> parallel work -> integration
```
Schema --+-- Users API --+-- Integration
         +-- Posts API --+
         +-- Auth API ---+
```

## Task Independence

Each task should be completable without coordination:

**Good**: "Implement GET /users endpoint with tests"
- Clear scope
- Includes verification
- No blocking questions

**Bad**: "Implement user functionality"
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
```

**Step 3: Commit**

```bash
git add plugins/hzl-skills/skills/planning/SKILL.md
git commit -m "feat: add hzl-planning skill"
```

---

## Task 6: Convert Writing Tasks Skill

**Files:**
- Create: `plugins/hzl-skills/skills/writing-tasks/SKILL.md`
- Source: `skills/writing-tasks.md`

**Step 1: Create skill directory**

```bash
mkdir -p plugins/hzl-skills/skills/writing-tasks
```

**Step 2: Create SKILL.md with proper frontmatter**

```markdown
---
name: hzl-writing-tasks
description: Write effective task descriptions for AI workers using HZL. Use when creating tasks that need clear context, acceptance criteria, and verification steps for autonomous agent execution.
---

# HZL Writing Tasks Skill

Good task descriptions enable autonomous work. Bad ones cause confusion and wasted effort.

## Bad Task

```
title: "Fix the login bug"
```

Problem: No context, no location, no acceptance criteria.

## Good Task

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
```

**Step 3: Commit**

```bash
git add plugins/hzl-skills/skills/writing-tasks/SKILL.md
git commit -m "feat: add hzl-writing-tasks skill"
```

---

## Task 7: Convert Status Reports Skill

**Files:**
- Create: `plugins/hzl-skills/skills/status-reports/SKILL.md`
- Source: `skills/status-reports.md`

**Step 1: Create skill directory**

```bash
mkdir -p plugins/hzl-skills/skills/status-reports
```

**Step 2: Create SKILL.md with proper frontmatter**

```markdown
---
name: hzl-status-reports
description: Format status reports for humans using HZL data. Use when a human asks about project progress, task status, or wants an overview of what agents are working on.
---

# HZL Status Reports Skill

When a human asks "how's it going?", query the ledger and format a clear response.

## Template

```markdown
## Project: {PROJECT_NAME}
**Updated**: {TIMESTAMP}

### Progress
Done:    xxxxxxxx....   8/12 (67%)
Active:  xx..........   2/12
Ready:   ............   0/12
Blocked: xx..........   2/12

### In Progress
| Task | Worker | Time | Lease |
|------|--------|------|-------|
| Implement /users | worker-003 | 5m | 25m left |
| Build login UI | worker-007 | 12m | 18m left |

### Blocked
- "Add password reset" -> waiting on: email integration
- "Deploy to staging" -> waiting on: users, login UI

### Recently Completed
- Database schema (worker-003, 45m ago)
- API scaffolding (worker-001, 30m ago)

### Issues
- None (or list stuck/failed tasks)

### Next Up
- Add pagination to /posts
- Create user profile page
```

## Queries to Run

```bash
# Get stats
hzl project stats api-v2

# Active tasks with timing
hzl task list --status=in_progress --project=api-v2

# Recent completions
hzl task list --status=done --project=api-v2 --since=1h

# Stuck tasks
hzl task list --stuck --project=api-v2
```

## Tips

- Lead with progress percentage
- Show active workers by name
- Highlight blockers explicitly
- Keep it scannable (tables, bullets)
```

**Step 3: Commit**

```bash
git add plugins/hzl-skills/skills/status-reports/SKILL.md
git commit -m "feat: add hzl-status-reports skill"
```

---

## Task 8: Convert Troubleshooting Skill

**Files:**
- Create: `plugins/hzl-skills/skills/troubleshooting/SKILL.md`
- Source: `skills/troubleshooting.md`

**Step 1: Create skill directory**

```bash
mkdir -p plugins/hzl-skills/skills/troubleshooting
```

**Step 2: Create SKILL.md with proper frontmatter**

```markdown
---
name: hzl-troubleshooting
description: Diagnose and fix common HZL problems. Use when encountering claim failures, stuck tasks, database errors, or consistency issues with the hzl CLI.
---

# HZL Troubleshooting Skill

## Claim Failures

**"Task already claimed"**
-> Another agent got it first. Pick a different task.

**"Dependencies not met"**
-> A required task isn't done yet. Check with:
```bash
hzl task show <id>  # Shows depends_on
```

**"Task not ready"**
-> Task is in backlog/in_progress/done. Check status:
```bash
hzl task show <id>
```

## Stuck Tasks

**Finding them:**
```bash
hzl task list --stuck --project=api-v2
```

**Releasing them:**
```bash
hzl task release <id>
```

**Why it happens:**
- Worker crashed
- Worker took too long
- Lease expired

## Database Errors

**"SQLITE_BUSY"**
-> Auto-retried. If persistent, check for runaway processes:
```bash
lsof | grep ledger.db
```

**"Database locked"**
-> Only one writer allowed. Wait and retry.

## Consistency Issues

**Projection out of sync:**
```bash
hzl doctor        # Check consistency
hzl rebuild       # Rebuild projections from events
```

## Worker Won't Start

1. Check database path: `echo $HZL_DB`
2. Verify access: `ls -la <db-path>`
3. Test connection: `hzl task list`

## Anti-Patterns

| Don't Do | Why | Instead |
|----------|-----|---------|
| Claim multiple tasks | Blocks others, leases expire | One at a time |
| Work past lease | May get reassigned | Extend or release |
| Silent failure | Looks stuck forever | Always report status |
| Skip dependency check | Wasted work | Query ready tasks only |
```

**Step 3: Commit**

```bash
git add plugins/hzl-skills/skills/troubleshooting/SKILL.md
git commit -m "feat: add hzl-troubleshooting skill"
```

---

## Task 9: Move Original Guides to docs/agent-guides

**Files:**
- Move: `skills/*.md` -> `docs/agent-guides/*.md`

**Step 1: Create agent-guides directory**

```bash
mkdir -p docs/agent-guides
```

**Step 2: Move all skill files**

```bash
mv skills/*.md docs/agent-guides/
```

**Step 3: Remove empty skills directory**

```bash
rmdir skills
```

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: move original guides to docs/agent-guides"
```

---

## Task 10: Update README with Marketplace Section

**Files:**
- Modify: `README.md`

**Step 1: Add Claude Code Skills section after Installation**

Insert after the "Installation" section:

```markdown
## Claude Code Skills

If you use [Claude Code](https://claude.ai/code), you can install HZL skills directly:

```bash
# Add the HZL marketplace
/plugin marketplace add tmchow/hzl

# Install skills
/plugin install hzl-skills@hzl-marketplace
```

This gives you access to:
- **hzl-orchestrator**: Break down projects and coordinate workers
- **hzl-worker**: Claim and complete tasks autonomously
- **hzl-planning**: Structure work for parallel execution
- **hzl-writing-tasks**: Write effective task descriptions
- **hzl-status-reports**: Format progress reports for humans
- **hzl-troubleshooting**: Diagnose common issues

Skills auto-invoke based on context. See `plugins/hzl-skills/` for details.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add Claude Code skills installation to README"
```

---

## Task 11: Test Plugin Validation

**Files:**
- None (validation only)

**Step 1: Validate marketplace structure**

```bash
cd /Users/tmchow/Code/hzl
ls -la .claude-plugin/
cat .claude-plugin/marketplace.json
```

Expected: marketplace.json exists with valid JSON

**Step 2: Validate plugin structure**

```bash
ls -la plugins/hzl-skills/.claude-plugin/
cat plugins/hzl-skills/.claude-plugin/plugin.json
```

Expected: plugin.json exists with valid JSON

**Step 3: Verify all skills exist**

```bash
ls -la plugins/hzl-skills/skills/*/SKILL.md
```

Expected: 6 SKILL.md files (orchestrator, worker, planning, writing-tasks, status-reports, troubleshooting)

**Step 4: Verify original guides moved**

```bash
ls -la docs/agent-guides/
ls skills/ 2>/dev/null || echo "skills/ removed (expected)"
```

Expected: 6 .md files in docs/agent-guides/, skills/ directory removed

---

## Task 12: Final Commit and Summary

**Step 1: Check git status**

```bash
git status
```

**Step 2: If any uncommitted changes, commit them**

```bash
git add -A
git commit -m "chore: finalize marketplace structure"
```

**Step 3: View commit history**

```bash
git log --oneline -10
```

Expected: Series of commits for each task

---

## Summary

After completing all tasks, the repository will have:

```
/hzl/
├── .claude-plugin/
│   └── marketplace.json          # Marketplace definition
├── packages/
│   ├── hzl-core/                 # NPM package (unchanged)
│   └── hzl-cli/                  # NPM package (unchanged)
├── plugins/
│   └── hzl-skills/               # Claude Code plugin
│       ├── .claude-plugin/
│       │   └── plugin.json
│       └── skills/
│           ├── orchestrator/SKILL.md
│           ├── worker/SKILL.md
│           ├── planning/SKILL.md
│           ├── writing-tasks/SKILL.md
│           ├── status-reports/SKILL.md
│           └── troubleshooting/SKILL.md
├── docs/
│   ├── agent-guides/             # Original guides (reference)
│   └── plans/                    # This plan
└── README.md                     # Updated with marketplace instructions
```

Users can install via:
- **NPM**: `npm install -g hzl-cli`
- **Claude Code**: `/plugin marketplace add tmchow/hzl`
