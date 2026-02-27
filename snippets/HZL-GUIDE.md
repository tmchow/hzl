### HZL task ledger (agent instructions)

Use this guide to operate HZL as the shared task ledger for agents on one machine/OpenClaw instance.

**Use HZL when:**
- Work has multiple steps or may not finish this session
- You need durable ownership, progress, or handoff state
- One agent needs help from another agent
- You need visibility/auditability for ongoing agent work

**Skip HZL when:**
- The work is tiny and can be completed immediately
- A one-off answer does not need durable tracking

**Rule of thumb:** If work could span sessions or involve multiple agents, use HZL.

---

**Primary orientation:**
- HZL is agent-first: agents create, claim, hand off, and complete tasks.
- Humans typically steer and observe; they can also create/update tasks when needed.
- Projects are optional scopes. Use `inbox` when you do not need scoping.

**Structure:**
- **Project (optional)** = shared scope/domain (e.g., `research`, `writing`, `api-service`).
- **Task** = unit of work.
- **Subtask** = breakdown (`--parent <id>`), max depth 1.
- **Agent** = ownership identity (`--agent`).

---

**Setup / scope selection:**
```bash
hzl project list                  # Check existing scopes
hzl project create research       # Optional: create scope only if useful
```

**Create work:**
```bash
# Unscoped/global queue (inbox)
hzl task add "Triage failing tests" -s ready

# Scoped queue
hzl task add "Summarize benchmark paper" -P research -s ready

# Delegate directly to another agent
hzl task add "Draft release notes" -P writing -s ready --agent writer-1 --author main-agent
```

**Claim work:**
```bash
# Let HZL pick next eligible task
hzl task claim --next --agent worker-1
hzl task claim --next -P research --agent researcher-1

# Claim specific task by ID (after reasoning over candidates)
hzl task claim <id> --agent worker-1
```

**Inspect candidate work:**
```bash
hzl task list --available --view summary
hzl task list -P research --available --view summary
hzl task list --agent-pattern 'writer*' --view summary
```

**Record progress / blockers:**
```bash
hzl task checkpoint <id> "completed first pass, next: validate edge cases"
hzl task progress <id> 60
hzl task block <id> --comment "Waiting for dependency decision"
hzl task unblock <id>
```

**Complete / hand off:**
```bash
hzl task comment <id> "handoff: implementation done, needs review"
hzl task complete <id>
```

---

**Recovery for stuck tasks (leases):**
```bash
hzl task claim --next -P research --agent researcher-1 --lease 60
hzl task stuck
hzl task steal <id> --if-expired --agent researcher-2
```

**Troubleshooting quick hits:**
| Error | Fix |
|-------|-----|
| "not claimable (status: backlog)" | `hzl task set-status <id> ready` |
| "Cannot complete: status is X" | Claim first: `hzl task claim <id> --agent <name>` |

---

**DESTRUCTIVE - Never run without explicit user request:**
- `hzl task prune` — **PERMANENTLY DELETES** old done/archived tasks. No undo.
