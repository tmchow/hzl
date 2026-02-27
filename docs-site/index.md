---
layout: home
title: Home
nav_order: 1
---

# HZL Documentation

HZL is an external task ledger for coding agents. It provides event-sourced task coordination for multi-session, multi-agent workflows.

{: .fs-6 .fw-300 }

[Get Started](./getting-started/){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/tmchow/hzl){: .btn .fs-5 .mb-4 .mb-md-0 }

---

## Getting Started

- [**Installation**](./getting-started/installation) - One-time setup
- [**Quickstart**](./getting-started/quickstart) - 5-minute hands-on tutorial
- [**Coding Agents**](./getting-started/coding-agents) - Claude Code, Codex, Gemini setup
- [**OpenClaw**](./getting-started/openclaw) - Setup with ClawHub

## Why HZL?

Most task trackers are built for humans. HZL is built for agents:

- **Backend-first** - Task database with a CLI, not another Trello
- **Model-agnostic** - Tasks live outside any vendor's memory
- **Multi-agent safe** - Atomic claiming prevents duplicate work
- **Resumable** - Checkpoints let work survive session boundaries

See [Concepts](./concepts/) for the full philosophy and design principles.

## Core Concepts

- [**Projects**](./concepts/projects) - Containers for related work (one per repo)
- [**Tasks**](./concepts/tasks) - Units of work with status tracking
- [**Subtasks**](./concepts/subtasks) - One level of nesting for breakdown
- [**Dependencies**](./concepts/dependencies) - Sequencing work (project-scoped)
- [**Checkpoints**](./concepts/checkpoints) - Progress snapshots for handoffs
- [**Claiming & Leases**](./concepts/claiming-leases) - Ownership and recovery

## Workflows

Real-world patterns for agent coordination:

- [**Single Agent**](./workflows/single-agent) - Basic session workflow
- [**Multi-Agent**](./workflows/multi-agent) - Parallel work coordination
- [**Session Handoffs**](./workflows/session-handoffs) - Context preservation
- [**Breaking Down Work**](./workflows/breaking-down-work) - The completability test
- [**Human Oversight**](./workflows/human-oversight) - Monitoring and steering

## Features

- [**Web Dashboard**](./dashboard) - Visual Kanban board with `hzl serve`
- [**CLI Reference**](./reference/cli) - Complete command documentation
- [**Cloud Sync**](./concepts/cloud-sync) - Multi-device access via Turso

## Quick Example

```bash
# Install
npm install -g hzl-cli

# Initialize
hzl init

# Create a project and tasks
hzl project create my-feature
hzl task add "Design the API" -P my-feature
hzl task add "Implement endpoints" -P my-feature --depends-on 1

# Claim and work
hzl task claim 1 --agent claude-code
hzl task checkpoint 1 "API design complete"
hzl task complete 1

# View progress
hzl serve  # Opens web dashboard
```
