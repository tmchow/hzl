---
layout: doc
title: Session Handoffs
parent: Workflows
nav_order: 3
---

# Session Handoffs

Handoffs should be explicit, context-rich, and replayable.

Use `workflow run handoff` instead of ad hoc "complete + add" sequences.

## Why workflow handoff

`workflow run handoff` performs a coordinated transition:
1. Validates source task status.
2. Creates follow-on task.
3. Carries recent checkpoint context.
4. Completes source task.

Carried context is placed in:
- follow-on description (pickup context), and
- an initial follow-on checkpoint (history/debug context).

## Basic handoff

```bash
hzl workflow run handoff \
  --from <task-id> \
  --title "Prepare final publish assets" \
  --project marketing
```

Omitting `--agent` is intentional pool routing when `--project` is provided.

## Targeted handoff to specific agent

```bash
hzl workflow run handoff \
  --from <task-id> \
  --title "Apply final legal edits" \
  --project writing \
  --agent writer-2
```

## Carry controls

```bash
hzl workflow run handoff \
  --from <task-id> \
  --title "Follow-up" \
  --project writing \
  --carry-checkpoints 5 \
  --carry-max-chars 4000
```

## Guardrail behavior

Handoff requires routing clarity:
- provide `--agent`, or
- provide `--project`, or
- provide both.

If omitted, command fails with an actionable message.

## Idempotent retries

```bash
hzl workflow run handoff --from <id> --title "..." --project writing --op-id handoff-2026-02-27-01
```

Use `--auto-op-id` when you want deterministic key generation from normalized input.
