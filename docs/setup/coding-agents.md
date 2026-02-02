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
<!-- END docs/snippets/coding-agent-setup.md -->

---

## Agent-Specific Notes

### Claude Code

Add the HZL snippet to your project's `CLAUDE.md` or `AGENTS.md` file. Claude Code reads these files automatically when starting a session.

```
your-project/
├── CLAUDE.md      # Add HZL instructions here
├── src/
└── ...
```

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
