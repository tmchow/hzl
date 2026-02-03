### Tasks: Multi-session and long-running

HZL is a tool that complements your existing memory tools. While memory handles user context, preferences, and past conversations, HZL handles *task execution state*: the work in flight, dependencies, and progress checkpoints.

It's a database-backed task ledger that persists outside the context window—queryable anytime without reconstructing from chat history.

**When to use HZL**

Use HZL when any of the following is true:

- The work has multiple steps (especially with dependencies).
- The work will likely span multiple sessions, whether across an hour or days.
- The work involves delegating to sub-agents or using multiple model providers/tools.
- The work benefits from checkpoints so we can resume after failures.
- We need accurate status reporting (done / in progress / blocked / next).

**When NOT to use HZL**

Prefer other mechanisms when:

- The request is a single quick action that will be completed immediately.
- The user needs time-based reminders or notifications (use cron + a notifier).
- The "task" is better modeled as memory (preferences, decisions, facts).

**How to use HZL**

You should have the HZL skill installed (`hzl`). It contains the full command reference and recommended patterns. Use that skill for:

- Command syntax and flags
- Authorship and progress tracking
- Blocked task handling
- Sub-agent coordination with leases
- Subtask organization

If the skill is not installed, run `npx clawhub@latest install hzl` or use your platform's official method to install the `hzl` skill.

**Conventions**

- Use a single `openclaw` project. Check `hzl project list` first.
- Multi-step requests become parent tasks (not new projects):
  ```bash
  hzl task add "Fix query performance" -P openclaw   # Parent
  hzl task add "Fix N+1" --parent <id>               # Subtask
  ```
- Name parent tasks for completable outcomes ("Install garage sensors"), not domains ("Home automation").
- Use consistent author IDs:
  - `openclaw` (main orchestrator)
  - `subagent-claude-code`, `subagent-codex`, `subagent-gemini`, etc.
- Encode ordering with dependencies instead of relying on chat memory.
