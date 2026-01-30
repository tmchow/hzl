# HZL

**Lightweight task coordination for AI agent swarms.**

HZL is a CLI-first task management system designed for solo developers working with multiple AI agents across multiple projects. It provides durable, local coordination without the overhead of team-oriented project management tools.

## Why HZL?

Most project management tools assume teams of humans collaborating on shared repositories. When you're a solo developer with AI agents as your primary collaborators, these tools become heavyweight:

- **Repository-level storage is limiting.** You work across many repos and non-code projects. HZL stores tasks at the user level (`~/.hzl/data.db`), giving you one source of truth for all your work.

- **Agents need machine-readable interfaces.** HZL's CLI is optimized for programmatic use with `--json` output, atomic operations, and deterministic selection policies that agents can rely on.

- **Concurrent agents need coordination.** Multiple agents working in parallel can atomically claim tasks, preventing conflicts. No heartbeats required—checkpoints let agents recover each other's work.

- **Active work, not archival.** HZL is designed for coordinating current projects, not storing years of task history. Track recent work, see progress stats, then let completed tasks fade.

## Design Principles

1. **The ledger is dumb.** HZL tracks state—it doesn't orchestrate, prioritize, or decide what agents should do. Intelligence lives in your agents and workflows.

2. **Events are truth.** Every change is an append-only event. Current state is a projection. Full audit trails, reconstructable history.

3. **Local-first.** SQLite with WAL mode. No network dependency. Works offline.

4. **Hierarchical but simple.** Projects contain tasks. Tasks can have subtasks and dependencies. That's it.

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

## Quick Start

```bash
# Initialize the database
hzl init

# Create tasks
hzl add inbox "Set up authentication" --priority 2 --tags backend,auth
hzl add inbox "Write API tests" --depends <task-id>

# List available work
hzl list --project inbox --available

# Claim and work
hzl claim-next inbox --author agent-1
hzl checkpoint <task-id> "Completed OAuth flow"
hzl complete <task-id>
```

## Key Commands

### Task Lifecycle

```bash
hzl add <project> <title>       # Create a task
hzl list [--project] [--status] # List tasks
hzl next [--project]            # Show next claimable task
hzl claim-next [--project]      # Atomically claim next task
hzl complete <id>               # Mark done
```

### For Agents

```bash
# All commands support --json for structured output
hzl list --project myapp --available --json
hzl claim-next myapp --author agent-1 --json

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

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `HZL_DB` | Override database location (default: `~/.hzl/data.db`) |
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

This project uses [HZL](https://github.com/tmchow/hzl) for task coordination.

```bash
hzl list --project <project-name> --available --json   # Available tasks
hzl claim-next <project-name> --author <agent-id> --json  # Claim next
hzl show <task-id> --json                              # Task details
hzl checkpoint <task-id> "<name>"                      # Save progress
hzl complete <task-id>                                 # Mark done
hzl comment <task-id> "text"                           # Add notes
```

Use `--json` for structured output. HZL handles atomic claiming automatically.
````

---

## License

MIT
