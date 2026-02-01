# HZL (Hazel)

**External task ledger for coding agents and OpenClaw.**

Claude Code has [Tasks](https://x.com/trq212/status/2014480496013803643). If you use Claude Code for short, self-contained work, that's probably enough.

HZL is for when work outlives a single session: days-long projects, switching between Claude Code and Codex, OpenClaw juggling parallel workstreams.

**Coding agents (Claude Code, Codex, Gemini)**

You're working across several projects over days or weeks. You switch between agents. Each has its own task tracking (or none).

HZL is the shared ledger underneath. Claim a task in Claude Code, pick it up in Codex tomorrow. One source of truth across tools and sessions.

**OpenClaw**

OpenClaw has tools for user memory—context, preferences, past chats. It doesn't have a tool for tracking task execution state: workstreams, dependencies, checkpoints.

That all lives in-context today. It burns space. It fragments when chats compact.

HZL fills that gap. Say you ask OpenClaw to plan a family vacation—flights, hotels, activities, reservations. That's multiple tasks with dependencies (can't book hotels until you know the dates). Instead of tracking all of it in the chat, OpenClaw creates tasks in HZL:

```bash
hzl task list --project family-vacation --available --json
{"tasks":[{"task_id":"t_abc123","title":"Book hotel","project":"family-vacation","status":"ready","priority":3,"created_at":"2025-01-15T10:00:00.000Z"}],"total":1}
```

OpenClaw queries HZL, sees what's unblocked, and picks up the next task—without reconstructing state from a compacted chat. If you ever run multiple OpenClaw instances, they coordinate through the same ledger.

**Local-first with built-in cloud sync**

Fast reads and writes to local SQLite. Enable sync to [Turso](https://turso.tech) with one command (`hzl init --sync-url ...`) for automatic backup and multi-device access.

**Also**

- Leases: time-limited claims that expire, so callers can find and reclaim stuck work
- Checkpoints: save progress notes so work can resume after interruption
- Event history: full audit trail of what happened

Using OpenClaw? Start here: [OpenClaw integration](#openclaw-integration)

Using Claude Code, Codex, or Gemini? See: [Using HZL with coding agents](#using-hzl-with-claude-code-codex-gemini-cli-or-any-coding-agent)

Data is stored in SQLite. Default location: `$XDG_DATA_HOME/hzl/` (fallback `~/.local/share/hzl/`); Windows: `%LOCALAPPDATA%\\hzl\\`. Contains `events.db` (source of truth) and `cache.db` (projections).

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

### 2) Any multi-agent system (no OpenClaw required)

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
  U[You] --> A["Coding agent<br>(Claude Code, Codex, etc)"]
  A <--> HZL
  A --> R[Repo / files]
```

Use HZL to persist "what's next" and "what changed" between sessions.

### 4) HZL as the backend for your own UI

```mermaid
flowchart LR
  UI[Lightweight web app] --> HZL
  Agents[Agents + scripts] --> HZL
```

HZL includes a basic [Kanban dashboard](#web-dashboard) for human visibility. For richer interfaces, build your own frontend using `hzl-core` directly—HZL stays the durable backend that both humans and agents can use.

---

## Quickstart

### Install

Requires Node.js 22.14+.

#### Via Homebrew (macOS/Linux)

```bash
brew tap tmchow/hzl
brew install hzl
```

#### Via NPM

```bash
npm install -g hzl-cli
hzl init
```

### Enable Cloud Sync (Optional)

Sync with a Turso database for multi-device/multi-agent access:

```bash
hzl init --sync-url libsql://<db>.turso.io --auth-token <token>
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

### Link to supporting documents

Tasks stay lightweight. Use `--links` to reference design docs, brainstorms, or specs:

```bash
# Create a task that links to context documents
hzl task add "Implement auth flow per design" -P myapp --priority 3 \
  --links docs/designs/auth-flow.md \
  --links docs/brainstorm/2026-01-auth-options.md

# The agent reads linked files for context, task stays focused on the work
hzl task show <id> --json
# → { "links": ["docs/designs/auth-flow.md", "https://somedomain/resource.md"], ... }
```

This pattern keeps tasks actionable while pointing agents to richer context stored elsewhere.

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

### Cloud Sync & Offline-First

HZL uses a **local-first** architecture. You always read/write to a fast local database. Sync happens in the background via Turso/libSQL.

```mermaid
flowchart TD
    CLI[User / Agent CLI]
    subgraph Local["Local Machine"]
        Cache[(cache.db<br/>Reads)]
        Events[(events.db<br/>Writes)]
        Sync[Sync Engine]
    end
    Cloud[(Turso / Cloud)]

    CLI -->|Read| Cache
    CLI -->|Write| Events
    Events -->|Rebuild| Cache
    Events <-->|Sync| Sync
    Sync <-->|Replication| Cloud
```

---

## Patterns

### Pattern: Multi-agent backlog (recommended)

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

### Pattern: Breaking down work with subtasks

HZL supports one level of parent/subtask hierarchy for organizing related work.

**Key behavior: Parent tasks are organizational containers, not actionable work.**

When you call `hzl task next`, only leaf tasks (tasks without children) are returned. Parent tasks are never returned because they represent the umbrella—work happens on the subtasks.

```bash
# Create parent task
hzl task add "Implement user authentication" -P myapp --priority 2
# → Created task abc123

# Create subtasks (project inherited automatically from parent)
hzl task add "Add login endpoint" --parent abc123
hzl task add "Add logout endpoint" --parent abc123
hzl task add "Add session management" --parent abc123

# View the breakdown
hzl task show abc123
# Shows task details plus list of subtasks

# Get next available subtask (parent is never returned)
hzl task next --project myapp
# → [def456] Add login endpoint

# Scope work to a specific parent's subtasks
hzl task next --parent abc123
# → [def456] Add login endpoint

# When all subtasks done, manually complete the parent
hzl task complete abc123
```

**Constraints:**
- Maximum 1 level of nesting (subtasks cannot have their own subtasks)
- Subtasks are always in the same project as parent (auto-inherited)
- Moving a parent moves all subtasks atomically

**Filtering:**
```bash
# See all subtasks of a task
hzl task list --parent abc123

# See only top-level tasks (no parent)
hzl task list --root

# Combine with other filters
hzl task list --root --status ready
```

**Archiving:**
```bash
# Archive parent with all subtasks
hzl task archive abc123 --cascade

# Archive parent only (subtasks promoted to top-level)
hzl task archive abc123 --orphan
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

**Why HZL when your agent already has task tracking?**

Many coding agents (like Claude Code) have built-in task management. HZL complements rather than replaces it:

- **Cross-agent workflows**: If you use Claude Code *and* Codex *and* Gemini, each has its own task system. HZL is the shared ledger they can all read/write.
- **Session persistence**: Built-in task trackers often reset between sessions. HZL persists to disk (and optionally to cloud).
- **Orchestration**: When one agent delegates to another, HZL provides the handoff mechanism (claim, checkpoint, complete).
- **Backup**: With cloud sync enabled, your task state survives machine failures.

If you only ever use one agent and never need cross-session persistence, the built-in tracker is fine. Once you need durability or multi-agent coordination, reach for HZL.

If your coding agent supports an instruction file (for example `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, etc.), add a short policy so the agent reaches for HZL consistently.

### Drop-in policy snippet

```md
### HZL task ledger (durable, cross-agent task tracking)

HZL is a shared task database that persists across sessions and works across different agents.
Use it when work spans multiple sessions, involves handoffs to other agents, or needs durable backup.
If this agent has built-in task tracking, HZL complements it for cross-agent and multi-session work.

When to use HZL:
- Multi-session work that must survive restarts
- Coordination with other agents (Claude Code ↔ Codex ↔ Gemini, etc.)
- Work delegated to sub-agents that need explicit handoff
- When you need task state backed up to cloud

Workflow:
1) Create or use an HZL project for the work.
2) Break work into tasks with dependencies. Use `--links` to reference design docs or specs.
3) Claim tasks before work and checkpoint after meaningful progress.
4) Use `--json` when producing output another tool will parse.

Key commands:
- `hzl project create <name>`
- `hzl task add "<title>" -P <project> [--depends-on <id>] [--links <file>]`
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

---

## OpenClaw integration

OpenClaw is a self-hosted AI assistant that can coordinate tools and sub-agents.
HZL fits well as the task ledger that OpenClaw (and its sub-agents) can share.

### Quick start (recommended)

Copy/paste this into an OpenClaw chat (single prompt):

```
Install HZL from https://github.com/tmchow/hzl and run hzl init. Install the HZL skill from https://www.clawhub.ai/tmchow/hzl. Then append the HZL policy from https://raw.githubusercontent.com/tmchow/hzl/main/docs/openclaw/tools-prompt.md to my TOOLS.md.
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
   - Copy/paste from: **[`docs/openclaw/tools-prompt.md`](./docs/openclaw/tools-prompt.md)**
   - Or tell OpenClaw to add this policy to `TOOLS.md`:

```
HZL is a tool available to you for task management in certain cases. I want you to add this information to your TOOLS.md in the right way so you remember how to use it:
https://raw.githubusercontent.com/tmchow/hzl/main/docs/openclaw/tools-prompt.md
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
# Setup
hzl init                                      # Initialize database (add --sync-url for cloud)
hzl init --reset-config                       # Reset config to default database location

# Projects
hzl project create <name>                     # Create a project
hzl project list                              # List all projects

# Tasks
hzl task add "<title>" -P <project>           # Create task (--depends-on, --links, --priority)
hzl task list --project <project>             # List tasks (--available for claimable only)
hzl task next --project <project>             # Get highest priority available task

# Working
hzl task claim <id> --author <name>           # Claim task (--lease <minutes> for expiry)
hzl task checkpoint <id> "<message>"          # Save progress snapshot
hzl task complete <id>                        # Mark done

# Coordination
hzl task stuck                                # Find expired leases
hzl task steal <id> --if-expired              # Take over abandoned task
hzl task show <id> --json                     # Task details (--json for scripting)

# Subtasks (organization)
hzl task add "<title>" --parent <id>          # Create subtask (inherits project)
hzl task list --parent <id>                   # List subtasks of a task
hzl task list --root                          # List only top-level tasks
hzl task next --parent <id>                   # Next available subtask
hzl task show <id>                            # Shows subtasks inline
hzl task archive <id> --cascade               # Archive parent and all subtasks
hzl task archive <id> --orphan                # Archive parent, promote subtasks

# Diagnostics
hzl sync                                      # Sync with cloud (if configured)
hzl status                                    # Show database and sync state
hzl doctor                                    # Health checks

# ⚠️ DESTRUCTIVE - deletes all data
hzl init --force                              # Prompts for confirmation before deleting
hzl init --force --yes                        # Deletes WITHOUT confirmation (dangerous)

# Web Dashboard
hzl serve                                     # Start dashboard (network accessible)
hzl serve --port 8080                         # Custom port
hzl serve --host 127.0.0.1                    # Restrict to localhost only
hzl serve --background                        # Fork to background
hzl serve --stop                              # Stop background server
hzl serve --status                            # Check if running
```

---

## Web Dashboard

HZL includes a lightweight Kanban dashboard for monitoring tasks in near real-time.

```bash
hzl serve                    # Start on port 3456 (network accessible by default)
hzl serve --host 127.0.0.1   # Restrict to localhost only
```

Open `http://localhost:3456` to see:

- **Kanban board** with columns: Backlog → Blocked → Ready → In Progress → Done
- **Date filtering**: Today, Last 3d, 7d, 14d, 30d
- **Project filtering**: Focus on a single project
- **Task details**: Click any card to see description, comments, and checkpoints
- **Activity panel**: Recent status changes and events
- **Mobile support**: Tabs layout on smaller screens

The dashboard polls automatically (configurable 1-30s interval) and pauses when the tab is hidden.

### Background mode

Run the dashboard as a background process:

```bash
hzl serve --background       # Fork to background, write PID
hzl serve --status           # Check if running
hzl serve --stop             # Stop the background server
```

### Running as a service (systemd)

For always-on access (e.g., on an OpenClaw box via Tailscale):

```bash
hzl serve --print-systemd > ~/.config/systemd/user/hzl-web.service
systemctl --user daemon-reload
systemctl --user enable --now hzl-web
```

The server binds to `0.0.0.0` by default, making it accessible over the network (including Tailscale). Use `--host 127.0.0.1` to restrict to localhost only.

---

## Packages

HZL is a monorepo with three packages:

| Package | Description | Install |
|---------|-------------|---------|
| [`hzl-cli`](https://www.npmjs.com/package/hzl-cli) | CLI for task management (`hzl` command) | `brew install hzl`<br/>`npm install -g hzl-cli` |
| [`hzl-core`](https://www.npmjs.com/package/hzl-core) | Core library for programmatic use | `npm install hzl-core` |
| [`hzl-web`](https://www.npmjs.com/package/hzl-web) | Web server and Kanban dashboard | `npm install hzl-web` |

Most users should install `hzl-cli`. Use `hzl-core` or `hzl-web` directly if you're building your own tooling or UI on top of HZL.

---

## License

MIT
