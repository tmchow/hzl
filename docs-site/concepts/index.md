---
layout: doc
title: Concepts
nav_order: 3
has_children: true
---

# Concepts

Understanding HZL's core model for multi-agent task coordination.

## Core Mental Model

HZL is a machine-level task ledger with three actor types:

- **Agents**: create, claim, update, and complete tasks
- **Humans**: observe, steer, and audit
- **Orchestrators**: optional runtime layer that coordinates agents and reads/writes HZL

HZL owns durable task state and coordination integrity. It does not own orchestration policy.

## Installation Model

HZL is installed once per machine and stores data per user account.

| Component | Location | Scope |
|-----------|----------|-------|
| CLI binary | Global (npm/Homebrew) | Per machine |
| Database | `~/.local/share/hzl/` | Per user account |
| Projects | Optional namespaces in database | Cross-domain |

You can run HZL for coding, writing, research, or mixed workflows from the same installation.

## Simplicity Through Constraints

HZL enforces intentional limits that keep task coordination tractable.

### One Level of Nesting

```
Project (optional scope)
└── Task (can be a parent)
    └── Subtask (max depth)
```

Subtasks cannot have their own subtasks.

### Dependencies Within Projects Only

Dependencies (`--depends-on`) only work between tasks in the same project scope. No cross-project dependencies.

### Agent Identity Is Honor-Based

`--agent` is a free-form identity string. HZL does not require registration.

## Projects Are Optional

Projects are optional namespaces for shared queues.

Use a project when you need:
- Domain boundaries (`research`, `writing`, `backend`)
- Shared backlog for multiple agents in one area
- Scoped filtering and prioritization

Skip projects when you need:
- Lightweight ad hoc work
- A single global queue (`inbox`)

## Core Primitives

### [Projects](./projects)

Optional scopes for grouping related work.

### [Tasks](./tasks)

Units of work with status, ownership, and progress.

### [Subtasks](./subtasks)

One-level breakdown of larger tasks.

### [Dependencies](./dependencies)

Ordering constraints inside a project.

### [Checkpoints](./checkpoints)

Durable progress snapshots for handoffs and resumes.

### [Claiming & Leases](./claiming-leases)

Atomic ownership and stuck-task recovery.

### [Cloud Sync](./cloud-sync)

Optional replication for multi-machine setups.

## What HZL Does Not Do

- No orchestration of agents
- No automatic decomposition/planning
- No policy enforcement for prioritization
- No hidden scheduling logic beyond eligibility and ordering
