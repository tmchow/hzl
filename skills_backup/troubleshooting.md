---
description: Common problems and how to fix them
---

# Troubleshooting Skill

## Claim Failures

**"Task already claimed"**
→ Another agent got it first. Pick a different task.

**"Dependencies not met"**
→ A required task isn't done yet. Check with:
```bash
hzl task show <id>  # Shows depends_on
```

**"Task not ready"**
→ Task is in backlog/in_progress/done. Check status:
```bash
hzl task show <id>
```

## Stuck Tasks

**Finding them:**
```bash
hzl task list --stuck --project=api-v2
```

**Releasing them:**
```bash
hzl task release <id>
```

**Why it happens:**
- Worker crashed
- Worker took too long
- Lease expired

## Database Errors

**"SQLITE_BUSY"**
→ Auto-retried. If persistent, check for runaway processes:
```bash
lsof | grep ledger.db
```

**"Database locked"**
→ Only one writer allowed. Wait and retry.

## Consistency Issues

**Projection out of sync:**
```bash
hzl doctor        # Check consistency
hzl rebuild       # Rebuild projections from events
```

## Worker Won't Start

1. Check database path: `echo $HZL_DB`
2. Verify access: `ls -la <db-path>`
3. Test connection: `hzl task list`

## Anti-Patterns

| Don't Do | Why | Instead |
|----------|-----|---------|
| Claim multiple tasks | Blocks others, leases expire | One at a time |
| Work past lease | May get reassigned | Extend or release |
| Silent failure | Looks stuck forever | Always report status |
| Skip dependency check | Wasted work | Query ready tasks only |
