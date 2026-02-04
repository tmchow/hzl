---
layout: default
title: Concepts
nav_order: 2
has_children: true
---

# Core Concepts

HZL is built around four core primitives that work together to coordinate work:

## Projects

[Projects](./projects) are stable containers for related work. Think of them as folders that group tasks together.

```bash
hzl project create auth-feature
```

## Tasks

[Tasks](./tasks) are the units of work. They have statuses, can be claimed by agents, and track progress through checkpoints.

```bash
hzl task add "Implement login" -P auth-feature
hzl task claim 1 --author claude-code
```

## Subtasks

[Subtasks](./subtasks) let you break a task into smaller pieces using the `--parent` flag. Max one level of nesting.

```bash
hzl task add "Write tests" -P auth-feature --parent 1
```

## Dependencies

[Dependencies](./dependencies) sequence work using `--depends-on`. A task with unmet dependencies is blocked.

```bash
hzl task add "Deploy" -P auth-feature --depends-on 1
```

---

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
