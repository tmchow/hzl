---
layout: doc
title: CLI Reference
parent: Reference
nav_order: 1
---

# CLI Reference

Current command reference for `hzl`.

## Global Options

```bash
hzl --help
hzl --version
hzl --format json   # default
hzl --format md
hzl --db <path>
```

## Setup and Health

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
```

## Projects

```bash
hzl project create <name>
hzl project list
```

## Agent Queries

```bash
hzl agent stats
hzl agent stats -P <project>
hzl agent stats -P <project> -s <status>
```

`agent stats` returns counts-only workload summaries by agent.

## Tasks

### Create

```bash
hzl task add "<title>"
hzl task add "<title>" -P <project>
hzl task add "<title>" --parent <taskId>
```

Important options:
- `-d, --description`
- `-l, --links`
- `-t, --tags`
- `-p, --priority` (0-3)
- `-s, --status` (`backlog|ready|in_progress|blocked|done`)
- `--depends-on <ids>`
- `--agent <name>`
- `--author <name>`
- `--comment <comment>` (recommended with blocked)

### List and Show

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
```

`task list` key options:
- `-P, --project`
- `-s, --status`
- `--agent`
- `--agent-pattern <glob>` (case-insensitive `*` wildcard)
- `--available`
- `--parent`
- `--root`
- `--page`
- `--limit`
- `--group-by-agent`
- `--view summary|standard|full`

### Claim and Complete

```bash
# Explicit claim
hzl task claim <taskId> --agent <name>

# Automatic next eligible claim
hzl task claim --next --agent <name>
hzl task claim --next -P <project> --agent <name>
```

`task claim` options:
- `--next`
- `-P, --project` (with `--next`)
- `-t, --tags` (with `--next`)
- `--parent` (with `--next`)
- `--agent`
- `--agent-id`
- `-l, --lease <minutes>`
- `--view summary|standard|full`
- `--no-stagger` (disable deterministic anti-herd delay for `--next`)

Complete/release/reopen:

```bash
hzl task complete <taskId>
hzl task release <taskId>
hzl task reopen <taskId>
```

### Progress, Notes, History

```bash
hzl task checkpoint <taskId> "<note>"
hzl task comment <taskId> "<note>"
hzl task progress <taskId> <0-100>
hzl task history <taskId>
```

### Status and Recovery

```bash
hzl task set-status <taskId> <status>
hzl task block <taskId> --comment "<reason>"
hzl task unblock <taskId>

hzl task stuck
hzl task steal <taskId> --if-expired --agent <name>
```

`set-status` supports: `backlog`, `ready`, `in_progress`, `blocked`, `done`, `archived`.

### Update and Structure

```bash
hzl task update <taskId> --title "<title>"
hzl task move <taskId> <project>
hzl task add-dep <taskId> <dependsOnId>
hzl task remove-dep <taskId> <dependsOnId>
```

### Archive and Prune

```bash
hzl task archive <taskId>
hzl task archive <taskId> --cascade
hzl task archive <taskId> --orphan

hzl task prune -P <project> --dry-run
hzl task prune -P <project> --older-than 30d --yes
hzl task prune --all --older-than 30d --yes
```

`task prune` options:
- `-P, --project`
- `-A, --all`
- `--older-than <duration>`
- `--as-of <timestamp>`
- `-y, --yes`
- `--dry-run`

## Web Dashboard

```bash
hzl serve
hzl serve --port 3456
hzl serve --host 127.0.0.1
hzl serve --background
hzl serve --status
hzl serve --stop
hzl serve --print-systemd
hzl serve --allow-framing
```

## Other Utilities

```bash
hzl export-events [output.jsonl]
hzl sample-project
hzl lock --help
hzl guide
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `HZL_DB` | Database directory path |
| `HZL_DEV_MODE` | Set to `0` to disable dev mode |

## Notes

- JSON is the default output format.
- Use `--format md` for human-friendly terminal output.
- For exact option details, prefer command help (`hzl task claim --help`).
