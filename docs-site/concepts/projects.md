---
layout: doc
title: Projects
parent: Concepts
nav_order: 1
---

# Projects

Projects are optional namespaces for grouping tasks into shared work domains.

## What a Project Is

A project is a scope boundary, not a required container.

- Use projects when you want separate queues.
- Skip projects when one global queue is enough.
- Tasks without explicit project go to `inbox`.

## Why Projects Help

Projects are most useful when multiple agents can work in the same area and tasks are not pre-assigned.

Examples:
- Two research agents pulling from `research`
- Two writing agents pulling from `writing`
- Several coding agents pulling from `checkout` or `platform`

This keeps candidate work scoped while preserving agent autonomy for which task to claim.

## Typical Mapping Patterns

| Pattern | Example |
|--------|---------|
| Product area | `checkout`, `auth`, `mobile` |
| Repo-aligned (optional) | `api-service` |
| Cross-repo initiative | `q2-reliability` |
| Non-coding domain | `research`, `writing`, `ops` |

## When to Create a Project

Create one when you need:
- Shared backlog boundaries
- Scoped prioritization/filtering
- Cleaner coordination among multiple agents in one domain

Avoid creating one when:
- Work is one-off or ad hoc
- `inbox` is sufficient
- You are creating a new project for every tiny task

## Creating and Listing Projects

```bash
hzl project create research
hzl project list
```

## Working With Project-Scoped Queues

```bash
# Add tasks into one domain
hzl task add "Draft benchmark summary" -P research
hzl task add "Compare model latency data" -P research --priority 2

# Agents pull from that shared scope
hzl task list -P research --available
hzl task claim --next -P research --agent research-agent-1
```

## Best Practices

1. Keep projects long-lived and domain-oriented.
2. Use project scopes for shared multi-agent pools.
3. Use parent tasks and subtasks for feature breakdown, not new projects.
4. Prefer clear names (`research`, `checkout`) over temporary labels.
5. Use `inbox` when scoping adds no value.
