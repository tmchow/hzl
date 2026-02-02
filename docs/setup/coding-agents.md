---
layout: default
title: Claude Code, Codex, Gemini
parent: Setup
nav_order: 1
---

# Setup for Coding Agents

Works with **Claude Code**, **Codex**, **Gemini**, and similar AI coding assistants that can run CLI commands.

<!-- START docs/snippets/coding-agent-setup.md -->
## Installation

```bash
# Via npm
npm install -g hzl-cli

# Via Homebrew (macOS/Linux)
brew tap tmchow/hzl
brew install hzl
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
<!-- END docs/snippets/coding-agent-setup.md -->

---

## Agent-Specific Notes

### Claude Code

**Step 1: Add the HZL snippet to your project**

Add the HZL snippet (from the "Add HZL to Your Agent's Instructions" section above) to your project's `CLAUDE.md` or `AGENTS.md` file. Claude Code reads these files automatically when starting a session.

```
your-project/
├── CLAUDE.md      # Add HZL instructions here
├── src/
└── ...
```

**Step 2: Install the HZL Skills Plugin**

Install the HZL skills plugin for richer agent guidance:

```bash
# Add the HZL marketplace
/plugin marketplace add tmchow/hzl

# Install the HZL plugin
/plugin install hzl@hzl
```

The plugin teaches Claude Code effective HZL patterns through scenario-based skills that activate automatically when working with tasks.

### Codex

Add the HZL snippet to your repository's agent instructions or system prompt. Codex will use HZL commands when appropriate based on the instructions.

### Gemini

Add the HZL snippet to your system prompt or project context. Gemini Code Assist will recognize the HZL commands and use them for multi-session task tracking.

---

## Multi-Agent Coordination

When multiple agents work on the same project, use distinct `--author` values:

```bash
# Claude Code claims a task
hzl task claim 1 --author "claude-code"

# Codex claims a different task
hzl task claim 2 --author "codex"

# Check who's working on what
hzl task list -P my-project
```

All agents share the same HZL database, so they see each other's progress in real-time.

## Next Steps

- [Multi-Agent Coordination](../scenarios/multi-agent-coordination) — Coordinate Claude Code, Codex, and Gemini
- [Session Handoffs](../scenarios/session-handoffs) — Continue work across sessions
- [CLI Reference](https://github.com/tmchow/hzl#cli-reference) — Full command documentation
