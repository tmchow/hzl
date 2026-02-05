# HZL (Hazel)

**External task ledger for coding agents.**

📚 **[Full Documentation](https://www.hzl-tasks.com)** — Concepts, workflows, and CLI reference

---

## Why HZL?

Most task trackers are built for humans. HZL is built for agents:

- **Backend-first** — Task database with a CLI, not another Trello
- **Model-agnostic** — Tasks live outside any vendor's memory
- **Multi-agent safe** — Atomic claiming prevents duplicate work
- **Resumable** — Checkpoints let work survive session boundaries

If you already have a favorite human todo app, keep it. HZL is for shared task state that multiple agents can read and write.

## When to Use HZL

HZL is for when work outlives a single session:

- **Cross-agent workflows** — Claude Code, Codex, Gemini sharing one task board
- **Session persistence** — Pick up where you left off tomorrow
- **Orchestration** — One agent delegates to another with clean handoffs
- **Backup** — Cloud sync keeps task state safe

If you only use one agent and never need persistence, the built-in tracker is fine. Once you need durability or coordination, reach for HZL.

---

## Quickstart

### 1. Install

Requires Node.js 22.14+.

```bash
curl -fsSL "https://raw.githubusercontent.com/tmchow/hzl/main/scripts/install.sh?$(date +%s)" | bash
```

<details>
<summary>Alternative install methods</summary>

**Homebrew (macOS/Linux):**
```bash
brew tap tmchow/hzl && brew install hzl && hzl init
```

**NPM:**
```bash
npm install -g hzl-cli && hzl init
```
</details>

### 2. Add to Your Project

Append the agent policy to your repo so agents know when to use HZL:

```bash
curl -fsSL https://raw.githubusercontent.com/tmchow/hzl/main/snippets/AGENT-POLICY.md >> AGENTS.md
```

### 3. Create Tasks and Work

```bash
# Create a project and tasks
hzl project create my-feature
hzl task add "Design the API" -P my-feature
hzl task add "Implement endpoints" -P my-feature --depends-on 1

# Claim and work
hzl task claim 1 --assignee claude-code
hzl task checkpoint 1 "API design complete"
hzl task complete 1

# View progress
hzl serve  # Opens web dashboard at localhost:3456
```

### Enable Cloud Sync (Optional)

```bash
hzl init --sync-url libsql://<db>.turso.io --auth-token <token>
```

---

## Documentation

| Section | What's There |
|---------|-------------|
| [Getting Started](https://www.hzl-tasks.com/getting-started/) | Installation, quickstart, agent setup |
| [Concepts](https://www.hzl-tasks.com/concepts/) | Projects, tasks, dependencies, checkpoints, leases |
| [Workflows](https://www.hzl-tasks.com/workflows/) | Single-agent, multi-agent, handoffs, breakdown patterns |
| [CLI Reference](https://www.hzl-tasks.com/reference/cli) | Complete command documentation |
| [Web Dashboard](https://www.hzl-tasks.com/dashboard) | Kanban board setup and usage |
| [Troubleshooting](https://www.hzl-tasks.com/troubleshooting) | Common issues and fixes |

---

## Agent Setup

### Claude Code

```bash
/plugin marketplace add tmchow/tmc-marketplace
/plugin install iterative-engineering@tmc-marketplace
```

### OpenAI Codex

```bash
mkdir -p ~/.codex/skills/hzl
curl -fsSL https://raw.githubusercontent.com/tmchow/tmc-marketplace/main/plugins/iterative-engineering/skills/hzl/SKILL.md -o ~/.codex/skills/hzl/SKILL.md
```

### OpenClaw

Copy/paste into an OpenClaw chat:

```
Install HZL from https://github.com/tmchow/hzl and run hzl init. Install the HZL skill from https://www.clawhub.ai/tmchow/hzl. Then append the HZL policy from https://raw.githubusercontent.com/tmchow/hzl/main/openclaw/OPENCLAW-TOOLS-PROMPT.md to my TOOLS.md.
```

See [Coding Agents Setup](https://www.hzl-tasks.com/getting-started/coding-agents) for full details.

---

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`hzl-cli`](https://www.npmjs.com/package/hzl-cli) | CLI for task management | `npm install -g hzl-cli` |
| [`hzl-core`](https://www.npmjs.com/package/hzl-core) | Core library for programmatic use | `npm install hzl-core` |
| [`hzl-web`](https://www.npmjs.com/package/hzl-web) | Web server and Kanban dashboard | `npm install hzl-web` |

---

## License

MIT
