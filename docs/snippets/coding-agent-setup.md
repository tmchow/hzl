## Installation

```bash
npm install -g hzl
```

## Initialize

```bash
hzl init
```

This creates a local SQLite database for task storage. By default, data lives in `~/.local/share/hzl/` (XDG Base Directory spec).

## Add HZL to Your Agent's Instructions

Copy this snippet into your agent's instruction file (`CLAUDE.md`, `AGENTS.md`, or equivalent):

```markdown
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

**Key commands:**
- `hzl project create <name>` — Create a project
- `hzl task add "<title>" -P <project>` — Add a task
- `hzl task claim <id> --author <name>` — Claim a task
- `hzl task checkpoint <id> "<message>"` — Record progress
- `hzl task complete <id>` — Mark done
- `hzl task next --project <project>` — Get next available task
```

## Verify It Works

```bash
# Create a test project
hzl project create test-project

# Add a task
hzl task add "Test task" -P test-project

# List tasks
hzl task list -P test-project
```

You should see your task with status `ready`.
