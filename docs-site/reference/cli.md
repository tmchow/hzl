---
layout: doc
title: CLI Reference
parent: Reference
nav_order: 1
---

# CLI Reference

Current command reference for `hzl`.

## Global options

```bash
hzl --help
hzl --version
hzl --format json   # default
hzl --format md
hzl --db <path>
```

## Setup and health

```bash
hzl init
hzl init --sync-url <url> --auth-token <token>
hzl init --reset-config
hzl init --force --yes

hzl which-db
hzl config
hzl status
hzl sync
hzl doctor
hzl validate
hzl stats
hzl stats --window 1h
```

## Projects

```bash
hzl project create <name>
hzl project list
hzl project show <name>
hzl project rename <old-name> <new-name>
hzl project delete <name>
```

## Agent queries

```bash
hzl agent status                          # All agents: who's active, what they're working on
hzl agent status --agent <name>           # Single agent status
hzl agent status --stats                  # Include per-agent task count breakdowns
hzl agent status -P <project>             # Filter by project
hzl agent status --format md              # Human-readable output

hzl agent log <agent>                     # Activity history for an agent
hzl agent log <agent> --limit 50          # More events
hzl agent log <agent> --format md         # Human-readable output
```

## Tasks

### Create

```bash
hzl task add "<title>"
hzl task add "<title>" -P <project>
hzl task add "<title>" --parent <taskId>
hzl task add "<title>" --stale-after 2h
```

Common options:
- `-d, --description`
- `-l, --links`
- `-t, --tags`
- `-p, --priority` (`0-3`)
- `-s, --status` (`backlog|ready|in_progress|blocked|done`)
- `--depends-on <ids>`
- `--agent <name>`
- `--author <name>`
- `--comment <comment>`
- `--stale-after <duration>` (`30`, `30m`, `2h`, `7d`)

### List and show

```bash
hzl task list
hzl task list -P <project>
hzl task list --agent <name>
hzl task list --agent-pattern 'writer*'
hzl task list --available
hzl task list --group-by-agent --view standard

hzl task show <taskId>
hzl task show <taskId> --deep
hzl task show <taskId> --no-subtasks
hzl task show <taskId> --view summary
hzl task show <taskId> --view standard --json

hzl task search "<query>"
hzl task search "<query>" -P <project>
hzl task search "<query>" -s <status>
```

`task list` key options:
- `-P, --project`
- `-s, --status`
- `--agent`
- `--agent-pattern`
- `--available`
- `--parent`
- `--root`
- `--page`
- `--limit`
- `--group-by-agent`
- `--view summary|standard|full`
- `--stale-threshold <minutes>` (default 10, 0 to disable) — flag in-progress tasks with no checkpoints as stale

`task show` key options:
- `--no-subtasks`
- `--deep`
- `--view summary|standard|full`

### Claim/complete/recovery

```bash
hzl task claim <taskId> --agent <name>
hzl task claim --next --agent <name>
hzl task claim --next -P <project> --agent <name>
hzl task start <taskId> --agent <name>

hzl task complete <taskId>
hzl task release <taskId>
hzl task reopen <taskId>

hzl task stuck
hzl task stuck --stale                                    # Include stale tasks (no checkpoints)
hzl task stuck --stale --stale-threshold 15               # Custom threshold (default 10 min)
hzl task steal <taskId> --if-expired --agent <name>
hzl task steal <taskId> --if-expired --agent <name> --lease <minutes>
```

### Notes/progress/history

```bash
hzl task checkpoint <taskId> "<note>"
hzl task comment <taskId> "<note>"
hzl task progress <taskId> <0-100>
hzl task history <taskId>
```

### Structure and status

```bash
hzl task set-status <taskId> <status>
hzl task block <taskId> --comment "<reason>"
hzl task unblock <taskId>

hzl task update <taskId> --title "<title>"
hzl task update <taskId> --stale-after 30m
hzl task update <taskId> --clear-stale-after
hzl task move <taskId> <project>
hzl task add-dep <taskId> <dependsOnId>
hzl task remove-dep <taskId> <dependsOnId>
```

### Archive/prune

```bash
hzl task archive <taskId>
hzl task archive <taskId> --cascade
hzl task archive <taskId> --orphan

hzl task prune -P <project> --dry-run
hzl task prune -P <project> --older-than 30d --yes
hzl task prune --all --older-than 30d --yes
```

## Dependencies

```bash
hzl dep list
hzl dep list -P <project>
hzl dep list --from-project <project>
hzl dep list --to-project <project>
hzl dep list --agent <agent>
hzl dep list --from-agent <agent>
hzl dep list --to-agent <agent>
hzl dep list --blocking-only
hzl dep list --cross-project-only
```

## Hooks

```bash
hzl hook drain
hzl hook drain --limit 100
```

Host-process model: run `hook drain` on a scheduler (no required daemon).

## Workflows

### Discover

```bash
hzl workflow list
hzl workflow show start
hzl workflow show handoff
hzl workflow show delegate
```

### Run

```bash
hzl workflow run start --agent <name> --project <project>
hzl workflow run handoff --from <taskId> --title "<title>" -P <project>
hzl workflow run delegate --from <taskId> --title "<title>" -P <project>
```

`workflow run start` options:
- `--agent <name>` (required)
- `-P, --project <project>` (required unless `--any-project`)
- `--any-project` — scan all projects instead of a specific one
- `--tags <csv>`
- `-l, --lease <minutes>`
- `--resume-policy first|latest|priority`
- `--include-others|--no-include-others`
- `--others-limit <n|all>`
- `--op-id <key>`

Important: `--auto-op-id` is intentionally unsupported for `workflow run start` because repeated polling calls may legitimately return different results over time.

Agent routing: when claiming, tasks assigned to other agents are skipped. Tasks with no agent are available to everyone.

`workflow run handoff` options:
- `--from <taskId>` (required)
- `--title <title>` (required)
- `-P, --project <project>`
- `--agent <agent>`
- `--carry-checkpoints <n>`
- `--carry-max-chars <n>`
- `--author <name>`
- `--op-id <key>`
- `--auto-op-id`

`workflow run delegate` options:
- `--from <taskId>` (required)
- `--title <title>` (required)
- `-P, --project <project>`
- `--agent <agent>`
- `--no-depends`
- `--checkpoint <text>`
- `--pause-parent`
- `--author <name>`
- `--op-id <key>`
- `--auto-op-id`

## Dashboard and other utilities

```bash
hzl serve
hzl serve --gateway-url ws://127.0.0.1:18789 --gateway-token <token>
hzl events
hzl events --from 100 --limit 50
hzl events --follow
hzl events --from 0 > events.jsonl
hzl sample-project create
hzl sample-project reset
hzl lock status
hzl lock clear
hzl lock clear --force
hzl guide
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `HZL_DB` | Database directory path |
| `HZL_DEV_MODE` | Set to `0` to disable dev mode |

For exact option details, prefer command help (`hzl <command> --help`).
