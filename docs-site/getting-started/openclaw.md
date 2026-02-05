---
layout: default
title: OpenClaw
parent: Getting Started
nav_order: 4
---

# Setup for OpenClaw

OpenClaw is a self-hosted AI assistant that can coordinate tools and sub-agents. HZL fits well as the task ledger that OpenClaw (and its sub-agents) can share.

## Quick Start (Recommended)

Copy/paste this into an OpenClaw chat:

<!-- START [code:txt] snippets/OPENCLAW-SETUP-PROMPT.md -->
<!-- ⚠️ DO NOT EDIT - Auto-generated from snippets/OPENCLAW-SETUP-PROMPT.md -->
````txt
Install HZL from https://github.com/tmchow/hzl and run hzl init. Install the HZL skill from https://www.clawhub.ai/tmchow/hzl. Then append the HZL policy from https://raw.githubusercontent.com/tmchow/hzl/main/openclaw/OPENCLAW-TOOLS-PROMPT.md to my TOOLS.md.
````
<!-- END [code:txt] snippets/OPENCLAW-SETUP-PROMPT.md -->

OpenClaw will handle the installation and configuration for you.

## Manual Setup

If you prefer to set things up yourself:

### 1. Install HZL

On the machine running OpenClaw:

```bash
npm install -g hzl-cli
hzl init
```

### 2. Install the HZL Skill

From [clawhub.ai/tmchow/hzl](https://www.clawhub.ai/tmchow/hzl)

### 3. Teach OpenClaw When to Use HZL

Tell OpenClaw:

```
HZL is a tool available to you for task management in certain cases. I want you to add this information to your TOOLS.md in the right way so you remember how to use it:
https://raw.githubusercontent.com/tmchow/hzl/main/openclaw/OPENCLAW-TOOLS-PROMPT.md
```

## Sandbox Configuration

If you're using OpenClaw's sandbox mode, the `hzl` binary must exist inside the container.

Add to your `agents.defaults.sandbox.docker.setupCommand`:

```bash
npm install -g hzl-cli
```

Or use a custom Docker image with HZL pre-installed.

## OpenClaw-Specific Patterns

### Single Project Model

OpenClaw typically uses a single HZL project called `openclaw` for all work:

```bash
hzl project create openclaw
hzl task add "Research vacation options" -P openclaw
hzl task add "Book flights" -P openclaw --parent 1
```

This avoids project sprawl while still organizing work with parent tasks and subtasks.

### Persistent Task State

HZL provides durable task state that persists outside OpenClaw's context window. This is especially valuable when:

- Chats compact and lose context
- You're running multiple OpenClaw instances
- Work spans multiple days

## Upgrading

Copy/paste this into an OpenClaw chat to create a reusable upgrade script:

<!-- START [code:txt] snippets/UPGRADE-HZL-PROMPT.md -->
<!-- ⚠️ DO NOT EDIT - Auto-generated from snippets/UPGRADE-HZL-PROMPT.md -->
````txt
Create a script at scripts/upgrade-hzl.sh (in your workspace) that upgrades both the hzl-cli npm package and the hzl skill from ClawHub. The script should:

1. Run `npm install -g hzl-cli@latest`
2. Run `npx clawhub update hzl` from the workspace directory
3. Print the installed version after each step

Make it executable. In the future when I say "upgrade hzl", run this script.
````
<!-- END [code:txt] snippets/UPGRADE-HZL-PROMPT.md -->

After running this once, just say "upgrade hzl" to OpenClaw to run the script.

## Next Steps

- [Quickstart Tutorial](./quickstart) — Hands-on introduction
- [Multi-Agent Coordination](../workflows/multi-agent) — Coordinate with sub-agents
- [CLI Reference](../reference/cli) — Full command documentation
