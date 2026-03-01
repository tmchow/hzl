# Tag Chips + Tag-Based Filtering — Design

## Problem

Tags are stored in `task_tags`, indexed, queryable via `TagsProjector` — and invisible in the web UI. They aren't in the list API response. Users have been storing tag data they can't see or use in the dashboard.

Additionally, the card layout is too dense for the narrow column widths: the header stacks project name and progress vertically, blocked-by and lease rows add height, and "Unassigned" badges create visual noise.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tag chip colors | Deterministic hash-based | Stable colors, zero config, no new events |
| Tag filter semantics | OR (any match) | Matches user expectations, consistent with assignee filter |
| Tag swimlanes | Deferred | Ship chips + filter first, swimlanes are a follow-up |
| Blocked-by on card | Remove (modal only) | Column position already communicates blocked state |
| Lease timer on card | Remove (modal only) | Detail info, not glanceable |
| Unassigned badge | Hide when unassigned | Absence of badge is the signal |
| Tag filter UX | Single-select dropdown | Matches existing project/assignee pattern |
| Backend approach | Server-side filtering | Consistent with existing filters, uses indexed `task_tags` |

## Backend Changes

### 1. Add tags to `listTasks` query

JOIN `task_tags` via GROUP_CONCAT so each task row includes its tags:

```sql
LEFT JOIN (
  SELECT task_id, GROUP_CONCAT(tag) as tags
  FROM task_tags GROUP BY task_id
) tt ON tc.task_id = tt.task_id
```

Parse comma-separated string into `string[]` in the mapping layer.

### 2. Tag filter query parameter

`GET /api/tasks?tag=bug` filters using:

```sql
EXISTS (SELECT 1 FROM task_tags WHERE task_id = tc.task_id AND tag = ?)
```

Uses existing `idx_task_tags_tag` index.

### 3. New tags endpoint

`GET /api/tags` returns distinct tags with counts:

```json
[{ "tag": "bug", "count": 5 }, { "tag": "urgent", "count": 3 }]
```

### 4. Response shape

`TaskListItem` gains:

```typescript
tags: string[]  // e.g. ["bug", "urgent"]
```

## Card Layout Redesign

### Remove from cards

- Blocked-by row → modal only (show as clickable task titles)
- Lease timer row → modal only
- "Unassigned" badge → only show assignee when assigned
- Vertical stacking in header-right → flatten to single line

### Add to cards

- Tag chips below the title
- Progress as a thin bar below the header (replaces % badge in header-right)

### New card structure

```
┌──────────────────────────────┐
│ 🔧-3 01KJHVCN   project-name│  single-line header
│ ████████████████░░░░░░░ 75%  │  thin progress bar (only if > 0)
│ Task title here and it can   │
│ wrap to two lines            │  title (2-line clamp)
│ ● bug  ● urgent             │  tag chips (only if tags exist)
│ ▶ [3 subtasks]               │  subtask toggle (only if has subtasks)
│ agent-name                   │  assignee (only if assigned)
└──────────────────────────────┘
```

Every row below the title is conditional — a minimal task (no tags, no subtasks, unassigned) renders as just header + title.

### Tag chips spec

- Small colored dot + text, 11px font
- Color: deterministic hash of tag string → index into 8-color palette
- Max 3 visible, then "+N" overflow
- Inline layout, wrapping allowed

### Progress bar spec

- Full-width thin bar (3px height), rounded
- Track: `var(--bg-primary)`
- Fill: `var(--accent)` (amber), `var(--status-done)` (green) at 100%
- Percentage text right-aligned, 10px, same color as fill

### Column width

Bump `min-width` from 180px to 220px.

## Tag Filter in Filter Bar

- Dropdown matching existing project/assignee pattern
- Default: "All tags" (no filter)
- Lists tags alphabetically with counts: `bug (5)`, `urgent (3)`
- Populated from `GET /api/tags`
- Selecting a tag adds `?tag=<value>` to the API request
- Placement: after assignee filter, before search bar

## Modal Enhancements

### Blocked-by (moved from card)

- Display in modal info section as clickable task titles
- Clicking opens that task's modal
- Truncate long titles with ellipsis

### Lease timer (moved from card)

- Display in modal info section when task is in-progress with active lease
- Same `formatTimeRemaining` format, just relocated
