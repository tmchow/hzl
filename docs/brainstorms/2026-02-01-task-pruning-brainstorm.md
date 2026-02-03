---
date: 2026-02-01
topic: task-pruning
---

# Task Pruning

## What We're Building

An on-demand `hzl task prune` command that permanently deletes old tasks in terminal states (done, archived) along with their events. This helps keep HZL lightweight since it's not meant for long-term task storage.

The command deletes both events AND projections, breaking the append-only model as a deliberate maintenance escape hatch.

It is never implicitly or automaticaly run. It requires explicit invocation.  It is not meant for regular usage and only provided for special cases where task pruning is needed as it avoids any need for direct manipulation of the database, or a false choice of needing to re-init.

## Why This Approach

**Motivation:** Performance (database size), agent experience (reduce noise in queries), and general cleanliness.

**Considered alternatives:**
- **Projection-only deletion + separate compact**: Over-complicated, two commands to fully clean up
- **Soft delete flag + background cleanup**: Over-engineered, doesn't immediately free space

**Chosen: Direct event + projection deletion** - Simplest path to the goal. Temporarily disables append-only triggers during the prune operation.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| What gets pruned | Events AND projections | True deletion, achieves size reduction |
| Eligible statuses | Terminal states only: `done`, `archived` | `blocked` is NOT terminal (can be unblocked) |
| Related data | Checkpoints, comments, tags, assignee, progress | All task-associated data deleted together |
| Parent/child handling | Atomic family pruning | Only prune if parent AND all children are terminal |
| Dependencies | Independent of pruning | Task dependencies are sequencing hints, not blocking constraints for pruning |
| Age threshold | 30 days default, configurable via `--older-than` | Moderate default, user can override |
| Age calculated from | Completion/archive date | When task entered terminal state, not creation |
| Scope | Explicit required | Must specify `--project <name>` or `--all` |
| CLI interaction | Interactive confirmation | Shows what will be pruned, prompts yes/no |
| Scripting support | `--yes` flag | Bypasses confirmation for automation |
| Dry-run mode | `--dry-run` flag | Preview without deleting, works in non-TTY without `--yes` |
| Audit trail | None | Keep it simple, user chose to delete |

### Status Clarification

| Status | Terminal? | Prunable? |
|--------|-----------|-----------|
| `backlog` | No | No |
| `ready` | No | No |
| `in_progress` | No | No |
| `blocked` | No (can unblock) | No |
| `done` | Yes | Yes |
| `archived` | Yes | Yes |

## Command Interface

```bash
# Preview what would be pruned (interactive confirmation)
hzl task prune --project myproject
hzl task prune --all

# With custom age threshold
hzl task prune --all --older-than 90d

# Dry-run: preview without deleting (works in scripts without --yes)
hzl task prune --all --dry-run
hzl task prune --all --dry-run --json

# Skip confirmation for scripting
hzl task prune --all --older-than 30d --yes

# JSON output
hzl task prune --all --json --yes
```

## Implementation Notes

- Use `withWriteTransaction()` for atomic operation (prevents race with claiming)
- Disable SQLite triggers (`events_no_update`, `events_no_delete`) within transaction
- Delete events for prunable tasks
- Delete from all projection tables (same pattern as `deleteTasksFromProjections`)
- Re-enable triggers
- Report count of pruned tasks

## Documentation Requirements

The plan must include documentation updates:

1. **CLI Reference** - Document the `task prune` command with all flags and examples
2. **Pruning Philosophy Page** - A dedicated page explaining:
   - Why HZL isn't meant for long-term storage
   - When to prune (project wrapped up, quarterly cleanup, etc.)
   - What happens to pruned data (permanent deletion)
   - Best practices (review before pruning, use `--older-than` conservatively)
3. **Skills** - Update the Claude Code and Codex skills and OpenClaw skills to include information about this.

This helps users understand not just *how* to prune, but *when* and *why*.

## Open Questions (Resolved)

- ~~`--status` filter for specific terminal states?~~ → **Skip for v1**, can add later if needed
- ~~`--min-age` floor to prevent accidental pruning?~~ → **No** - existing safety layers (terminal state + age + confirmation + `--yes`) are sufficient
- ~~`--dry-run` for scripted preview?~~ → **Yes** - added for non-interactive preview workflows (e.g., CI checks)

## Next Steps

Run `/workflows:plan` for implementation details.
