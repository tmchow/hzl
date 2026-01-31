# HZL

**Lightweight task tracking for AI agents and swarms.**

HZL is a CLI-first task management system designed for solo developers working with multiple AI agents across multiple projects. It provides durable, local coordination without the overhead of team-oriented project management tools.

## Why HZL?

Most project management tools assume teams of humans collaborating on shared repositories. When you're a solo developer with AI agents as your primary collaborators, these tools become heavyweight:

- **Repository-level storage is limiting.** You work across many repos and non-code projects. HZL stores tasks at the user level (`~/.hzl/data.db`), giving you one source of truth for all your work.

- **Agents need machine-readable interfaces.** HZL's CLI is optimized for programmatic use with `--json` output, atomic operations, and deterministic selection policies that agents can rely on.

- **Concurrent agents need coordination.** Multiple agents working in parallel can atomically claim tasks, preventing conflicts. No heartbeats required—checkpoints let agents recover each other's work.

- **Active work, not archival.** HZL is designed for coordinating current projects, not storing years of task history. Track recent work, see progress stats, then let completed tasks fade.

## Design Principles

1. **Tracker, not orchestrator.** HZL is a dumb ledger. It tracks work state—it doesn't orchestrate, prioritize, or decide what agents should do. Orchestration belongs elsewhere: in your control agents, workflow tools, or the agents themselves. This separation is intentional. HZL stays simple and reliable because it does one thing well.

2. **Events are truth.** Every change is an append-only event. Current state is a projection. Full audit trails, reconstructable history.

3. **Local-first.** SQLite with WAL mode. No network dependency. Works offline.

4. **Hierarchical but simple.** Projects contain tasks. Tasks can have subtasks and dependencies. That's it.

## Non-Goals

HZL intentionally does not do these things:

- **Orchestration.** HZL doesn't spawn agents, manage their lifecycles, assign work, or decide what should happen next. If you need a control agent that spawns sub-agents, that logic lives in your agent—not in HZL.

- **Task decomposition.** HZL won't break down "build the app" into subtasks. Humans or agents create the task hierarchy; HZL just tracks it.

- **Smart scheduling.** `hzl next` uses simple, deterministic rules (priority, then FIFO). There's no learning, no load balancing, no routing based on agent capabilities. If you need smarter task selection, your orchestration layer decides and claims by ID.

- **Team collaboration.** No permissions, roles, notifications, or multi-user features. HZL assumes a single developer working with their agents.

- **Cloud sync.** Local SQLite by design. If you want sync, export/import or backup to your own storage.

## Installation

Requires Node.js 20+.

```bash
npm install -g hzl-cli
```

Or from source:

```bash
git clone https://github.com/tmchow/hzl.git
cd hzl
npm install
npm run build
npm link packages/hzl-cli
```

## Claude Code Skills

If you use [Claude Code](https://claude.ai/code), you can install HZL skills directly:

```bash
# Add the HZL marketplace
/plugin marketplace add tmchow/hzl

# Install skills
/plugin install hzl@hzl-marketplace
```

This gives you access to:
- **hzo**: End-to-end orchestration for complex missions
- **hzl-orchestrator**: Break down projects and coordinate workers
- **hzl-worker**: Claim and complete tasks autonomously
- **hzl-planning**: Structure work for parallel execution
- **hzl-writing-tasks**: Write effective task descriptions
- **hzl-status-reports**: Format progress reports for humans
- **hzl-troubleshooting**: Diagnose common issues

Skills auto-invoke based on context. See `.claude/skills/` for details.

## Quick Start


```bash
# Initialize the database
hzl init

# Create tasks
hzl task create "Set up authentication" --project myapp --priority 2 --tags backend,auth
hzl task create "Write API tests" --project myapp --depends-on <task-id>

# List available work
hzl list --project myapp --available

# Claim and work
hzl task claim-next --project myapp --author agent-1
hzl checkpoint <task-id> "Completed OAuth flow"
hzl complete <task-id>
```

## Key Commands

### Task Lifecycle

```bash
hzl task create <title> --project <project>   # Create a task
hzl list [--project] [--status]               # List tasks
hzl next [--project]                          # Show next claimable task
hzl task claim-next [--project]               # Atomically claim next task
hzl complete <id>                             # Mark done
```

### For Agents

```bash
# All commands support --json for structured output
hzl list --project myapp --available --json
hzl task claim-next --project myapp --author agent-1 --json

# Checkpoints let agents recover each other's work
hzl checkpoint <id> "step-3-complete" --data '{"files":["a.ts","b.ts"]}'
hzl show <id> --json             # Get task details + history
```

### Stuck Task Recovery

```bash
hzl claim <id> --lease 30       # Claim with 30-minute lease
hzl stuck                       # Find tasks with expired leases
hzl steal <id> --if-expired     # Reclaim expired work
```

### Human Oversight

```bash
hzl projects                    # See all projects
hzl show <id>                   # Task details + history
hzl comment <id> "guidance..."  # Add steering comments
```

### Dependencies

```bash
hzl add-dep <task> <depends-on> # Task waits for dependency
hzl remove-dep <task> <dep>     # Remove dependency
hzl validate                    # Check for cycles
```

## Configuration

HZL stores configuration in `~/.hzl/config.json`. The config file is created automatically when you run `hzl init`.

To use a custom database location:

```bash
hzl init --db ~/my-project/tasks.db
```

Subsequent commands will automatically use this database.

**Config resolution order (highest to lowest priority):**
1. `--db` flag
2. `HZL_DB` environment variable
3. `~/.hzl/config.json`
4. Default: `~/.hzl/data.db`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `HZL_DB` | Override database location |
| `HZL_CONFIG` | Override config file location (default: `~/.hzl/config.json`) |
| `HZL_AUTHOR` | Default author for claims/comments |
| `HZL_AGENT_ID` | Default agent identifier |

## Related Projects

- [Beads](https://github.com/steveyegge/beads) - Steve Yegge's task management for agents
- [beads-rust](https://github.com/Dicklesworthstone/beads_rust) - Rust port of Beads

HZL takes a different approach: user-level storage, CLI-first for agents, and designed for solo developers coordinating multiple agents across projects.

## Development

```bash
npm install
npm run build
npm test
npm run lint

# Try the sample project
hzl sample-project
```

---

## CLAUDE.md / AGENTS.md Snippet

Copy this into your project's `CLAUDE.md` or `AGENTS.md`:

````markdown
## Task Management

This project uses [HZL](https://github.com/tmchow/hzl) for task tracking.

### Choosing a project name

Use a **stable identifier** you can always derive:

- **Working in a repo?** Use the repository name (e.g., `hzl`, `my-app`)
- **Long-lived agent?** Use your agent identity (e.g., `openclaw`, `kalids-openclaw`)

Projects group related work. Don't create per-feature projects—keep them long-lived. If no project is specified, tasks default to `inbox`.

### Commands

```bash
# Projects (created implicitly when you add tasks)
hzl projects                                       # List all projects
hzl rename-project <old> <new>                     # Rename a project

# Tasks
hzl task create "Task title" --project <project>   # Create task
hzl task claim-next --project <project> --json     # Claim next available
hzl show <task-id> --json                          # Task details + history
hzl checkpoint <task-id> "<name>"                  # Save progress
hzl complete <task-id>                             # Mark done
```

Use `--json` for structured output. HZL handles atomic claiming.
````

---

## License

MIT
