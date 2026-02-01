### Tasks: Multi-session and long-running

HZL is a tool that complements your existing memory tools. While memory handles user context, preferences, and past conversations, HZL handles *task execution state*: the work in flight, dependencies, and progress checkpoints.

It's a database-backed task ledger that persists outside the context window—queryable anytime without reconstructing from chat history. It supports projects, tasks, dependencies, checkpoints, leases, and an event history.

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

You have a global HZL skill installed that should be used.

#### Command quick reference

- Before starting work on a task, claim it:
  - `hzl task claim <id> --author <agent-id>`
- When handing work to a sub-agent, claim with a lease:
  - `hzl task claim <id> --author <subagent-id> --lease 30`
- After meaningful progress, write a checkpoint (include the next step):
  - `hzl task checkpoint <id> "What happened, links/commands, and what to do next"`
- On completion, mark complete:
  - `hzl task complete <id>`
- If a lease expires, recover:
  - `hzl task stuck`
  - `hzl task steal <id> --if-expired`

**Conventions**

- Use consistent author IDs:
  - `openclaw` (main orchestrator)
  - `subagent-claude-code`, `subagent-codex`, `subagent-gemini`, etc.
- Create one HZL project per user request or per initiative.
- Encode ordering with dependencies instead of relying on chat memory.
