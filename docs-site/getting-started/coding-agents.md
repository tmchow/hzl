---
layout: default
title: Coding Agents
parent: Getting Started
nav_order: 3
---

# Setup for Coding Agents

Works with **Claude Code**, **Codex**, **Gemini**, and similar AI coding assistants that can run CLI commands.

## Step 1: Install HZL

If you haven't already, install HZL:

```bash
curl -fsSL "https://raw.githubusercontent.com/tmchow/hzl/main/scripts/install.sh?$(date +%s)" | bash
```

See [Installation](./installation) for alternative methods.

## Step 2: Install Agent Skills (Optional)

Skills teach your agent effective HZL patterns.

### Claude Code

```bash
/plugin marketplace add tmchow/tmc-marketplace
/plugin install iterative-engineering@tmc-marketplace
```

<details>
<summary>Migrating from older versions?</summary>

If you previously installed `hzl@hzl` or `hzl@hzl-marketplace`, uninstall it first:

```bash
/plugin uninstall hzl@hzl
/plugin marketplace remove hzl
```

Then install the new version using the commands above.
</details>

### Codex

```bash
mkdir -p ~/.codex/skills/hzl
curl -fsSL https://raw.githubusercontent.com/tmchow/tmc-marketplace/main/plugins/iterative-engineering/skills/hzl/SKILL.md -o ~/.codex/skills/hzl/SKILL.md
```

Or tell Codex:
> Fetch and follow instructions from https://raw.githubusercontent.com/tmchow/hzl/main/.codex/INSTALL.md

### Gemini

Add the agent policy snippet (below) to your system prompt or project context.

## Step 3: Add Agent Policy to Your Repos

Copy this snippet into your repo's `AGENTS.md`, `CLAUDE.md`, or equivalent:

<!-- START [code:md] snippets/AGENT-POLICY.md -->
<!-- ⚠️ DO NOT EDIT - Auto-generated from snippets/AGENT-POLICY.md -->
````md
### HZL task ledger

This project uses HZL for task tracking.

**IMPORTANT - Task tracking:** When starting work that is multi-step, may span sessions, or needs coordination, run `hzl guide` to learn how this project tracks tasks.

**When delegating to sub-agents:** Include "use HZL for task tracking" in the sub-agent's instructions.

**Use HZL when:**
- Work has multiple steps or may not finish this session
- Durable record of progress or ownership needed
- Handoff or review expected
- Task is non-trivial (~30+ min or risky changes)

**Skip HZL when:**
- Small, clearly scoped work completed immediately
- Quick one-off answer or tiny change

**Rule of thumb:** If you're tempted to make a multi-step plan, use HZL.
````
<!-- END [code:md] snippets/AGENT-POLICY.md -->

Or append it with:

```bash
curl -fsSL https://raw.githubusercontent.com/tmchow/hzl/main/snippets/AGENT-POLICY.md >> AGENTS.md
```

## Step 4: Verify It Works

```bash
# Create a test project
hzl project create test-project

# Add a task
hzl task add "Test task" -P test-project

# List tasks
hzl task list -P test-project
```

You should see your task with status `ready`.

---

## Agent-Specific Notes

### Claude Code

Claude Code reads `CLAUDE.md` and `AGENTS.md` automatically when starting a session:

```
your-project/
├── CLAUDE.md      # or AGENTS.md - add HZL policy here
├── src/
└── ...
```

The HZL plugin provides scenario-based skills that activate automatically when working with tasks.

### Codex

Add the HZL snippet to your repository's agent instructions or system prompt. Codex will use HZL commands when appropriate based on the instructions.

### Gemini

Add the HZL snippet to your system prompt or project context. Gemini Code Assist will recognize the HZL commands and use them for multi-session task tracking.

---

## Multi-Agent Coordination

When multiple agents work on the same project, use distinct `--assignee` values:

```bash
# Claude Code claims a task
hzl task claim 1 --assignee "claude-code"

# Codex claims a different task
hzl task claim 2 --assignee "codex"

# Check who's working on what
hzl task list -P my-project
```

All agents share the same HZL database, so they see each other's progress in real-time.

## Next Steps

- [Quickstart Tutorial](./quickstart) — Hands-on introduction
- [Multi-Agent Coordination](../workflows/multi-agent) — Coordinate multiple agents
- [Session Handoffs](../workflows/session-handoffs) — Continue work across sessions
- [CLI Reference](../reference/cli) — Full command documentation
