### HZL task ledger (external task tracking for multi-session/multi-agent work)

HZL is an external task database. Use it when work outlives this session or involves other agents.
Built-in task tracking (if available) is fine for single-session work you'll complete now.

**When to use HZL:**
- Work spanning multiple sessions or days
- Coordination with other agents (Claude Code ↔ Codex ↔ Gemini)
- Delegating to sub-agents with explicit handoff
- User explicitly asks to track work in HZL

**When NOT to use HZL:**
- Single-session work you'll complete in this conversation
- User hasn't mentioned persistence or multi-agent needs

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
