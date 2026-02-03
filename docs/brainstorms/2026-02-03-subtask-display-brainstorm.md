# Subtask Display Improvements - Brainstorm

**Date:** 2026-02-03
**Status:** Ready for planning

## What We're Building

Improve the hzl web dashboard to better handle parent/child task relationships:

1. **Subtask toggle** - Global toggle to show/hide child tasks, allowing users to see only parent tasks or standalone tasks
2. **Parent indicator** - Visual indicator on child tasks showing which parent they belong to using deterministic emoji families
3. **Progress display** - Show task progress (0-100%) as a text badge on cards
4. **Settings consolidation** - Move less-used settings into a gear menu to reduce header clutter

## Why This Approach

### Emoji Family System for Parent/Child

**Problem:** Parent and child tasks can be in different columns (parent in-progress, children spread across done/blocked/ready), so visual connectors don't work. Parent names can be long, and task IDs aren't memorable.

**Solution:** Hash the parent task_id to deterministically select an emoji from a curated list (~50 distinct emojis). Children display the same emoji with a suffix number.

- Parent: 🔷
- Children: 🔷-1, 🔷-2, 🔷-3

**Why this works:**
- Deterministic: Same parent always gets same emoji across refreshes
- Scannable: Easy to visually find related tasks across columns
- Compact: Doesn't require space for truncated names
- Memorable: Emojis are more recognizable than IDs

**Tradeoff accepted:** Rare hash collisions (two parents get same emoji) are acceptable with 50+ emoji pool.

### Global Subtask Toggle

When hidden, subtasks disappear from ALL columns. Parent tasks show a count badge: `[3 subtasks]`.

**Why global:** Simpler mental model than per-column toggles. Users either want the full picture or the summary view.

### Settings Consolidation

Move Refresh rate, Columns toggle, and new Subtask toggle into a gear icon dropdown menu. Keep Date and Project filters inline as primary controls.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Parent indicator format | Emoji + dash-number (🔷-1) | Readable, compact, deterministic via hash |
| Emoji assignment | Hash parent task_id → emoji index | Consistent across sessions without storage |
| Toggle scope | Global (all columns) | Simpler UX, clear mental model |
| Hidden subtask indicator | Count only `[3 subtasks]` | Clean, non-cluttered |
| Progress display | Text badge near status (e.g., "45%") | Unobtrusive, consistent with existing badges |
| Settings location | Gear icon menu | Reduces header clutter, groups view settings |

## Scope

### In Scope
- Subtask show/hide toggle in gear menu
- Emoji family indicators on child task cards
- Subtask count on parent cards when children hidden
- Progress percentage badge on task cards
- Gear icon settings menu (Refresh, Columns, Subtasks)
- LocalStorage persistence for new preferences

### Out of Scope
- Per-column subtask filtering
- Parent/child visual connectors
- Drag-and-drop reparenting
- Nested subtasks (already limited to 1 level)

## Open Questions

None - ready to proceed to planning.

## Visual Mockup (ASCII)

```
┌─────────────────────────────────────────────────────────────┐
│  HZL Dashboard    [Date ▼] [Project ▼]              ⚙️     │
│                                                    ┌──────┐│
│                                                    │Refresh│
│                                                    │Columns│
│                                                    │☑ Show │
│                                                    │subtasks│
│                                                    └──────┘│
├─────────────────────────────────────────────────────────────┤
│  READY (3)          │  IN PROGRESS (2)  │  DONE (4)        │
├─────────────────────┼───────────────────┼──────────────────┤
│ ┌─────────────────┐ │ ┌───────────────┐ │ ┌──────────────┐ │
│ │ a1b2c3d4        │ │ │ 🔷 c3d4e5f6   │ │ │ 🔷-1 x1y2z3  │ │
│ │ Query perf fix  │ │ │ Auth system   │ │ │ Login flow   │ │
│ │ myproject       │ │ │ myproject 35% │ │ │ myproject    │ │
│ │ [3 subtasks]    │ │ │ @agent-1      │ │ └──────────────┘ │
│ └─────────────────┘ │ └───────────────┘ │ ┌──────────────┐ │
│ ┌─────────────────┐ │ ┌───────────────┐ │ │ 🔷-2 y2z3a4  │ │
│ │ 🔶-1 b2c3d4e5   │ │ │ 🔶 d4e5f6g7  │ │ │ OAuth setup  │ │
│ │ Add caching     │ │ │ API refactor  │ │ │ myproject    │ │
│ │ myproject       │ │ │ myproject 60% │ │ └──────────────┘ │
│ └─────────────────┘ │ └───────────────┘ │                  │
└─────────────────────┴───────────────────┴──────────────────┘

Legend:
- 🔷, 🔶 = Parent emoji (hashed from task_id)
- 🔷-1, 🔷-2 = Child tasks of 🔷 parent
- 35%, 60% = Progress indicator
- [3 subtasks] = Hidden children count (when toggle off)
```

## Next Steps

Run `/workflows:plan` to create implementation plan.
