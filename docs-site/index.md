---
layout: home

hero:
  name: HZL
  text: The Missing Task Layer for OpenClaw and Multi-Agent Teams
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
      text: Workflows
      link: /workflows/

features:
  - title: Shared Task State
    details: One durable ledger for many agents to read, claim, and update.
  - title: Stateless Session Continuity
    details: Resume in-progress work and hand off safely across fresh-session agent wakes.
  - title: Human Visibility
    details: Operators can inspect state and activity through CLI and dashboard.
---

## The Problem in [OpenClaw](https://openclaw.ai)

OpenClaw-style deployments always start with one main agent, then expand into specialist agents (writer, researcher, engineer, marketer).

As soon as those agents collaborate, coordination pain appears:

- session memory resets break continuity,
- handoffs become prompt-dependent,
- parallel workers can collide on the same work,
- progress tracking fragments across chat threads and notes.

## Why Existing Approaches Fail

Common fallbacks create new problems:

- Chat-based coordination is fast but brittle and hard to audit.
- Human PM tools are usually too heavyweight for agent execution loops.
- Bespoke scripts and trackers become long-term maintenance burden.
- Memory or markdown task files can work for small/single-session setups, but they usually break down once work spans sessions or agents:
  - no atomic claiming (two agents can take the same task),
  - stale copies and merge conflicts in task files,
  - no lease/stuck-task recovery model,
  - handoffs depend on prompt discipline instead of enforced state transitions,
  - weak auditability when debugging "what happened?"

You track your work. HZL lets your agents track and coordinate theirs when state must be durable, shared, and safe under parallel execution.

## How HZL Works in Stateless Systems

Every OpenClaw agent run is a fresh session. Any agent can wake first, check its own work, create/assign tasks, and hand off to others.

Lifecycle (for any agent):

1. Session starts and reads shared task state (`in_progress`, `ready`, `blocked`).
2. Agent resumes owned work or claims next eligible task.
3. Agent updates progress, creates follow-on work, or delegates to another agent/project queue.
4. Task completion is written durably, and completion signals are queued for delivery.

Next session starts from that same durable state instead of memory.

## Scope Boundary

HZL is intentionally narrow:

- It is a shared task ledger and coordination primitive layer.
- It does not orchestrate runtime behavior: OpenClaw and your agents already handle session wakeups, scheduling, triggers, and coordination logic. HZL stays focused on durable state instead of duplicating a control plane.
- It does not plan or decompose work: agents are responsible for strategy, prioritization, and task breakdown. HZL records and enforces task state transitions.
- It does not replace built-in coding-tool todo lists for quick local loops: those are optimized for single-session execution. HZL is for work that must survive session resets and coordinate across multiple agents.

Use each system where it is strongest: orchestrator for runtime control, agents for planning, and HZL for durable shared task state across sessions.

## Start Here

- [Installation & OpenClaw Setup](/getting-started/installation)
- [Workflows](/workflows/)
- [Concepts](/concepts/)
- [CLI Reference](/reference/cli)
- [Experimental integrations](/experimental-integrations)
