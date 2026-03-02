### HZL task ledger (agent instructions)

Use HZL as durable task state when work can span sessions or agents.

**Use HZL when:**
- Work has multiple steps or risk
- You need resumable progress and ownership
- You are delegating or handing off work
- You need human-auditable state

**Skip HZL when:**
- Work is tiny and can be finished immediately

---

## Workflow-first loop

```bash
# 1) Session start: resume existing in-progress work or claim next
hzl workflow run start --agent <agent-name> --project <project>

# 2) Progress updates
hzl task checkpoint <id> "what changed and what is next"
hzl task progress <id> 60

# 3) Complete, handoff, or delegate
hzl task complete <id>
# or
hzl workflow run handoff --from <id> --title "<follow-on>" --project <project>
# or
hzl workflow run delegate --from <id> --title "<delegated>" --project <project> --pause-parent
```

## Key commands

```bash
hzl project list
hzl workflow list
hzl workflow show start
hzl dep list --blocking-only
hzl hook drain
```

## Routing model

- Use projects as role pools.
- Omit `--agent` to create pool-routed tasks.
- Use `--agent` only when assignment must be explicit.

## Recovery model

```bash
hzl task stuck
hzl task steal <id> --if-expired --agent <agent-name> --lease 30
```

## Hook delivery model

- Transition to `done` enqueues callbacks.
- Host scheduler must run `hzl hook drain` (recommended every 1-5 minutes).

## Safety notes

- `task complete` is a command; `done` is a status.
- `workflow run start` intentionally does not support `--auto-op-id`.

---

**DESTRUCTIVE - Never run without explicit user request:**
- `hzl task prune`
- `hzl init --force`
