# HZL (Hazel)

**A shared task ledger for OpenClaw and poly-agent workflows.**

OpenClaw is great at doing work: running tools, coordinating sub-agents, and maintaining memory.
What it (and most agent tools) do not give you is a durable, shared backlog that survives:

- session boundaries
- crashes/reboots
- switching between different agent runtimes (Claude Code, Codex, Gemini, etc.)

HZL fills that gap: a lightweight, local-first task tracker that any agent can read/write.

Using OpenClaw? Start here: [OpenClaw integration](#openclaw-integration)

Not using OpenClaw? Jump to: [Using HZL with Claude Code, Codex, Gemini CLI, or any coding agent](#using-hzl-with-claude-code-codex-gemini-cli-or-any-coding-agent)

HZL provides:

- Projects and tasks
- Dependencies (`B` waits for `A`)
- Checkpoints (progress snapshots you can resume from)
- Leases (time-limited claims for multi-agent coordination)
- Event history (audit trail)
- A CLI + JSON output that agents can script against

Data is stored in SQLite. Default location: `$XDG_DATA_HOME/hzl/data.db` (fallback `~/.local/share/hzl/data.db`); Windows: `%LOCALAPPDATA%\\hzl\\data.db`.

---

## Why another task tracker?

Because most task trackers are built for humans.

HZL is built for agents:

- It is backend-first, not UI-first. Think "task database with a CLI," not "another Trello."
- It is model-agnostic. Your tasks live outside any one vendor's memory or chat history.
- It is multi-agent safe. Leases prevent orphaned work and enable clean handoffs.
- It is resumable. Checkpoints let an agent crash, reboot, or swap models and keep going.

If you already have a favorite human todo app, keep it.
If you need a shared task state that multiple agents can read/write, that is HZL.

---

## Where HZL fits

### 1) OpenClaw orchestrator + sub-agents

```mermaid
flowchart LR
  You[You] --> OC["OpenClaw (orchestrator)"]
  OC --> Tools["OpenClaw tools<br/>(browser, exec, email, etc.)"]
  OC <--> HZL[(HZL task ledger)]
  OC --> S1[Claude Code]
  OC --> S2[Codex / other]
  S1 <--> HZL
  S2 <--> HZL
```

OpenClaw coordinates the work. HZL is the shared, durable task board that OpenClaw and its sub-agents can use across sessions.

### 2) Any poly-agent system (no OpenClaw required)

```mermaid
flowchart LR
  U[You] --> O["Orchestrator (human or agent)"]
  O <--> HZL[(HZL)]
  O --> C[Claude Code]
  O --> X[Codex]
  O --> G[Gemini]
  C <--> HZL
  X <--> HZL
  G <--> HZL
```

Same idea: once you are switching tools/models, you need a shared ledger.

### 3) One agent, many sessions

```mermaid
flowchart LR
  U[You] --> A[Coding agent]
  A <--> HZL
  A --> R[Repo / files]
```

Use HZL to persist "what's next" and "what changed" between sessions.

### 4) HZL as the backend for your own UI

```mermaid
flowchart LR
  UI[Your lightweight web app] --> HZL
  Agents[Agents + scripts] --> HZL
```

If you want a human-friendly interface, build one. HZL stays the durable backend that both humans and agents can use.

---

## Quickstart

### Install

Requires Node.js 22.14+.

```bash
npm install -g hzl-cli
hzl init
```

### Create a project and tasks

```bash
hzl project create portland-trip

hzl task add "Check calendars for March weekends" -P portland-trip --priority 5
hzl task add "Research neighborhoods + activities" -P portland-trip --priority 4
hzl task add "Shortlist 2-3 weekend options" -P portland-trip --priority 3 \
  --depends-on <calendar-task-id> --depends-on <research-task-id>
```

### Work with checkpoints

```bash
hzl task claim <calendar-task-id> --author trevin-agent
hzl task checkpoint <calendar-task-id> "Found 3 options: Mar 7-9, 14-16, 21-23"
hzl task complete <calendar-task-id>
```

### Use JSON output when scripting

```bash
hzl task show <id> --json
hzl task next --project portland-trip --json
```

---

## Core concepts (the stuff that matters)

### Tasks are units of work, not reminders

HZL is optimized for "do work, report progress, unblock the next step."

If you need time-based reminders, pair HZL with a scheduler (cron, OpenClaw cron, etc.).

### Checkpoints are progress snapshots

A checkpoint is a compact, durable record of what happened:

- what you tried
- what you found
- what's still missing
- links, commands, or file paths needed to resume

### Dependencies encode ordering

Dependencies are how an agent avoids premature work:

- "Don't search flights before you know dates."
- "Don't open a PR before tests pass."

### Leases make multi-agent handoffs reliable

Leases are time-limited claims:

- A worker agent claims a task with `--lease 30`
- If it disappears, the lease expires
- Another agent can detect stuck work and take over

---

## Patterns

### Pattern: Poly-agent backlog (recommended)

Conventions that help:

- Use consistent author IDs: `openclaw`, `claude-code`, `codex`, `gemini`, etc.
- Claim tasks before work.
- Checkpoint whenever you learn something that would be painful to rediscover.

Example handoff:

```bash
# Orchestrator creates task
hzl task add "Implement REST API endpoints" -P myapp --priority 2
TASK_ID=<id>

# Worker agent claims with a lease
hzl task claim "$TASK_ID" --author claude-code --lease 30
hzl task checkpoint "$TASK_ID" "Endpoints scaffolded; next: auth middleware"
hzl task complete "$TASK_ID"
```

### Pattern: Personal todo list (it works, but bring your own UI)

HZL can track personal tasks and has the advantage of centralizing agent and personal tasks.
This enables scenarios like OpenClaw assigning you tasks without needing to sync with other todo systems.

HZL itself is not trying to be a polished, human-first todo app. You bring other pieces for that.

If you want a todo app, build or use a UI:

- a tiny web app
- a TUI wrapper
- a menu bar widget

HZL stays the storage layer and concurrency-safe ledger underneath.

---

## Using HZL with Claude Code, Codex, Gemini CLI, or any coding agent

If your coding agent supports an instruction file (for example `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, etc.), add a short policy so the agent reaches for HZL consistently.

### Drop-in policy snippet

```md
### HZL task ledger (use for multi-step work)

When a request has multiple steps, spans multiple sessions, or involves coordination with other agents/tools:
1) Create or use an HZL project for the work.
2) Break work into tasks with dependencies.
3) Claim tasks before work and checkpoint after meaningful progress.
4) Use `--json` when producing output another tool will parse.

Key commands:
- `hzl project create <name>`
- `hzl task add "<title>" -P <project> [--depends-on <id>]`
- `hzl task claim <id> --author <agent-id> [--lease 30]`
- `hzl task checkpoint <id> "<progress + next step>"`
- `hzl task complete <id>`
```

That snippet is intentionally short. The goal is consistency, not ceremony.

### Claude Code marketplace (optional)

HZL includes a Claude Code plugin marketplace with skills that help agents work effectively with HZL.

```bash
# Add the marketplace
/plugin marketplace add tmchow/hzl

# Install the skills plugin
/plugin install hzl-skills@hzl-marketplace
```

See [`packages/hzl-marketplace`](./packages/hzl-marketplace) for details.

## OpenClaw integration

OpenClaw is a self-hosted AI assistant that can coordinate tools and sub-agents.
HZL fits well as the task ledger that OpenClaw (and its sub-agents) can share.

### Quick start (recommended)

Copy/paste this into an OpenClaw chat (single prompt):

```
Install HZL from https://github.com/tmchow/hzl and run hzl init. Install the HZL skill from https://www.clawhub.ai/tmchow/hzl. Then append the HZL policy from https://raw.githubusercontent.com/tmchow/hzl/main/docs/openclaw-hzl-tools-prompt.md to my TOOLS.md.
```

### Manual setup

1) Install HZL on the machine running OpenClaw:

```bash
npm install -g hzl-cli
hzl init
```

2) Install the HZL skill from https://www.clawhub.ai/tmchow/hzl  
   Skill source (for reference only): **[`docs/openclaw/skill-hzl.md`](./docs/openclaw/skill-hzl.md)**

3) Teach OpenClaw when to use HZL (important):
   - Copy/paste from: **[`docs/openclaw-hzl-tools-prompt.md`](./docs/openclaw-hzl-tools-prompt.md)**
   - Or tell OpenClaw to add this policy to `TOOLS.md`:

```
HZL is a tool available to you for task management in certain cases. I want you to add this information to your TOOLS.md in the right way so you remember how to use it:
https://raw.githubusercontent.com/tmchow/hzl/main/docs/openclaw-hzl-tools-prompt.md
```

---

## When to use HZL (and when not to)

### Use HZL when:

- work has multiple steps and you want explicit sequencing
- work spans multiple sessions (resume tomorrow with confidence)
- you are coordinating multiple agents or model providers
- you need durable status reporting (done / in progress / blocked / next)
- you want a task ledger your own UI can sit on top of

### Consider something else when:

- you need time-based reminders or notifications (use a scheduler + a notifier)
- you need rich human workflow features (due dates, recurring tasks, calendar views)
- you are tracking an org-wide backlog (GitHub/Jira/etc. may be a better fit)

---

## CLI reference (short)

```bash
hzl init

hzl project create <name>
hzl project list

hzl task add "<title>" -P <project>
hzl task list --project <project>
hzl task next --project <project>

hzl task claim <id> --author <name> [--lease <minutes>]
hzl task checkpoint <id> "<message>"
hzl task complete <id>

hzl task stuck
hzl task steal <id> --if-expired

hzl task show <id> --json
```

---

## License

MIT
