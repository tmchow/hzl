---
layout: default
title: Scenarios
nav_order: 4
has_children: true
---

# Scenarios

Real-world workflow tutorials showing HZL in action.

## Available Scenarios

### [Multi-Agent Coordination](./multi-agent-coordination)

Multiple AI agents (Claude Code, Codex, Gemini) working on the same project without stepping on each other.

### [Session Handoffs](./session-handoffs)

Continuing work across sessions. Pick up exactly where you left off with checkpoints and task history.

### [Project Organization](./project-organization)

Structuring projects and tasks for different types of work: features, maintenance, sprints.

### [Dependency Sequencing](./dependency-sequencing)

Using `--depends-on` to enforce workflow order and manage complex task graphs.

---

## Quick Reference

| Scenario | Key Commands |
|----------|--------------|
| Multi-agent | `claim --author`, `task next` |
| Handoffs | `checkpoint`, `task show` |
| Organization | `project create`, subtasks |
| Sequencing | `--depends-on`, `--available` |
