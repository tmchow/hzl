### HZL task ledger (external task tracking)

HZL is an external task database. Use it whenever external tracking would help clarity, handoff, or auditability.
Multi-session or multi-agent work are common reasons to use HZL, not requirements.
Use HZL for single-session, single-agent work when the task is non-trivial.

**Prefer using HZL when:**
- Work may outlive this session or is likely to be paused/resumed
- You want a durable record of decisions, progress, or ownership
- You expect handoff or review by another agent/person
- The user asks to track work in HZL
- The task is non-trivial (multiple steps, ~30+ minutes, or risky changes)

**You can skip HZL when:**
- The work is small, clearly scoped, and will be completed immediately
- The user asks for a quick one-off answer or tiny change

**Rule of thumb:** If you feel tempted to make a multi-step plan or there is any chance you will not finish in this session, use HZL.

Example: "Investigate failing tests and fix root cause" -> use HZL because it likely involves multiple subtasks, even if you expect to finish within a session.

**Structure:**
- **Project** = stable container (one per repo). Check `hzl project list` before creating.
- **Task** = top-level work item (often a feature). Use `--depends-on` to sequence separate tasks.
- **Subtask** = breakdown of a task into parts (`--parent <id>`). Max 1 level of nesting.

**⚠️ Anti-pattern: project sprawl**
```bash
hzl project create "query-perf"  # ❌ Feature ≠ project
```
Features are parent tasks, not projects:
```bash
hzl task add "Query perf fixes" -P myrepo      # Parent task
hzl task add "Fix N+1" --parent <parent-id>    # Subtask
```

**Workflow:**
1. `hzl project list` — **Always check first. Reuse existing repo project.**
2. Only create a project for a NEW repo (not a feature).
3. For multi-step work: create parent task, then subtasks with `--parent`.
4. Claim before work, checkpoint progress, complete when done.
5. Use `--json` for scripted output.

**Task lifecycle:**
- New tasks start in `backlog` (not claimable)
- To work: `set-status <id> ready` → `claim <id>` → work → `complete <id>`
- Or create ready: `hzl task add "..." -P project -s ready`

**Quick commands:**
| Action | Command |
|--------|---------|
| Create (ready to work) | `hzl task add "title" -P project -s ready` |
| Create and claim | `hzl task add "title" -P project -s in_progress --assignee <name>` |
| Create (planning) | `hzl task add "title" -P project` |
| Claim | `hzl task claim <id> --assignee <name>` |
| Complete | `hzl task complete <id>` |

**⚠️ DESTRUCTIVE - Never run without explicit user request:**
- `hzl task prune` — **PERMANENTLY DELETES** old done/archived tasks. No undo.
- **AI agents: NEVER run prune unless the user explicitly asks to delete old tasks**
