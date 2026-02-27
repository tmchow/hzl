---
layout: default
title: Concepts
nav_order: 3
has_children: true
---

# Concepts

Understanding HZL's design and core primitives.

## Why HZL?

Most task trackers are built for humans. HZL is built for agents:

- **Backend-first** - Task database with a CLI, not another Trello
- **Model-agnostic** - Tasks live outside any vendor's memory
- **Multi-agent safe** - Atomic claiming prevents duplicate work
- **Resumable** - Checkpoints let work survive session boundaries

If you already have a favorite human todo app, keep it. HZL is for shared task state that multiple agents can read and write.

## Installation Model

HZL uses a **machine-level installation** with a **user-level database**:

| Component | Location | Scope |
|-----------|----------|-------|
| CLI binary | Global (npm/Homebrew) | Per machine |
| Database | `~/.local/share/hzl/` | Per user account |
| Projects | Logical containers in database | Cross-repo |

**You install HZL once.** It's not cloned into each repo, not installed per-project. One global CLI serves all your work.

**The database is shared.** All projects across all your repos write to the same `~/.local/share/hzl/events.db`. This enables cross-repo coordination.

### Common Misconceptions

| Misconception | Reality |
|--------------|---------|
| "I need to clone the HZL repo" | No—install the CLI (`npm install -g hzl-cli`) |
| "Each repo gets its own HZL" | No—one installation covers all repos |
| "Projects map to filesystem paths" | No—projects are logical groupings you define |
| "I need `hzl init` in each repo" | No—run once per machine |

### What Goes in Repos?

Only the **agent policy snippet** in `AGENTS.md` or `CLAUDE.md`. This teaches agents when to use HZL—it doesn't install anything.

## Simplicity through Constraints

HZL enforces intentional limits that keep task management tractable:

### One Level of Nesting

```
Project
└── Task (can be a parent)
    └── Subtask (max depth)
```

Subtasks cannot have their own subtasks. This prevents deeply nested hierarchies.

### Dependencies Within Projects Only

Dependencies (`--depends-on`) only work between tasks in the same project. No cross-project dependencies.

**Why?** Cross-project dependencies create complexity:

| Level | Problem |
|-------|---------|
| Technical | Tracking relationships across task graphs |
| Mental | Hard to reason about external blockers |
| Practical | "When can I start?" becomes a distributed query |

### Project-to-Repo Mapping

**Typical pattern:** One repository = one HZL project.

| Repo Structure | HZL Mapping |
|---------------|-------------|
| Single repo | One project |
| Monorepo | One project (intra-repo deps work) |
| Split repos with shared features | One project per initiative |

## Core Primitives

### [Projects](./projects)

Stable containers for related work. Think of them as folders that group tasks together.

```bash
hzl project create auth-feature
```

### [Tasks](./tasks)

Units of work with statuses, ownership, and progress tracking.

```bash
hzl task add "Implement login" -P auth-feature
hzl task claim 1 --agent claude-code
```

### [Subtasks](./subtasks)

Break a task into smaller pieces. Max one level of nesting.

```bash
hzl task add "Write tests" --parent 1
```

### [Dependencies](./dependencies)

Sequence work. A task with unmet dependencies is blocked.

```bash
hzl task add "Deploy" -P auth-feature --depends-on 1
```

### [Checkpoints](./checkpoints)

Progress snapshots that preserve context across sessions.

```bash
hzl task checkpoint 1 "Schema designed, moving to implementation"
```

### [Claiming & Leases](./claiming-leases)

Ownership and time-limited claims for coordination.

```bash
hzl task claim 1 --agent claude-code --lease 30
```

### [Cloud Sync](./cloud-sync)

Optional backup and multi-device access via Turso.

```bash
hzl init --sync-url libsql://<db>.turso.io
```

## How They Work Together

```
Project: auth-feature
├── Task 1: Design API schema
│   └── Subtask 1a: Define user table
│   └── Subtask 1b: Define session table
├── Task 2: Implement endpoints (depends on Task 1)
└── Task 3: Write tests (depends on Task 2)
```

- **Projects** group related tasks
- **Tasks** are claimed and worked on
- **Subtasks** break down complex tasks
- **Dependencies** enforce ordering
- **Checkpoints** preserve progress
- **Leases** enable stuck detection

## What HZL Does Not Do

HZL is deliberately limited:

- **No orchestration** - Doesn't spawn agents or assign work
- **No task decomposition** - Doesn't break down tasks automatically
- **No smart scheduling** - Uses simple priority + FIFO ordering
- **No reminders** - Pair with a scheduler for time-based triggers

These are features for your orchestration layer, not the task tracker.
