---
layout: home

hero:
  name: HZL
  text: The Missing Task Layer for OpenClaw
  tagline: Coordinate many agents through shared, durable task state with built-in human visibility.
  image:
    src: /hzl.png
    alt: HZL mascot
    width: 340
    height: 340
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/
    - theme: alt
      text: View on GitHub
      link: https://github.com/tmchow/hzl

features:
  - title: Shared Task State
    details: One durable ledger for many agents to read, claim, and update.
  - title: Atomic Claiming
    details: Prevent duplicate execution when multiple agents pull work at once.
  - title: Human Visibility
    details: Operators can inspect state and activity through CLI and dashboard.
---

## The Problem in OpenClaw

OpenClaw runs with one main agent. Most operators then add specialist sub-agents (writer, developer, researcher, etc.), each with role and personality defined in `SOUL.md`.

As soon as agents specialize and collaborate, coordination pain appears:

- Single-agent queueing is not enough for long-running backlogs.
- Agent-to-agent handoffs lose state and continuity.
- Parallel agents need safe claiming and ownership, not ad hoc coordination.
- Without durable task state, progress tracking becomes brittle.

## Why Existing Approaches Fail

Common fallbacks create new problems:

- Chat-based coordination (Discord/Telegram) does not scale: either every agent processes every message, or DM/channel permutations explode and visibility collapses.
- Human PM tools are usually too heavyweight for agent loops.
- Bespoke trackers become ongoing maintenance burden.

You track your work. HZL lets your OpenClaw agents track and coordinate theirs.

## How HZL Works

OpenClaw (or another orchestrator) uses HZL as shared task state.

1. Agents create tasks in a shared backlog (global or scoped).
2. Agents claim work safely (specific task or next eligible task).
3. Agents checkpoint progress and hand off work when needed.
4. Agents complete, block, or recover tasks while preserving full history.

This gives you atomic claims, lease-based recovery, and durable handoff context.

## Scope Boundary

HZL is intentionally narrow.

- Not an orchestrator
- Not a planner/decomposer
- Not a replacement for native task systems in Codex, Claude Code, Gemini, or similar coding harnesses
- Not a replacement for your human-focused todo app

Use each system where it is strongest: harness-native tasking inside coding harnesses, your todo app for human planning, and HZL for durable agent-first coordination across one or more agents.

## Start Here

- [Installation](/getting-started/installation)
- [OpenClaw Setup (TBD)](/getting-started/openclaw)
- [Quickstart](/getting-started/quickstart)
- [Concepts](/concepts/)
- [Workflows](/workflows/)
- [CLI Reference](/reference/cli)
- [Experimental integrations](/experimental-integrations)
