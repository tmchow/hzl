---
layout: home

hero:
  name: HZL
  text: Continuity Layer for Stateless Agents
  tagline: Durable task state for fresh-session agent loops. Resume, hand off, and coordinate reliably.
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
  - title: Session Continuity
    details: Resume in-progress work after session gaps with a single workflow start command.
  - title: Reliable Handoffs
    details: Workflow handoff carries context and completion hooks enable system-level notifications.
  - title: Scalable Pool Routing
    details: Route by project pools so teams can add agents without changing assignment prompts.
---

## Stateless Agent Reality

Most OpenClaw-style systems run agents as ephemeral sessions. There is no always-on per-agent process with in-memory continuity.

That means every wake must reconstruct state from durable storage.

HZL provides that storage and coordination contract.

## Core Loop

1. `workflow run start` resumes existing in-progress work for an agent (or claims next eligible task).
2. Agents checkpoint progress and comments while working.
3. `workflow run handoff` and `workflow run delegate` encode common multi-step transitions.
4. Status transitions to `done` enqueue hook callbacks for host-process delivery (`hzl hook drain`).

## Why Not Just Chat Messages

Chat-only coordination is fast but fragile:
- missed handoff messages,
- no single source of task truth,
- poor replay/debuggability across sessions.

HZL keeps durable state in one place with explicit task and event history.

## Scope Boundary

HZL is intentionally narrow:
- task ledger and coordination primitives,
- not an orchestrator,
- not a planner,
- not a replacement for harness-native short-lived todo tools.

Use HZL where durable multi-session state matters.

## Start Here

- [Installation](/getting-started/installation)
- [OpenClaw Setup](/getting-started/openclaw)
- [Workflows](/workflows/)
- [Concepts](/concepts/)
- [CLI Reference](/reference/cli)
