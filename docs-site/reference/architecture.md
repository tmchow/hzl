---
layout: doc
title: Architecture
parent: Reference
nav_order: 2
---

# Architecture

Technical overview of HZL internals.

## System overview

HZL is an event-sourced task ledger with three packages:
- `hzl-core` (services, events, projections),
- `hzl-cli` (command surface),
- `hzl-web` (dashboard).

Data lives in SQLite:
- `events.db` (source of truth),
- `cache.db` (derived projections and runtime tables).

## Event sourcing model

All mutations append immutable events. Current state is rebuilt into projections.

Key projection tables:
- `tasks_current`
- `task_dependencies`
- `task_tags`
- `task_comments`
- `task_checkpoints`
- `projects`

## Atomic claiming

`claim --next` and explicit claim paths use write transactions to prevent duplicate claims under concurrency.

## Workflow runtime internals

Workflow commands (`start`, `handoff`, `delegate`) run through `WorkflowService`.

Idempotency scope is persisted in `workflow_ops`:
- dedupe by `op_id`,
- replay completed results,
- reclaim stale `processing` entries,
- store failure payloads for retries/diagnostics.

## Hook delivery internals

Status transitions to `done` enqueue outbox rows in `hook_outbox`.

Delivery is decoupled from mutation:
1. task transition commits,
2. outbox row is durable,
3. host runtime executes `hzl hook drain` to deliver.

`HookDrainService` behavior:
- claims due rows,
- applies retry/backoff,
- enforces TTL/max-attempts,
- reclaims stale processing locks,
- marks terminal failures for inspection.

This is intentionally a host-process model, not a required daemon.

## Availability rules

A task is available when:
1. status is `ready`, and
2. all dependency targets are `done`.

`task claim --next` and `task list --available` rely on this rule.

## Data location and modes

### Production

Uses XDG defaults:
- data: `$XDG_DATA_HOME/hzl` (typically `~/.local/share/hzl`)
- config: `$XDG_CONFIG_HOME/hzl` (typically `~/.config/hzl`)

### Development (from source)

Auto dev mode isolates data in repo-local paths:
- `.local/hzl`
- `.config/hzl`

## Integration boundary

HZL provides durable task state and consistency guarantees.

Orchestrators (OpenClaw or custom runtimes) own:
- wake scheduling,
- agent lifecycle,
- running `hzl hook drain` on cadence,
- higher-level policy decisions.
