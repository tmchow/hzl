---
layout: doc
title: Quickstart
parent: Getting Started
nav_order: 2
---

# Quickstart Tutorial

A short hands-on introduction to HZL.

## Prerequisites

- HZL installed (`hzl --version`)
- HZL initialized (`hzl init`)

## Mode A: Global Queue (`inbox`)

Use this when you do not need project scoping.

```bash
# Add unscoped work (defaults to inbox)
hzl task add "Triage new bugs"
hzl task add "Write daily status summary" --priority 1

# See claimable work
hzl task list --available

# Claim next eligible task
hzl task claim --next --agent agent-1

# Record progress and finish
hzl task checkpoint <task-id> "Triage pass complete; 3 bugs prioritized"
hzl task complete <task-id>
```

## Mode B: Project-Scoped Queue (Optional)

Use this when multiple agents share work in one domain.

```bash
# Create optional scope
hzl project create research

# Add scoped tasks
hzl task add "Compare retrieval strategies" -P research
hzl task add "Summarize RAG benchmark paper" -P research --priority 2

# Pull from that scope
hzl task list -P research --available
hzl task claim --next -P research --agent research-agent-1

# Work and complete
hzl task checkpoint <task-id> "Draft findings prepared"
hzl task complete <task-id>
```

## Optional: Visual Dashboard

```bash
hzl serve
```

Opens at `http://localhost:3456` for human visibility.

## What to Learn Next

- [Concepts](../concepts/) — model and guarantees
- [Workflows](../workflows/) — operating patterns
- [CLI Reference](../reference/cli) — full command details
