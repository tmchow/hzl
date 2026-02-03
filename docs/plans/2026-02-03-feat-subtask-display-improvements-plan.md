---
title: "feat: Subtask display improvements for web dashboard"
type: feat
date: 2026-02-03
brainstorm: docs/brainstorms/2026-02-03-subtask-display-brainstorm.md
---

# feat: Subtask display improvements for web dashboard

## Overview

Improve the hzl web dashboard to better visualize parent/child task relationships through:
1. Global toggle to show/hide subtasks
2. Emoji family indicators linking parents to children
3. Progress percentage badges on task cards
4. Consolidated settings gear menu

## Problem Statement

Currently, the Kanban board displays all tasks flat without visual indication of parent/child relationships. Users can't:
- Quickly identify which tasks are subtasks of a parent
- See only parent-level tasks for a summary view
- Track progress percentages at a glance

The header also has growing filter clutter (Date, Project, Refresh, Columns).

## Proposed Solution

### 1. Emoji Family System

Hash parent `task_id` to deterministically select an emoji from a curated pool (~50 geometric shapes). Children display the same emoji with a numeric suffix.

```
Parent:   🔷 Auth system refactor
Children: 🔷-1 Login flow
          🔷-2 OAuth setup
          🔷-3 Session management
```

**Why emoji**: Compact, memorable, scannable across columns. Parents and children can be in different status columns, so visual connectors don't work.

### 2. Global Subtask Toggle

Checkbox in gear menu: "Show subtasks" (default: ON)

When OFF:
- Hide all tasks where `parent_id !== null`
- Show `[N subtasks]` count badge on parent cards (server-calculated for accuracy)
- Column counts reflect only visible tasks

**Why server-side counts:** The dashboard has date/project filters. If children are filtered out but the parent is visible, client-side counting would show wrong numbers. Server calculates counts from the full dataset, ensuring accuracy regardless of active filters.

### 3. Progress Badge

Display task progress (0-100%) as text badge in card meta row.

```
┌─────────────────────┐
│ 🔷 a1b2c3d4         │
│ Auth system refactor│
│ myproject  35%  @bot│
└─────────────────────┘
```

- Show only when `progress !== null`
- No special styling for 100% (keep it simple)

### 4. Gear Menu

Replace inline Refresh selector and Columns button with single gear icon that opens dropdown containing:
- Refresh rate (1s, 2s, 5s, 10s, 30s)
- Column visibility checkboxes
- "Show subtasks" checkbox

Keep Date and Project filters inline as primary controls.

## Technical Approach

### Phase 1: Data Layer (hzl-core + hzl-web server)

**Files:**
- `packages/hzl-core/src/services/task-service.ts`
- `packages/hzl-web/src/server.ts`

**Changes:**

1. Extend `TaskListItem` interface to include `parent_id` and `progress`:

```typescript
// task-service.ts line ~121
export interface TaskListItem {
  task_id: string;
  title: string;
  project: string;
  status: TaskStatus;
  priority: number;
  assignee: string | null;
  lease_until: string | null;
  updated_at: string;
  parent_id: string | null;  // ADD
  progress: number | null;   // ADD
}
```

2. Update `listTasks()` to return `parent_id` and `progress` (already fetched, just not returned):

```typescript
// task-service.ts line ~1013-1022, add to return mapping
parent_id: row.parent_id,
progress: row.progress,
```

3. Add `getSubtaskCounts()` method to TaskService:

```typescript
// task-service.ts - new method
getSubtaskCounts(): Map<string, number> {
  const stmt = this.db.prepare(`
    SELECT parent_id, COUNT(*) as count
    FROM tasks_current
    WHERE parent_id IS NOT NULL
      AND status != 'archived'
    GROUP BY parent_id
  `);
  const rows = stmt.all() as Array<{ parent_id: string; count: number }>;
  return new Map(rows.map(r => [r.parent_id, r.count]));
}
```

**Note:** Uses `this.db` (not `this.cacheDb`) to match existing service methods like `listTasks()`.

**UX tradeoff:** Counts show total non-archived children regardless of date filter. When toggle is ON, only date-filtered children appear. This is intentional - the count represents the full family size, helping users understand scope even if some children are outside the current date view.

4. Extend `TaskListItemResponse` in server.ts and merge counts:

```typescript
// server.ts line ~33
interface TaskListItemResponse extends CoreTaskListItem {
  blocked_by: string[];
  parent_id: string | null;   // ADD
  progress: number | null;    // ADD
  subtask_count: number;      // ADD - server-calculated, always accurate
}

// In GET /api/tasks handler
const subtaskCounts = taskService.getSubtaskCounts();
const tasksWithCounts = rows.map(task => ({
  ...task,
  blocked_by: blockedByMap.get(task.task_id) || [],
  subtask_count: subtaskCounts.get(task.task_id) || 0,
}));
```

### Phase 2: UI - Gear Menu (index.html)

**Location:** `packages/hzl-web/src/ui/index.html`

1. **Add gear icon and dropdown** (after project filter, lines ~753):

```html
<div class="settings-group">
  <button class="settings-toggle" id="settingsToggle">
    <svg><!-- gear icon --></svg>
  </button>
  <div class="settings-dropdown" id="settingsDropdown">
    <div class="settings-section">
      <label class="settings-label">Refresh</label>
      <select id="refreshFilter"><!-- existing options --></select>
    </div>
    <div class="settings-section">
      <label class="settings-label">Columns</label>
      <!-- existing column checkboxes -->
    </div>
    <div class="settings-section">
      <label class="settings-checkbox">
        <input type="checkbox" id="showSubtasks" checked>
        Show subtasks
      </label>
    </div>
  </div>
</div>
```

2. **Remove inline Refresh and Columns** from header-filters

3. **Add CSS** for gear menu (reuse `.columns-dropdown` pattern):

```css
.settings-toggle {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 10px;
  cursor: pointer;
}

.settings-dropdown {
  position: absolute;
  right: 0;
  top: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  min-width: 200px;
  display: none;
}

.settings-dropdown.open { display: block; }
```

4. **Add toggle and click-outside handlers**:

```javascript
// Toggle handler
showSubtasksCheckbox.addEventListener('change', () => {
  savePreferences();
  renderBoard();
});

// Settings dropdown toggle
settingsToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsDropdown.classList.toggle('open');
});

// Click outside to close
document.addEventListener('click', (e) => {
  if (!settingsDropdown.contains(e.target) && !settingsToggle.contains(e.target)) {
    settingsDropdown.classList.remove('open');
  }
});

// Escape key to close
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    settingsDropdown.classList.remove('open');
  }
});
```

### Phase 3: UI - Emoji Family Indicators (index.html)

1. **Define emoji pool** (~50 geometric shapes):

```javascript
const FAMILY_EMOJIS = [
  '🔷', '🔶', '🔴', '🟢', '🔵', '🟡', '🟣', '🟠',
  '⬛', '⬜', '🔳', '🔲', '▪️', '▫️', '◾', '◽',
  '💠', '🔹', '🔸', '♦️', '♠️', '♣️', '♥️', '🃏',
  '⭐', '🌟', '✨', '💫', '🔆', '🔅', '☀️', '🌙',
  '🎯', '🎪', '🎨', '🎭', '🎬', '🎮', '🎲', '🎸',
  '🔑', '🔐', '🔒', '🔓', '🗝️', '⚡', '💡', '🔔'
];
```

2. **Hash function for deterministic emoji** (djb2 for better distribution):

```javascript
function getTaskEmoji(taskId) {
  // djb2 hash - better distribution than simple char code sum
  let hash = 5381;
  for (let i = 0; i < taskId.length; i++) {
    hash = ((hash << 5) + hash) ^ taskId.charCodeAt(i);
  }
  return FAMILY_EMOJIS[Math.abs(hash) % FAMILY_EMOJIS.length];
}
```

3. **Build emoji map and assign suffixes**:

```javascript
function buildEmojiMap(tasks) {
  // Build set of known task IDs for orphan detection
  const taskIds = new Set(tasks.map(t => t.task_id));

  // Group children by parent for suffix ordering
  const childrenByParent = new Map();

  for (const task of tasks) {
    if (task.parent_id && taskIds.has(task.parent_id)) {
      // Only group if parent exists in current task set
      if (!childrenByParent.has(task.parent_id)) {
        childrenByParent.set(task.parent_id, []);
      }
      childrenByParent.get(task.parent_id).push(task);
    }
  }

  // Sort children by task_id for stable suffix ordering
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a.task_id.localeCompare(b.task_id));
  }

  // Build emoji assignments
  const emojiMap = new Map(); // task_id -> { emoji, suffix }

  for (const task of tasks) {
    if (task.parent_id && taskIds.has(task.parent_id)) {
      // Child with valid parent: use parent's emoji with suffix
      const emoji = getTaskEmoji(task.parent_id);
      const siblings = childrenByParent.get(task.parent_id) || [];
      const suffix = siblings.indexOf(task) + 1;
      emojiMap.set(task.task_id, { emoji, suffix });
    } else {
      // Parent, standalone, or orphaned subtask: use own emoji, no suffix
      emojiMap.set(task.task_id, { emoji: getTaskEmoji(task.task_id), suffix: null });
    }
  }

  return emojiMap;
}
```

Note: Subtask counts come from the server (`task.subtask_count`), so the client doesn't need to calculate them. This ensures counts are accurate even when children are filtered out by date.

### Phase 4: UI - Card Rendering (index.html)

**Location:** `renderCard()` function, lines 1261-1285

1. **Update card rendering** to include emoji and progress:

```javascript
function renderCard(task, emojiInfo, showSubtasks) {
  const { emoji, suffix } = emojiInfo || { emoji: null, suffix: null };

  // Build emoji indicator
  let emojiHtml = '';
  if (emoji) {
    emojiHtml = suffix
      ? `<span class="card-emoji">${emoji}-${suffix}</span>`
      : `<span class="card-emoji">${emoji}</span>`;
  }

  // Build subtask count (only for parents when subtasks hidden)
  // Uses task.subtask_count from API (server-calculated)
  let subtaskHtml = '';
  if (!showSubtasks && task.subtask_count > 0) {
    const label = task.subtask_count === 1 ? 'subtask' : 'subtasks';
    subtaskHtml = `<span class="card-subtask-count">[${task.subtask_count} ${label}]</span>`;
  }

  // Build progress badge
  let progressHtml = '';
  if (task.progress !== null && task.progress !== undefined) {
    progressHtml = `<span class="card-progress">${task.progress}%</span>`;
  }

  return `
    <div class="card" data-id="${task.task_id}" data-status="${displayStatus}">
      <div class="card-header">
        ${emojiHtml}
        <span class="card-id">${task.task_id.slice(0, 8)}</span>
      </div>
      <div class="card-title">${task.title}</div>
      ${subtaskHtml}
      <div class="card-meta">
        <span class="card-project">${task.project}</span>
        ${progressHtml}
        ${task.assignee ? `<span class="card-agent">@${task.assignee.slice(0, 8)}</span>` : ''}
      </div>
      ${blockedHtml}
      ${leaseHtml}
    </div>
  `;
}
```

2. **Add CSS for new elements**:

```css
.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.card-emoji {
  font-size: 14px;
}

.card-subtask-count {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin: 4px 0;
}

.card-progress {
  font-size: 11px;
  color: var(--accent);
  background: rgba(245, 158, 11, 0.15);
  padding: 2px 6px;
  border-radius: 3px;
}

/* Mobile: ensure emoji doesn't wrap awkwardly */
@media (max-width: 768px) {
  .card-header {
    flex-wrap: nowrap;
  }
  .card-emoji {
    flex-shrink: 0;
  }
}
```

### Phase 5: UI - Subtask Filtering (index.html)

**Location:** `renderBoard()` function

1. **Filter tasks based on toggle**:

```javascript
function renderBoard() {
  const showSubtasks = document.getElementById('showSubtasks').checked;
  const emojiMap = buildEmojiMap(tasks);

  // Filter tasks if subtasks are hidden
  let visibleTasks = tasks;
  if (!showSubtasks) {
    visibleTasks = tasks.filter(t => !t.parent_id);
  }

  // Group by status and render
  for (const status of visibleStatuses) {
    const columnTasks = visibleTasks.filter(t => t.status === status);

    for (const task of columnTasks) {
      const emojiInfo = emojiMap.get(task.task_id);
      // subtask_count comes from API, no client calculation needed
      const cardHtml = renderCard(task, emojiInfo, showSubtasks);
      // ... append to column
    }

    // Update column count
    columnHeader.querySelector('.column-count').textContent = columnTasks.length;
  }
}
```

### Phase 6: Preferences Persistence (index.html)

**Location:** `loadPreferences()` and `savePreferences()` functions

1. **Extend preferences object**:

```javascript
// In loadPreferences()
if (saved.showSubtasks !== undefined) {
  document.getElementById('showSubtasks').checked = saved.showSubtasks;
}

// In savePreferences()
const prefs = {
  dateFilter: dateFilter.value,
  projectFilter: projectFilter.value,
  refreshFilter: refreshFilter.value,
  columnVisibility: [...],
  activeView: activeView,
  showSubtasks: document.getElementById('showSubtasks').checked  // ADD
};
```

## Acceptance Criteria

### Functional Requirements

- [x] Gear icon opens dropdown with Refresh, Columns, and Subtasks settings
- [x] "Show subtasks" checkbox toggles visibility of child tasks globally
- [x] Parent tasks display emoji indicator (deterministic from task_id hash)
- [x] Child tasks display parent's emoji with `-N` suffix (e.g., 🔷-1, 🔷-2)
- [x] Standalone tasks display emoji (no suffix)
- [x] When subtasks hidden, parent cards show `[N subtasks]` count
- [x] Progress badge shows percentage when `progress` is not null
- [x] All preferences persist across page refreshes via localStorage

### Non-Functional Requirements

- [x] Emoji assignment is deterministic (same task always gets same emoji)
- [x] Child suffix ordering is stable (based on task_id sort)
- [x] No performance regression with 500+ tasks
- [x] Mobile layout maintains usability

### Quality Gates

- [x] Unit test for `getSubtaskCounts()` in task-service.test.ts
- [x] Unit test for `listTasks()` returning parent_id and progress
- [ ] Manual testing on desktop Chrome, Firefox, Safari
- [ ] Manual testing on mobile viewport
- [ ] Verify localStorage persistence works correctly
- [ ] Verify emoji hash distribution (spot check different task IDs)

## Implementation Order

1. **Data layer** (task-service.ts) - expose parent_id, progress in listTasks; add getSubtaskCounts() method
2. **Build** - Run `pnpm build` to compile hzl-core changes before hzl-web can use them
3. **Server layer** (server.ts) - merge subtask_count into API response
4. **Gear menu UI** - HTML/CSS/JS for settings dropdown
5. **Emoji system** - hash function, emoji map builder
6. **Card rendering** - add emoji, progress, subtask count to cards
7. **Subtask filtering** - toggle logic in renderBoard
8. **Preferences** - persist showSubtasks setting

**Build note:** After modifying `TaskListItem` interface in hzl-core, run `pnpm build` before testing hzl-web to ensure the server picks up the updated types.

## Files to Modify

| File | Changes |
|------|---------|
| `packages/hzl-core/src/services/task-service.ts` | Add parent_id, progress to TaskListItem; add getSubtaskCounts() method |
| `packages/hzl-web/src/server.ts` | Extend TaskListItemResponse with parent_id, progress, subtask_count; merge counts |
| `packages/hzl-web/src/ui/index.html` | Gear menu, emoji system, card rendering, filtering, preferences |

## Edge Cases Handled

| Case | Behavior |
|------|----------|
| Task with no parent, no children | Shows emoji from own task_id, no suffix |
| Parent with 0 children | Shows emoji, no subtask badge (subtask_count = 0) |
| Orphaned subtask (parent deleted) | Treat as standalone (parent_id ignored if not found) |
| Progress is null | No progress badge shown |
| Progress is 0 | Shows "0%" badge |
| Progress is 100 | Shows "100%" badge (no special styling) |
| Two parents hash to same emoji | Acceptable - rare with 48 emoji pool |
| Children filtered by date but parent visible | Count still accurate (server calculates from full dataset) |

## Out of Scope

- Per-column subtask filtering
- Visual connectors between parent/child
- Drag-and-drop reparenting
- Auto-calculated parent progress from children
- Graph view changes (already handles hierarchy)

## References

- Brainstorm: `docs/brainstorms/2026-02-03-subtask-display-brainstorm.md`
- Card rendering: `packages/hzl-web/src/ui/index.html:1261-1285`
- Preferences: `packages/hzl-web/src/ui/index.html:917-951`
- Task service: `packages/hzl-core/src/services/task-service.ts:983-1023`
