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

### Codex

```bash
mkdir -p ~/.codex/skills/hzl
curl -fsSL https://raw.githubusercontent.com/tmchow/hzl/main/skills/hzl/SKILL.md -o ~/.codex/skills/hzl/SKILL.md
```

Or tell Codex:
> Fetch and follow instructions from https://raw.githubusercontent.com/tmchow/hzl/main/.codex/INSTALL.md

### Gemini

Add the agent policy snippet (below) to your system prompt or project context.

## Step 3: Add Agent Policy to Your Repos

Copy this snippet into your repo's `AGENTS.md`, `CLAUDE.md`, or equivalent:

```markdown
### HZL task ledger (external task tracking)

HZL is an external task database. Use it when work outlives this session or involves other agents.

**When to use HZL:**
- Work spanning multiple sessions or days
- Coordination with other agents (Claude Code ↔ Codex ↔ Gemini)
- Delegating to sub-agents with explicit handoff
- Task is non-trivial (~30+ min or risky changes)

**When NOT to use HZL:**
- Single-session work you'll complete now
- Quick one-off answer or tiny change

**Key commands:**
- `hzl project create <name>` — Create a project
- `hzl task add "<title>" -P <project>` — Add a task
- `hzl task claim <id> --assignee <name>` — Claim a task
- `hzl task checkpoint <id> "<message>"` — Record progress
- `hzl task complete <id>` — Mark done
- `hzl task next --project <project>` — Get next available task
```

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
