---
layout: default
title: Getting Started
nav_order: 2
has_children: true
---

# Getting Started

Get HZL running in minutes.

## Choose Your Path

| You're using... | Start here |
|-----------------|------------|
| **Claude Code, Codex, or Gemini** | [Coding Agents Setup](./coding-agents) |
| **OpenClaw** | [OpenClaw Setup](./openclaw) |

Both paths start with [installing HZL](./installation), then configure your specific agent.

## Quick Overview

```
┌─────────────────────────────────────────────────────────┐
│  1. Install HZL CLI (once per machine)                  │
│     └─ npm install -g hzl-cli && hzl init              │
│                                                         │
│  2. Set up your agent integration                       │
│     └─ Claude Code plugin, Codex skill, or OpenClaw    │
│                                                         │
│  3. Add agent policy to your repos                      │
│     └─ Append snippet to AGENTS.md / CLAUDE.md         │
│                                                         │
│  4. Start using HZL                                     │
│     └─ hzl project create, task add, claim, complete   │
└─────────────────────────────────────────────────────────┘
```

## New to HZL?

Start with the [Quickstart Tutorial](./quickstart) for a hands-on introduction.

## What Gets Installed Where

HZL uses a **machine-level installation** — you install it once, not per-repo:

| Component | Location | Notes |
|-----------|----------|-------|
| CLI binary | Global (npm/Homebrew) | One install serves all repos |
| Database | `~/.local/share/hzl/` | Shared across all projects |
| Agent policy | Your repo's `AGENTS.md` | The only HZL content in repos |

See [Concepts](../concepts/) for more on HZL's architecture.
