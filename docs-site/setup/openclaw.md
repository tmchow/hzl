---
layout: default
title: OpenClaw
parent: Setup
nav_order: 2
---

# Setup for OpenClaw

OpenClaw is a self-hosted AI assistant that can coordinate tools and sub-agents. HZL fits well as the task ledger that OpenClaw (and its sub-agents) can share.

## Quick Start (Recommended)

Copy/paste this into an OpenClaw chat:

<!-- START [code:txt] docs/snippets/openclaw-setup-prompt.md -->
<!-- ⚠️ DO NOT EDIT - Auto-generated from docs/snippets/openclaw-setup-prompt.md -->
````txt
Install HZL from https://github.com/tmchow/hzl and run hzl init. Install the HZL skill from https://www.clawhub.ai/tmchow/hzl. Then append the HZL policy from https://raw.githubusercontent.com/tmchow/hzl/main/docs/openclaw/tools-prompt.md to my TOOLS.md.
````
<!-- END [code:txt] docs/snippets/openclaw-setup-prompt.md -->

OpenClaw will handle the installation and configuration for you.

## Manual Setup

If you prefer to set things up yourself:

1. **Install HZL** on the machine running OpenClaw:
   ```bash
   npm install -g hzl
   hzl init
   ```

2. **Install the HZL skill** from [clawhub.ai/tmchow/hzl](https://www.clawhub.ai/tmchow/hzl)

3. **Teach OpenClaw when to use HZL** — tell OpenClaw:
   ```
   HZL is a tool available to you for task management in certain cases. I want you to add this information to your TOOLS.md in the right way so you remember how to use it:
   https://raw.githubusercontent.com/tmchow/hzl/main/docs/openclaw/tools-prompt.md
   ```

## Sandbox Configuration

If you're using OpenClaw's sandbox mode, the `hzl` binary must exist inside the container.

Add to your `agents.defaults.sandbox.docker.setupCommand`:

```bash
npm install -g hzl
```

Or use a custom Docker image with HZL pre-installed.

## Upgrading

Copy/paste this into an OpenClaw chat to create a reusable upgrade script:

<!-- START [code:txt] docs/snippets/upgrade-hzl-prompt.md -->
<!-- ⚠️ DO NOT EDIT - Auto-generated from docs/snippets/upgrade-hzl-prompt.md -->
````txt
Create a script at scripts/upgrade-hzl.sh (in your workspace) that upgrades both the hzl-cli npm package and the hzl skill from ClawHub. The script should:

1. Run `npm install -g hzl-cli@latest`
2. Run `npx clawhub update hzl` from the workspace directory
3. Print the installed version after each step

Make it executable. In the future when I say "upgrade hzl", run this script.
````
<!-- END [code:txt] docs/snippets/upgrade-hzl-prompt.md -->

After running this once, just say "upgrade hzl" to OpenClaw to run the script.

## Next Steps

- [OpenClaw Skill Reference](../openclaw/skills/hzl/SKILL) — Full skill documentation
- [Multi-Agent Coordination](../scenarios/multi-agent-coordination) — Coordinate multiple agents
