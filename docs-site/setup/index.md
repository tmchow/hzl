---
layout: default
title: Setup
nav_order: 2
has_children: true
---

# Setup

Get HZL running with your AI coding assistant.

## Choose Your Agent System

| Agent System | Guide |
|--------------|-------|
| **Claude Code** | [Setup Guide](./coding-agents) |
| **Codex** | [Setup Guide](./coding-agents) |
| **Gemini** | [Setup Guide](./coding-agents) |
| **OpenClaw** | [Setup Guide](./openclaw) |

Claude Code, Codex, and Gemini share the same setup process — they're all coding agents that run CLI commands directly.

OpenClaw has a different setup involving the ClawHub skill system.

## Quick Start (All Agents)

```bash
npm install -g hzl
hzl init
```

Then add HZL instructions to your agent's context. See the specific guide for details.
