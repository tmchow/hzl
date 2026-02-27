### Tasks: External tracking with HZL

HZL is OpenClaw's durable task ledger for stateless sessions.

Use HZL by default when work is non-trivial, spans sessions, or involves delegation.

## Default operating loop

```bash
# Session start
hzl workflow run start --agent <agent-id> --project <project>

# During work
hzl task checkpoint <id> "progress + next step"

# Finish paths
hzl task complete <id>
# or
hzl workflow run handoff --from <id> --title "<next task>" --project <project>
# or
hzl workflow run delegate --from <id> --title "<delegated task>" --project <project> --pause-parent
```

## Multi-agent routing

- Prefer project pools for role queues.
- Omit `--agent` when creating pool-routed tasks.
- Claim with `task claim --next -P <project> --agent <id>`.

## Reliability

- Completion hooks are outbox-based.
- Host runtime must schedule `hzl hook drain` (every 1-5 minutes).

## Troubleshooting quick hits

| Error | Fix |
|---|---|
| "not claimable (status: backlog)" | `hzl task set-status <id> ready` |
| "Cannot complete: status is X" | `hzl task claim <id> --agent <id>` first |
| "handoff requires --agent, --project, or both" | add explicit routing flags |

## Destructive commands (never run unless explicitly requested)

- `hzl init --force`
- `hzl task prune`
