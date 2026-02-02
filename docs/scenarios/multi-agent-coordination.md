---
layout: default
title: Multi-Agent Coordination
parent: Scenarios
nav_order: 1
---

# Multi-Agent Coordination

Multiple AI agents working on the same project without conflicts.

## The Problem

When multiple agents (Claude Code, Codex, Gemini, human developers) work on the same codebase, you risk:

- Two agents claiming the same task
- Lost context between agents
- No visibility into who's doing what

## The Solution

HZL's atomic claiming and author tracking prevent conflicts.

## Setup

```bash
# Create project with tasks
hzl project create api-v2
hzl task add "Implement auth endpoints" -P api-v2
hzl task add "Build user CRUD" -P api-v2
hzl task add "Add rate limiting" -P api-v2
```

## Agent Workflow

Each agent follows the same pattern:

```bash
# 1. Get next available task
hzl task next -P api-v2

# 2. Claim it with your identifier
hzl task claim <id> --author claude-code

# 3. Work on the task
# ... do the work ...

# 4. Record progress
hzl task checkpoint <id> "Completed auth middleware"

# 5. Complete when done
hzl task complete <id>
```

## Atomic Claiming

When two agents call `hzl task next` simultaneously:

```bash
# Agent 1                    # Agent 2
hzl task next -P api-v2     hzl task next -P api-v2
# Returns task 1             # Returns task 1

hzl task claim 1 --author claude-code
# Success!                   hzl task claim 1 --author codex
                            # Error: Already claimed
```

HZL uses database transactions to ensure only one agent wins.

## Author Identifiers

Use consistent author names:

| Agent | Author Flag |
|-------|-------------|
| Claude Code | `--author claude-code` |
| OpenAI Codex | `--author codex` |
| Google Gemini | `--author gemini` |
| Human developer | `--author human` or your name |

## Monitoring Progress

Check what everyone is working on:

```bash
# See all tasks with authors
hzl task list -P api-v2

# View specific task details
hzl task show 1
```

Or use the dashboard:

```bash
hzl serve
```

## Example: Three Agents

```bash
# Initial setup
hzl project create backend
hzl task add "Auth system" -P backend
hzl task add "User profiles" -P backend
hzl task add "Notifications" -P backend

# Claude Code session
hzl task next -P backend          # Gets task 1
hzl task claim 1 --author claude-code
# ... works on auth ...
hzl task complete 1

# Codex session (parallel)
hzl task next -P backend          # Gets task 2 (1 is claimed)
hzl task claim 2 --author codex
# ... works on profiles ...
hzl task complete 2

# Gemini session (parallel)
hzl task next -P backend          # Gets task 3
hzl task claim 3 --author gemini
# ... works on notifications ...
hzl task complete 3
```

## Best Practices

1. **Always use `--author`** - Track who did what
2. **Use `task next`** - Don't hardcode task IDs
3. **Checkpoint frequently** - Other agents can see progress
4. **Complete promptly** - Don't leave tasks claimed but idle
