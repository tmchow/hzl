---
layout: default
title: Workflows
nav_order: 4
has_children: true
---

# Workflows

Common patterns for using HZL effectively.

## Which Workflow?

```
                    ┌─────────────────────────┐
                    │  Starting new work?     │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │  Multiple agents?       │
                    └───────────┬─────────────┘
                           yes/ \no
                             /   \
    ┌────────────────────────┐   ┌────────────────────────┐
    │  Multi-Agent           │   │  Single agent,         │
    │  Coordination          │   │  multiple sessions?    │
    └────────────────────────┘   └───────────┬────────────┘
                                        yes/ \no
                                          /   \
              ┌────────────────────────────┐   ┌────────────────────────┐
              │  Session Handoffs          │   │  Single Agent Workflow │
              └────────────────────────────┘   └────────────────────────┘
```

## Workflow Guide

| Scenario | Workflow |
|----------|----------|
| One agent, work spans sessions | [Single Agent](./single-agent) |
| Multiple agents on same project | [Multi-Agent Coordination](./multi-agent) |
| Passing work between sessions | [Session Handoffs](./session-handoffs) |
| Large feature with subtasks | [Breaking Down Work](./breaking-down-work) |
| Stuck waiting on external factors | [Blocking & Unblocking](./blocking-unblocking) |
| Humans monitoring/steering agents | [Human Oversight](./human-oversight) |
| Organizing multiple projects | [Project Organization](./project-organization) |

## Quick Reference

```bash
# Start work
hzl task claim --next -P myproject --agent my-agent

# Record progress
hzl task checkpoint <id> "milestone achieved"

# Mark blocked
hzl task block <id> --comment "waiting on X"

# Complete
hzl task complete <id>
```
