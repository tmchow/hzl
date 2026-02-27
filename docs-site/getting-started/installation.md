---
layout: default
title: Installation
parent: Getting Started
nav_order: 1
---

# Installation

HZL is installed once per machine, not per repository.

<!-- START snippets/CODING-AGENT-SETUP.md -->
<!-- ⚠️ DO NOT EDIT - Auto-generated from snippets/CODING-AGENT-SETUP.md -->
## Installation

### One-liner (recommended)

Installs HZL CLI, initializes the database, and sets up Claude Code/Codex integrations (if detected):

```bash
curl -fsSL "https://raw.githubusercontent.com/tmchow/hzl/main/scripts/install.sh?$(date +%s)" | bash
```

### Manual install

```bash
# Via npm
npm install -g hzl-cli
hzl init

# Via Homebrew (macOS/Linux)
brew tap tmchow/hzl
brew install hzl
hzl init
```

This creates a local SQLite database for task storage. By default, data lives in `~/.local/share/hzl/` (XDG Base Directory spec).

**Then set up agent integrations:**

*Claude Code (run in Claude Code):*
```
/plugin marketplace add tmchow/hzl
/plugin install hzl@hzl
```

*Codex:*
```bash
mkdir -p ~/.codex/skills/hzl
curl -fsSL https://raw.githubusercontent.com/tmchow/hzl/main/skills/hzl/SKILL.md -o ~/.codex/skills/hzl/SKILL.md
```

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
- `hzl task claim <id> --agent <name>` — Claim a task
- `hzl task checkpoint <id> "<message>"` — Record progress
- `hzl task complete <id>` — Mark done
- `hzl task claim --next --project <project>` — Get next available task
```

## Agent-Specific Skill Installation (Optional)

HZL provides pre-built skills for coding agents that include detailed usage patterns and scenarios.

### Claude Code skill (optional)

HZL includes a Claude Code skill that helps agents work effectively with HZL.

```bash
/plugin marketplace add tmchow/hzl
/plugin install hzl@hzl
```

<details>
<summary>Migrating from older versions?</summary>

If you previously installed `hzl@hzl-marketplace`, uninstall it first:

```bash
/plugin uninstall hzl@hzl-marketplace
/plugin marketplace remove hzl-marketplace
```

Then install the new version using the commands above.
</details>

### OpenAI Codex skill (optional)

HZL also supports [OpenAI Codex CLI](https://github.com/openai/codex). The skill uses the same `SKILL.md` format.

**Option A: Quick install (prompt injection)**

Tell Codex:
> Fetch and follow instructions from https://raw.githubusercontent.com/tmchow/hzl/main/.codex/INSTALL.md

Codex will download the skill and ask whether to add HZL guidance user-wide or project-specific.

**Security note:** This uses prompt injection—Codex will modify files on your system. Review [`.codex/INSTALL.md`](https://github.com/tmchow/hzl/blob/main/.codex/INSTALL.md) to see exactly what steps Codex will follow, or use Option B for manual control.

**Option B: Manual install**

Follow the steps in [`.codex/INSTALL.md`](https://github.com/tmchow/hzl/blob/main/.codex/INSTALL.md) yourself.

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
<!-- END snippets/CODING-AGENT-SETUP.md -->

---

## What Just Happened?

After installation:

1. **CLI installed globally** — Run `hzl` from anywhere
2. **Database initialized** — Located at `~/.local/share/hzl/`
3. **Agent integrations set up** — If Claude Code or Codex were detected

## Next Steps

- [Quickstart Tutorial](./quickstart) — Hands-on introduction
- [Coding Agents Setup](./coding-agents) — Claude Code, Codex, Gemini specifics
- [OpenClaw Setup](./openclaw) — OpenClaw-specific configuration
