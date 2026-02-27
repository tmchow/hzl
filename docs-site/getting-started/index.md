---
layout: doc
title: Getting Started
nav_order: 2
has_children: true
---

# Getting Started

If you are using OpenClaw, treat setup as one end-to-end flow: install HZL, wire it into your runtime loop, then verify.

## Recommended path (OpenClaw)

- [Installation & OpenClaw Setup](./installation)

## Then learn the operating model

- [Quickstart](./quickstart)
- [Workflows](../workflows/)
- [Tasks](../concepts/tasks)
- [Claiming & Leases](../concepts/claiming-leases)

## Looking for non-primary integrations?

See [Experimental integrations](../experimental-integrations).

## First stateless loop

Run this once setup is complete:

```bash
hzl task add "Setup verification" -P openclaw -s ready
hzl workflow run start --agent main --project openclaw
hzl task complete <task-id>
hzl hook drain
```
