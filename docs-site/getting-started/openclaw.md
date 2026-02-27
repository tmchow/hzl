---
layout: doc
title: OpenClaw
parent: Getting Started
nav_order: 4
---

# OpenClaw Setup

OpenClaw integration guidance is currently **TBD**.

We are finalizing the recommended contract for:

- `TOOLS.md` instructions
- polling cadence and anti-herd behavior
- default task pull/claim loop

## What you can do now

Use HZL directly from CLI while integration guidance is finalized.

```bash
# Install
npm install -g hzl-cli
hzl init

# Minimal loop
hzl project create openclaw
hzl task add "Seed initial backlog" -P openclaw --priority 2
hzl task claim --next --agent planner-1
hzl task checkpoint 1 "Backlog seeded and prioritized"
hzl task complete 1
```

## Next Steps

- [Quickstart](./quickstart)
- [Multi-Agent Coordination](../workflows/multi-agent)
- [CLI Reference](../reference/cli)
