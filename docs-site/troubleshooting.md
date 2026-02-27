---
layout: doc
title: Troubleshooting
nav_order: 7
---

# Troubleshooting

Common issues and how to fix them.

## Quick Reference

| Error | Fix |
|-------|-----|
| "not claimable (status: backlog)" | `hzl task set-status <id> ready` |
| "Cannot complete: status is X" | Claim first: `hzl task claim <id>` |
| "Task not found" | Check ID with `hzl task list` |
| "Already claimed" | Task owned by another agent |
| "Circular dependency" | Run `hzl validate` to find the cycle |

## Common Issues

### Task Won't Claim

**Error:** "Task is not claimable (status: backlog)"

**Cause:** Task is in `backlog` status, not `ready`.

**Fix:**
```bash
hzl task set-status <id> ready
hzl task claim <id> --agent <name>
```

### Task Won't Complete

**Error:** "Cannot complete task: status is ready"

**Cause:** Task must be claimed (in_progress) before completing.

**Fix:**
```bash
hzl task claim <id> --agent <name>
hzl task complete <id>
```

### Task Not Showing in Available

**Cause:** Task has unmet dependencies or is already claimed.

**Check:**
```bash
hzl task show <id>
# Look at "Depends on" and "Status"
```

**Fix:**
- Complete blocking dependencies first
- Or remove an incorrect dependency: `hzl task remove-dep <task-id> <depends-on-id>`

### Already Claimed Error

**Error:** "Task already claimed by `<agent>`"

**Cause:** Another agent owns this task.

**Options:**
1. Wait for them to complete
2. If stuck, check lease: `hzl task stuck`
3. If expired, steal: `hzl task steal <id> --if-expired --agent <name>`

### Circular Dependency

**Error:** "Circular dependency detected"

**Cause:** Task A depends on B, B depends on A (directly or transitively).

**Find:**
```bash
hzl validate
```

**Fix:** Remove one of the dependencies by recreating tasks without the cycle.

## Diagnostic Commands

### Check HZL Status

```bash
hzl status
```

Shows:
- Database location
- Sync configuration
- Basic health info

### Run Health Checks

```bash
hzl doctor
```

Comprehensive health check including:
- Database integrity
- Sync status
- Configuration issues

### Validate Task Graph

```bash
hzl validate
```

Checks for:
- Circular dependencies
- Invalid references
- Other graph issues

## Database Issues

### Reset Configuration

```bash
hzl init --reset-config
```

Resets config to defaults without touching data.

### Reinitialize (Destructive)

```bash
hzl init --force
```

**Warning:** This deletes all data. Use only if you need a fresh start.

### Database Location

Default: `~/.local/share/hzl/`

Contains:
- `events.db` - Event log (source of truth)
- `cache.db` - Derived state (can be rebuilt)

## Sync Issues

### Sync Not Working

```bash
# Check configuration
hzl status

# Force sync
hzl sync

# Look for error messages
```

### Stale Data

```bash
hzl sync
hzl task list
```

### Authentication Failed

- Verify auth token is correct
- Token may have expired - generate new one
- Check sync URL format: `libsql://<db>.turso.io`

## Getting Help

### Command Help

```bash
hzl --help
hzl task --help
hzl task add --help
```

### Report Issues

File bugs at [github.com/tmchow/hzl/issues](https://github.com/tmchow/hzl/issues)

Include:
- HZL version (`hzl --version`)
- Error message
- Steps to reproduce
- Output of `hzl doctor`
