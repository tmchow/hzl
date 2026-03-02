---
layout: doc
title: Concepts
nav_order: 4
has_children: true
---

# Concepts

HZL is a durable coordination ledger for stateless agent sessions.

## Core mental model

- Agents wake as fresh sessions.
- Durable state lives in HZL, not in memory.
- Workflows encode common multi-step transitions on top of task primitives.

## Installation model

HZL is installed once per machine and stores data per user account.

| Component | Location | Scope |
|-----------|----------|-------|
| CLI binary | Global (npm/Homebrew) | Per machine |
| Database | `~/.local/share/hzl/` (default) | Per user account |
| Projects | Optional namespaces in DB | Shared pools |

## Simplicity through constraints

### One level of nesting

```
Project (optional)
└── Task
    └── Subtask (max depth 1)
```

### Agent identity is free-form

`--agent` is a string identity. HZL does not require registration.

### Dependency graph is global

Dependencies can connect tasks across projects. Use `hzl dep list` filters for visibility.

## Core primitives

- [Projects](./projects)
- [Tasks](./tasks)
- [Subtasks](./subtasks)
- [Dependencies](./dependencies)
- [Checkpoints](./checkpoints)
- [Claiming & Leases](./claiming-leases)
- [Lifecycle Hooks](./lifecycle-hooks)
- [Cloud Sync](./cloud-sync)

## What HZL does not do

- No orchestration runtime
- No automatic task decomposition
- No hidden prioritization policy beyond command semantics
