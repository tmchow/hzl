---
layout: doc
title: Blocking & Unblocking
parent: Workflows
nav_order: 5
---

# Blocking and Unblocking Tasks

Use `blocked` status for external blockers.

Use dependencies for task-order blockers.

## External blockers

```bash
hzl task block <id> --comment "Waiting for API keys from DevOps"
hzl task unblock <id>
```

## Delegation blockers (workflow path)

When delegating work that should pause parent progress:

```bash
hzl workflow run delegate \
  --from <parent-id> \
  --title "Collect benchmark data" \
  --project research \
  --pause-parent
```

This does three things:
1. Creates delegated task.
2. Adds parent -> delegated dependency (default).
3. Moves parent to `blocked` when parent is in progress.

## Notes on dependency-only gating

Dependency edges alone gate availability (`--available` and `claim --next`), but they do not automatically force an in-progress parent into blocked status.

Use `--pause-parent` when explicit pause semantics are required.

## Inspect blockers

```bash
hzl task list --status blocked
hzl dep list --blocking-only
hzl task show <id>
```
