---
layout: home
title: Home
nav_order: 1
---

# HZL Documentation

HZL is an external task ledger for coding agents. It provides event-sourced task coordination for multi-session, multi-agent workflows.

{: .fs-6 .fw-300 }

[Get Started](https://github.com/tmchow/hzl#quick-start){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/tmchow/hzl){: .btn .fs-5 .mb-4 .mb-md-0 }

---

## Why HZL?

When AI agents work on complex tasks, they need a way to coordinate:

- **Track work across sessions** - Pick up where you left off
- **Coordinate multiple agents** - Claude Code, Codex, Gemini working together
- **Never lose context** - Event-sourced history preserves everything

## Core Concepts

- [**Projects**](./concepts/projects) - Containers for related work
- [**Tasks**](./concepts/tasks) - Units of work with status tracking
- [**Subtasks**](./concepts/subtasks) - Breaking tasks into smaller pieces
- [**Dependencies**](./concepts/dependencies) - Sequencing work with `--depends-on`

## Features

- [**Web Dashboard**](./dashboard) - Visual Kanban board with `hzl serve`
- [**CLI Reference**](https://github.com/tmchow/hzl#cli-reference) - Complete command documentation

## Scenarios

Real-world workflow tutorials:

- [Multi-Agent Coordination](./scenarios/multi-agent-coordination) - Multiple AI agents on one project
- [Session Handoffs](./scenarios/session-handoffs) - Continuing work across sessions
- [Project Organization](./scenarios/project-organization) - Structuring your work
- [Dependency Sequencing](./scenarios/dependency-sequencing) - Ordering tasks correctly

## Quick Example

```bash
# Install
npm install -g hzl

# Initialize
hzl init

# Create a project and tasks
hzl project create my-feature
hzl task add "Design the API" -P my-feature
hzl task add "Implement endpoints" -P my-feature --depends-on 1

# Claim and work
hzl task claim 1 --author claude-code
hzl task checkpoint 1 "API design complete"
hzl task complete 1

# View progress
hzl serve  # Opens web dashboard
```
