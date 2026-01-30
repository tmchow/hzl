# AGENTS.md Snippet Analysis

## Current Snippet (from AGENTS.md)

```markdown
## Task Coordination (HZL)

This project uses `hzl` for task coordination.

### Core Commands
hzl next                        # Show next available task  
hzl claim <id>                  # Take ownership of a task
hzl complete <id>               # Mark task done
hzl release <id>                # Give up task (let others claim it)

### During Work
hzl comment <id> "progress..."  # Add progress note
hzl checkpoint <id> "name"      # Save recovery point for long tasks

### Discovery
hzl list                        # All tasks
hzl list --status=ready         # Available tasks
hzl show <id>                   # Task details + history

### Workflow
1. `hzl next` → see what's available
2. `hzl claim <id>` → take ownership
3. Do the work (add comments/checkpoints as needed)
4. `hzl complete <id>` or `hzl release <id>` if blocked

### Rules
- Claim before working (prevents duplicate effort)
- One task at a time
- Always complete or release—never abandon silently
```

---

## Assessment

### ✅ Strengths

1. **Minimal cognitive load** — Core commands fit in one screen
2. **Clear workflow** — 4-step process is easy to follow
3. **Rules section** — Sets expectations for agent behavior
4. **Both happy and error paths** — Shows `release` for blocked scenarios

### ⚠️ Gaps

| Gap | Impact | Recommendation |
|-----|--------|----------------|
| No `--project` flag shown | Multi-project confusion | Add: `hzl list --project=<name>` |
| No lease mention | Agents might ignore time limits | Add lease flag to claim example |
| No dependency awareness | Agents may try to claim blocked tasks | Mention deps are auto-checked |
| No `hzl show` before claim | Agents skip reading descriptions | Suggest showing before claiming |
| No error examples | Unclear what failures look like | Add common error + fix patterns |

### 🔧 Suggested Improvements

#### Add Project Filtering
```
hzl next --project=myproject    # Filter by project
```

#### Add Lease Example
```
hzl claim <id> --lease-minutes=30
```

#### Add Pre-Claim Pattern
Suggest reading the task first:
```
1. `hzl next` → see what's available
2. `hzl show <id>` → read full description
3. `hzl claim <id>` → take ownership
...
```

#### Add Error Handling Section

```markdown
### If Stuck
- **Dependencies not met**: Wait or check `hzl show <id>` for blockers
- **Claim failed**: Another agent got it first—pick a different task
- **Need more time**: `hzl extend-lease <id> --minutes=30`
```

---

## Comparison: Current vs. Skills

The AGENTS.md snippet is the **minimal viable prompt** for agents. The `/skills/` folder contains **deep guidance** for specific roles:

| Audience | AGENTS.md | skills/*.md |
|----------|-----------|-------------|
| **Generic worker** | ✅ Core commands | ❌ Overkill |
| **Orchestrator** | ❌ No task creation | ✅ `orchestrator.md` |
| **Specialized worker** | ❌ No tag filtering | ✅ `worker.md` |
| **Plan author** | ❌ No description format | ✅ `writing-tasks.md` |
| **Troubleshooter** | ❌ No diagnostics | ✅ `troubleshooting.md` |

**Recommendation**: Keep AGENTS.md simple. Reference skills when spawning specialized agents:

```markdown
You are Worker-3 on project api-v2.
Follow the instructions in `skills/worker.md`.
```

---

## Versioning Consideration

The current snippet uses short-form commands (`hzl next`, `hzl claim`). If the CLI changes, update AGENTS.md in sync. Consider adding a version marker:

```markdown
<!-- HZL CLI v0.1 -->
```
