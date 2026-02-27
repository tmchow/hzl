---
layout: doc
title: Multi-Agent Coordination
parent: Workflows
nav_order: 2
---

# Multi-Agent Coordination

Coordinate multiple agents through shared projects and atomic claiming.

## Preferred routing pattern: project pools

Create tasks in the target project and omit `--agent` unless assignment must be explicit.

```bash
hzl project create writing
hzl task add "Draft product announcement" -P writing -s ready
```

Any writing agent can claim from the pool:

```bash
hzl task claim --next -P writing --agent writer-1
hzl task claim --next -P writing --agent writer-2
```

`claim --next` is atomic, so both agents get different tasks.

## Explicit assignment when needed

Use `--agent` only when one specific identity should own context-heavy work.

```bash
hzl task add "Revise legal disclaimer" -P writing -s ready --agent writer-1
```

## Workflow-first session loop

```bash
# Each wake
hzl workflow run start --agent writer-1 --project writing

# On completion/handoff
hzl workflow run handoff --from <task-id> --title "Schedule post" --project marketing
```

## Leases and recovery

```bash
hzl task claim --next -P writing --agent writer-1 --lease 60
hzl task stuck
hzl task steal <task-id> --if-expired --agent writer-2
```

## Operational notes

1. Keep agent identity strings stable.
2. Prefer pool routing for scalable role teams.
3. Use explicit assignment sparingly.
4. Schedule `hzl hook drain` in host runtime for reliable done notifications.
