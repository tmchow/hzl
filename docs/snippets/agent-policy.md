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
- **Project** = stable container (typically one per repo or long-running initiative). Check `hzl project list` before creating.
- **Task** = top-level work item (often a feature). Use `--depends-on` to sequence separate tasks.
- **Subtask** = breakdown of a task into parts (`--parent <id>`). Max 1 level of nesting.

**Workflow:**
1. `hzl project list` to find existing, or `hzl project create <name>`
2. Add tasks. Use `--depends-on` for sequencing, `--parent` for breakdown, `--links` for context docs.
3. Claim before work, checkpoint progress, complete when done.
4. Use `--json` for scripted output.

**Key commands:**
- `hzl task add "<title>" -P <project> [--depends-on <id>] [--parent <id>] [--links <file>]`
- `hzl task claim <id> --agent-id <id> [--lease 30]` (use `--author` for human name)
- `hzl task checkpoint <id> "<progress>"`
- `hzl task progress <id> <value>` (0-100 completion percentage)
- `hzl task block <id> --reason "<why>"` (mark as blocked)
- `hzl task unblock <id>` (return to in_progress)
- `hzl task complete <id>`
- `hzl task next --project <project>` (returns next available; never returns parent tasks)
