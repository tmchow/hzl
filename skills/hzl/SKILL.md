---
name: hzl
description: This skill should be used when working with HZL for task tracking, when the user asks to "break down work into tasks", "track tasks with HZL", "claim a task", "checkpoint progress", "complete a task", or when working on a project that uses HZL. Provides guidance on effective task management patterns for AI agents.
---

# HZL Task Management

HZL is a lightweight task tracking system for AI agents. It is a dumb ledger—it tracks work state but does not orchestrate, prioritize, or decide what to do next.

This skill teaches how to use HZL effectively for tracking work across projects.

## Core Workflow

<!-- START docs/snippets/agent-policy.md -->
<!-- ⚠️ DO NOT EDIT - Auto-generated from docs/snippets/agent-policy.md -->
### HZL task ledger (external task tracking)

HZL is an external task database. Use it when external tracking helps clarity, handoff, or auditability.

**Use HZL when:**
- Work has multiple steps or may not finish this session
- You want durable record of progress or ownership
- Handoff or review expected
- Task is non-trivial (~30+ min or risky changes)

**Skip HZL when:**
- Small, clearly scoped work completed immediately
- Quick one-off answer or tiny change

**Rule of thumb:** If you're tempted to make a multi-step plan, use HZL.

**Structure:**
- **Project** = repo name. One per repo. Always `hzl project list` first.
- **Task** = feature or work item.
- **Subtask** = breakdown (`--parent <id>`). Max 1 level.

**Anti-pattern: project sprawl**
```bash
hzl project create "query-perf"  # Wrong: feature is not a project
```
Features are parent tasks:
```bash
hzl task add "Query perf" -P myrepo           # Parent task
hzl task add "Fix N+1" --parent <parent-id>   # Subtask
```

---

**Setup:**
```bash
hzl project list                    # Always check first
hzl project create <repo-name>      # Only if needed
```

**Adding work:**
```bash
hzl task add "Feature X" -P myrepo -s ready           # Ready to claim
hzl task add "Subtask A" --parent <id>                # Subtask
hzl task add "Subtask B" --parent <id> --depends-on <subtask-a-id>  # With dependency
```

**Task context:** Use `-d` for details, `-l` for reference docs:
```bash
hzl task add "Add rate limiting" -P myrepo -s ready \
  -d "Per linked spec. Use RateLimiter from src/middleware/." \
  -l docs/rate-limit-spec.md
```
If docs exist, reference them (don't duplicate—avoids drift). If no docs, include enough detail to complete the task. Description supports markdown/multiline.

**Working on a task:**
```bash
hzl task next -P myrepo                  # Next available task
hzl task next --parent <id>              # Next subtask of parent
hzl task next -P myrepo --claim          # Find and claim in one step
hzl task claim <id>                      # Claim specific task
hzl task checkpoint <id> "milestone X"   # Notable progress or before pausing
```

**Changing status:**
```bash
hzl task set-status <id> ready           # Make claimable (from backlog)
hzl task set-status <id> backlog         # Move back to planning
```
Statuses: `backlog` → `ready` → `in_progress` → `done` (or `blocked`)

**When blocked:**
```bash
hzl task block <id> --comment "Waiting for API keys from DevOps"
hzl task unblock <id>                    # When resolved
```

**Finishing work:**
```bash
hzl task comment <id> "Implemented X, tested Y"  # Optional: final notes
hzl task complete <id>

# After completing a subtask, check parent:
hzl task show <parent-id> --json         # Any subtasks left?
hzl task complete <parent-id>            # If all done, complete parent
```

**Troubleshooting:**
| Error | Fix |
|-------|-----|
| "not claimable (status: backlog)" | `hzl task set-status <id> ready` |
| "Cannot complete: status is X" | Claim first: `hzl task claim <id>` |

---

**DESTRUCTIVE - Never run without explicit user request:**
- `hzl task prune` — **PERMANENTLY DELETES** old done/archived tasks. No undo.
<!-- END docs/snippets/agent-policy.md -->

---

## Advanced: Sizing Parent Tasks

HZL supports one level of nesting (parent → subtasks). Scope parent tasks to completable outcomes.

**The completability test:** "I finished [parent task]" should describe a real outcome.
- ✓ "Finished the user authentication feature"
- ✗ "Finished the backend work" (frontend still pending)
- ✗ "Finished home automation" (open-ended, never done)

**Scope by problem, not technical layer.** A full-stack feature (frontend + backend + tests) is usually one parent if it ships together.

**Split into multiple parents when:**
- Parts deliver independent value (can ship separately)
- You're solving distinct problems that happen to be related

**Adding context:** Use `-d` for details, `-l` for reference docs:
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

## Advanced: Multi-Agent Coordination

When multiple agents work on the same project:

### Atomic claiming

HZL uses atomic claiming. Two agents calling `task next --claim` simultaneously will get different tasks. This prevents duplicate work.

### Authorship tracking

| Concept | What it tracks | Set by |
|---------|----------------|--------|
| **Assignee** | Who owns the task | `--assignee` on `claim` or `add` |
| **Event author** | Who performed an action | `--author` on other commands |

```bash
# Alice owns the task
hzl task claim <id> --assignee alice

# Bob adds a checkpoint (doesn't change ownership)
hzl task checkpoint <id> "Reviewed the code" --author bob
```

For AI agents that need session tracking:
```bash
hzl task claim <id> --assignee "Claude Code" --agent-id "session-abc123"
```

### Leases for long-running work

Use leases to indicate how long before a task is considered stuck:

```bash
hzl task claim <id> --assignee <name> --lease 30  # 30 minutes
```

### Recovering stuck tasks

If an agent dies or becomes unresponsive:

```bash
# Find tasks with expired leases
hzl task stuck --json

# Review checkpoints before taking over
hzl task show <task-id> --json

# Take over an expired task
hzl task steal <task-id> --if-expired --author agent-2
```

## Advanced: Human Oversight

Humans can monitor and steer agent work through HZL:

### Monitoring progress

```bash
hzl project list
hzl task list --project myapp --status in_progress
hzl task show <task-id>
```

Or use the web dashboard:
```bash
hzl serve  # Opens at http://localhost:3456
```

### Providing guidance

```bash
hzl task comment <task-id> "Please also handle the edge case where user is already logged in"
```

**Agents should check for comments before completing tasks:**
```bash
hzl task show <task-id> --json
```
Review the task history for steering feedback before marking complete.

## Advanced: Dependencies and Validation

### Adding dependencies after creation

```bash
hzl task add-dep <task-id> <depends-on-id>
```

### Validating the task graph

Check for circular dependencies or other issues:
```bash
hzl validate
```

## Best Practices

1. **Always use `--json`** for programmatic output
2. **Checkpoint at milestones** or before pausing work
3. **Check for comments** before completing tasks
4. **Use stable project names** derived from repo or agent identity
5. **Use dependencies** to express sequencing, not priority
6. **Use leases** for long-running work to enable stuck detection
7. **Review checkpoints** before stealing stuck tasks

## What HZL Does Not Do

HZL is deliberately limited:

- **No orchestration** - Does not spawn agents or assign work
- **No task decomposition** - Does not break down tasks automatically
- **No smart scheduling** - Uses simple priority + FIFO ordering

These are features for your orchestration layer, not for the task tracker.

## Additional Features

Not covered in detail here:

- Cloud sync via Turso for backup and multi-device access (`hzl init --sync-url ...`)
- Web dashboard for human monitoring (`hzl serve`)
- Priority and tags for categorization

For complete command options, use `hzl <command> --help`.
