---
layout: doc
title: Getting Started
nav_order: 2
has_children: true
---

# Getting Started

HZL is installed once per machine and shared by one or many agents.

Setup has two parts:

1. Install and initialize HZL.
2. Integrate your runtime loop (OpenClaw, custom scheduler, or both).

## Step 1

- [Installation](./installation)

## Step 2

- [OpenClaw Setup](./openclaw)

## First Stateless Loop

Run this once setup is complete:

```bash
hzl task add "Setup verification" -P openclaw -s ready
hzl workflow run start --agent main --project openclaw
hzl task complete <task-id>
hzl hook drain
```

## Learn the model

- [Quickstart](./quickstart)
- [Workflows](../workflows/)
- [Tasks](../concepts/tasks)
- [Claiming & Leases](../concepts/claiming-leases)

## Looking for non-primary integrations?

See [Experimental integrations](../experimental-integrations).
