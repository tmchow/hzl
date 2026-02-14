### HZL task ledger (external task tracking)

This project uses HZL for task tracking. Use it when tracking helps clarity, handoff, or auditability.

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
hzl task add "Feature X" -P myrepo -s ready \
  -d "Context, approach, and acceptance criteria"       # Ready to claim
hzl task add "Subtask A" --parent <id>                  # Subtask
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
hzl task show <parent-id> --deep --json  # Full subtask details + blocked_by
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
