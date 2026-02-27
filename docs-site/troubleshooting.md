---
layout: doc
title: Troubleshooting
nav_order: 7
---

# Troubleshooting

Common issues and fixes.

## Quick reference

| Error | Fix |
|---|---|
| "not claimable (status: backlog)" | `hzl task set-status <id> ready` |
| "Cannot complete: status is X" | claim first: `hzl task claim <id> --agent <name>` |
| "Task not found" | `hzl task list` and confirm ID/prefix |
| "Circular dependency" | run `hzl validate` and remove one edge |
| "handoff requires --agent, --project, or both" | add routing args to `workflow run handoff` |
| "--auto-op-id is not supported for workflow run start" | use explicit `--op-id` only for intentional retries |

## Task not showing in available list

Cause:
- unmet dependencies, or
- task not in `ready`.

Check:

```bash
hzl task show <id>
hzl dep list --blocking-only
```

## Already claimed / stalled ownership

```bash
hzl task stuck
hzl task show <id>
hzl task steal <id> --if-expired --agent <name>
```

## Workflow handoff fails with routing guardrail

`workflow run handoff` requires explicit routing.

Use one of:

```bash
hzl workflow run handoff --from <id> --title "..." --project writing
hzl workflow run handoff --from <id> --title "..." --project writing --agent clara
```

## Hook delivery not happening

Most common cause: no scheduler is running `hzl hook drain`.

Run manually to verify:

```bash
hzl hook drain
```

If this reports retries/failures:
1. verify `hooks.on_done.url` and auth header,
2. verify gateway/network reachability,
3. keep drain on schedule (1-5 minute cadence).

## Hook rows keep failing

Inspect likely causes:
- endpoint unavailable,
- auth token expired/invalid,
- response timeout.

`hook drain` uses retry/backoff and eventually marks terminal failures.

## Diagnostic commands

```bash
hzl status
hzl doctor
hzl validate
hzl stats
hzl which-db
```

## Destructive reset warning

```bash
hzl init --force
```

This deletes all HZL data. Only run with explicit operator intent.

## Getting help

- `hzl --help`
- `hzl <command> --help`
- GitHub issues: [github.com/tmchow/hzl/issues](https://github.com/tmchow/hzl/issues)
