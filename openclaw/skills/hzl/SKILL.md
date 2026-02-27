---
name: hzl
description: OpenClaw's persistent task database. Coordinate sub-agents, checkpoint progress, survive session boundaries.
metadata:
  { "openclaw": { "emoji": "🧾", "homepage": "https://github.com/tmchow/hzl", "requires": { "bins": ["hzl"] }, "install": [ { "id": "brew", "kind": "brew", "package": "hzl", "bins": ["hzl"], "label": "Install HZL (Homebrew)" }, { "id": "node", "kind": "node", "package": "hzl-cli", "bins": ["hzl"], "label": "Install HZL (npm)" } ] } }
---

# HZL for OpenClaw

OpenClaw sessions are stateless. HZL provides durable task continuity.

## Use HZL when

- work is multi-step,
- work may cross session boundaries,
- you delegate to sub-agents,
- or you need durable audit state.

## Workflow-first runtime pattern

```bash
# 1) Start each wake
hzl workflow run start --agent <agent-id> --project <project>

# 2) During execution
hzl task checkpoint <id> "what changed, what is next"

# 3) Transition at boundaries
hzl workflow run handoff --from <id> --title "<next task>" --project <project>
# or
hzl workflow run delegate --from <id> --title "<delegated task>" --project <project> --pause-parent
# or
hzl task complete <id>
```

## Pool routing pattern

For scalable role queues:
- create tasks in role project,
- omit `--agent` for pool-routed tasks,
- claim with `task claim --next -P <project> --agent <id>`.

## Hooks and reliability

Done transitions enqueue hook callbacks.

A host scheduler must run:

```bash
hzl hook drain
```

Recommended cadence: every 1-5 minutes.

## Common commands

```bash
hzl workflow list
hzl workflow show start
hzl dep list --blocking-only
hzl task list --available -P <project>
hzl task stuck
```

## Semantics to remember

- `done` (status) vs `complete` (command) are not the same concept.
- `workflow run start` intentionally rejects `--auto-op-id`.
- Cross-project dependencies are supported by default.

## Destructive commands

Never run without explicit user request:
- `hzl task prune`
- `hzl init --force`
