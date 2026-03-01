# Tag Chips + Tag-Based Filtering — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface tags in the web dashboard — render tag chips on cards, add a tag filter dropdown, and redesign the card layout for clarity.

**Architecture:** Backend-first approach. Add tags to the `listTasks` SQL query via JOIN, expose through the existing `/api/tasks` endpoint, add a `/api/tags` endpoint for the filter dropdown, then update the frontend card component and filter bar. Also move blocked-by and lease info from cards to the modal.

**Tech Stack:** TypeScript, SQLite (better-sqlite3/libsql), React, Vitest

---

### Task 1: Add tags to `listTasks` query in hzl-core

**Files:**
- Modify: `packages/hzl-core/src/services/task-service.ts:150-164` (TaskListItem interface)
- Modify: `packages/hzl-core/src/services/task-service.ts:1269-1293` (listTasks method)
- Test: `packages/hzl-core/src/services/task-service.test.ts`

**Step 1: Write the failing test**

In `task-service.test.ts`, add a test that creates a task with tags and asserts `listTasks()` returns them:

```typescript
it('listTasks includes tags', () => {
  taskService.createTask({ title: 'Tagged task', project: 'test-project', tags: ['bug', 'urgent'] });
  const tasks = taskService.listTasks({ sinceDays: 7 });
  const found = tasks.find((t) => t.title === 'Tagged task');
  expect(found).toBeDefined();
  expect(found!.tags).toEqual(['bug', 'urgent']);
});

it('listTasks returns empty tags array for untagged tasks', () => {
  taskService.createTask({ title: 'No tags', project: 'test-project' });
  const tasks = taskService.listTasks({ sinceDays: 7 });
  const found = tasks.find((t) => t.title === 'No tags');
  expect(found).toBeDefined();
  expect(found!.tags).toEqual([]);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter hzl-core test src/services/task-service.test.ts -- --grep "listTasks includes tags"`
Expected: FAIL — `tags` property doesn't exist on `TaskListItem`

**Step 3: Add `tags` to `TaskListItem` interface and `listTasks` query**

In `task-service.ts`, add `tags: string[]` to the `TaskListItem` interface (line ~163).

Modify the `listTasks` SQL query to LEFT JOIN `task_tags`:

```sql
SELECT tc.task_id, tc.title, tc.project, tc.status, tc.priority,
       tc.agent, tc.progress, tc.lease_until, tc.updated_at,
       tc.parent_id, tc.due_at,
       COALESCE(tt.tags, '') as tags_csv
FROM tasks_current tc
LEFT JOIN (
  SELECT task_id, GROUP_CONCAT(tag) as tags
  FROM task_tags GROUP BY task_id
) tt ON tc.task_id = tt.task_id
WHERE ${conditions.join(' AND ')}
ORDER BY priority DESC, updated_at DESC
```

In the row mapping, parse `tags_csv`:

```typescript
tags: row.tags_csv ? (row.tags_csv as string).split(',') : [],
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter hzl-core test src/services/task-service.test.ts -- --grep "listTasks includes tags"`
Expected: PASS

**Step 5: Run full test suite for hzl-core**

Run: `pnpm --filter hzl-core test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add packages/hzl-core/src/services/task-service.ts packages/hzl-core/src/services/task-service.test.ts
git commit -m "feat(core): include tags in listTasks response"
```

---

### Task 2: Add tag filter parameter to `listTasks`

**Files:**
- Modify: `packages/hzl-core/src/services/task-service.ts:1232-1293` (listTasks method)
- Test: `packages/hzl-core/src/services/task-service.test.ts`

**Step 1: Write the failing test**

```typescript
it('listTasks filters by tag', () => {
  taskService.createTask({ title: 'Bug task', project: 'test-project', tags: ['bug'] });
  taskService.createTask({ title: 'Feature task', project: 'test-project', tags: ['feature'] });
  taskService.createTask({ title: 'Both', project: 'test-project', tags: ['bug', 'feature'] });

  const bugTasks = taskService.listTasks({ sinceDays: 7, tag: 'bug' });
  expect(bugTasks.map((t) => t.title).sort()).toEqual(['Both', 'Bug task']);

  const featureTasks = taskService.listTasks({ sinceDays: 7, tag: 'feature' });
  expect(featureTasks.map((t) => t.title).sort()).toEqual(['Both', 'Feature task']);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter hzl-core test src/services/task-service.test.ts -- --grep "listTasks filters by tag"`
Expected: FAIL — `tag` option not recognized

**Step 3: Add `tag` option to `listTasks`**

Add `tag?: string` to the `listTasks` options type. When provided, add an SQL condition:

```typescript
if (tag) {
  conditions.push('EXISTS (SELECT 1 FROM task_tags WHERE task_id = tc.task_id AND tag = ?)');
  params.push(tag);
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter hzl-core test src/services/task-service.test.ts -- --grep "listTasks filters by tag"`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/services/task-service.ts packages/hzl-core/src/services/task-service.test.ts
git commit -m "feat(core): add tag filter to listTasks"
```

---

### Task 3: Add `getTagCounts` method to TaskService

**Files:**
- Modify: `packages/hzl-core/src/services/task-service.ts` (add new method near `getBlockedByMap`)
- Test: `packages/hzl-core/src/services/task-service.test.ts`

**Step 1: Write the failing test**

```typescript
it('getTagCounts returns distinct tags with counts', () => {
  taskService.createTask({ title: 'A', project: 'test-project', tags: ['bug', 'urgent'] });
  taskService.createTask({ title: 'B', project: 'test-project', tags: ['bug'] });
  taskService.createTask({ title: 'C', project: 'test-project', tags: ['feature'] });

  const counts = taskService.getTagCounts();
  expect(counts).toEqual([
    { tag: 'bug', count: 2 },
    { tag: 'feature', count: 1 },
    { tag: 'urgent', count: 1 },
  ]);
});

it('getTagCounts excludes archived tasks', () => {
  const id = taskService.createTask({ title: 'A', project: 'test-project', tags: ['old'] });
  taskService.claimTask(id);
  taskService.completeTask(id);
  taskService.archiveTask(id);

  const counts = taskService.getTagCounts();
  expect(counts.find((c) => c.tag === 'old')).toBeUndefined();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter hzl-core test src/services/task-service.test.ts -- --grep "getTagCounts"`
Expected: FAIL — method not defined

**Step 3: Implement `getTagCounts`**

Add the method to `TaskService`:

```typescript
getTagCounts(): Array<{ tag: string; count: number }> {
  return this.db.prepare(`
    SELECT tt.tag, COUNT(*) as count
    FROM task_tags tt
    JOIN tasks_current tc ON tt.task_id = tc.task_id
    WHERE tc.status != 'archived'
    GROUP BY tt.tag
    ORDER BY tt.tag
  `).all() as Array<{ tag: string; count: number }>;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter hzl-core test src/services/task-service.test.ts -- --grep "getTagCounts"`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/services/task-service.ts packages/hzl-core/src/services/task-service.test.ts
git commit -m "feat(core): add getTagCounts method"
```

---

### Task 4: Wire tags into the web server API

**Files:**
- Modify: `packages/hzl-web/src/server.ts:41-45` (TaskListItemResponse interface)
- Modify: `packages/hzl-web/src/server.ts:211-264` (handleTasks function)
- Modify: `packages/hzl-web/src/server.ts:548-603` (route matching, add /api/tags)
- Test: `packages/hzl-web/src/server.test.ts`

**Step 1: Write the failing tests**

In `server.test.ts`, add:

```typescript
it('GET /api/tasks includes tags in response', async () => {
  taskService.createTask({ title: 'Tagged', project: 'test-project', tags: ['bug', 'urgent'] });
  const s = createServer(4570);
  await new Promise((r) => setTimeout(r, 20));
  const { data } = await fetchJson('/api/tasks?since=30d');
  const tasks = (data as { tasks: Array<{ title: string; tags: string[] }> }).tasks;
  const found = tasks.find((t) => t.title === 'Tagged');
  expect(found?.tags).toEqual(['bug', 'urgent']);
});

it('GET /api/tasks filters by tag', async () => {
  taskService.createTask({ title: 'Bug', project: 'test-project', tags: ['bug'] });
  taskService.createTask({ title: 'Feature', project: 'test-project', tags: ['feature'] });
  const s = createServer(4571);
  await new Promise((r) => setTimeout(r, 20));
  const { data } = await fetchJson('/api/tasks?since=30d&tag=bug');
  const tasks = (data as { tasks: Array<{ title: string }> }).tasks;
  expect(tasks.map((t) => t.title)).toEqual(['Bug']);
});

it('GET /api/tags returns tag counts', async () => {
  taskService.createTask({ title: 'A', project: 'test-project', tags: ['bug', 'urgent'] });
  taskService.createTask({ title: 'B', project: 'test-project', tags: ['bug'] });
  const s = createServer(4572);
  await new Promise((r) => setTimeout(r, 20));
  const { data } = await fetchJson('/api/tags');
  expect(data).toEqual({ tags: [{ tag: 'bug', count: 2 }, { tag: 'urgent', count: 1 }] });
});
```

**Important:** The server test's `beforeEach` does NOT register `TagsProjector`. Add it:

```typescript
import { TagsProjector } from 'hzl-core/projections/tags';
// In beforeEach, add:
projectionEngine.register(new TagsProjector());
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter hzl-web test -- --grep "tags"`
Expected: FAIL

**Step 3: Implement the server changes**

1. Update `TaskListItemResponse` (line ~41) to add `tags: string[]`.

2. In `handleTasks` (line ~211), read `tag` from params:
   ```typescript
   const tag = params.get('tag') || undefined;
   ```
   Pass `tag` to `taskService.listTasks(...)`.

3. In the response mapping (line ~256), the `tags` field will already come from the core `listTasks` return value since we added it in Task 1. Just ensure the spread `...row` includes it.

4. Add a `handleTags` route handler:
   ```typescript
   function handleTags(res: ServerResponse): void {
     const tags = taskService.getTagCounts();
     json(res, { tags });
   }
   ```

5. Add route matching (before the catch-all at line ~599):
   ```typescript
   if (pathname === '/api/tags') {
     handleTags(res);
     return;
   }
   ```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter hzl-web test -- --grep "tags"`
Expected: PASS

**Step 5: Run full web test suite**

Run: `pnpm --filter hzl-web test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add packages/hzl-web/src/server.ts packages/hzl-web/src/server.test.ts
git commit -m "feat(web): wire tags into API responses and add /api/tags endpoint"
```

---

### Task 5: Update frontend types and data hook for tags

**Files:**
- Modify: `packages/hzl-web/src/app/hooks/useTasks.ts:5-9` (UseTasksOptions)
- Modify: `packages/hzl-web/src/app/hooks/useTasks.ts:24-28` (refresh callback params)

The `TaskListItem` type in `packages/hzl-web/src/app/api/types.ts` already has `tags: string[]` (line 10), so no change needed there.

**Step 1: Add `tag` to `UseTasksOptions` and pass it through**

In `useTasks.ts`, add `tag?: string` to `UseTasksOptions` (line ~8).

In the `refresh` callback, add:
```typescript
if (tag) params.tag = tag;
```

And add `tag` to the `useCallback` dependency array.

**Step 2: Verify build**

Run: `pnpm --filter hzl-web build`
Expected: Builds successfully

**Step 3: Commit**

```bash
git add packages/hzl-web/src/app/hooks/useTasks.ts
git commit -m "feat(web): pass tag filter through useTasks hook"
```

---

### Task 6: Add tag filter state and dropdown to the frontend

**Files:**
- Modify: `packages/hzl-web/src/app/App.tsx` (add tag state, tagOptions computation, pass to FilterBar)
- Modify: `packages/hzl-web/src/app/components/Filters/FilterBar.tsx` (add tag dropdown)
- Modify: `packages/hzl-web/src/app/hooks/useUrlState.ts` (add tag to URL state)
- Modify: `packages/hzl-web/src/app/hooks/usePreferences.ts` (add tagFilter to prefs)
- Modify: `packages/hzl-web/src/app/App.css` (add #tagFilter min-width)

**Step 1: Add `tag` to URL state and preferences**

In `useUrlState.ts`:
- Add `tag?: string` to `UrlState` interface (line ~17)
- Parse it in `parseUrlState()` (after the assignee block ~line 39):
  ```typescript
  const tag = params.get('tag');
  if (tag !== null) state.tag = tag;
  ```
- Add `tag: string` to `SyncUrlStateParams` (line ~79)
- In `syncUrlState`, add: `if (state.tag) params.set('tag', state.tag);`

In `usePreferences.ts`:
- Add `tagFilter: string` to `DashboardPrefs` (line ~14)
- Add `tagFilter: ''` to `DEFAULT_PREFS` (line ~28)

**Step 2: Add tag filter state and API call to App.tsx**

In `App.tsx`:
- Add state: `const [tag, setTag] = useState(initialUrl.tag ?? initialPrefs.tagFilter ?? '');`
- Add `tag` to the `useTasks` call: `useTasks({ since: ..., project: ..., dueMonth, tag: tag || undefined })`
- Add a `tagOptions` computation (similar pattern to `assigneeOptions`):
  ```typescript
  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (t.tags) {
        for (const tag of t.tags) {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({ name, count }));
  }, [tasks]);
  ```
- Pass `tags`, `tag`, and `onTagChange` to `FilterBar`
- Add `tag` to `persistPrefs` as `tagFilter: tag`
- Add `tag` to `syncUrlState` params

**Step 3: Add tag dropdown to FilterBar**

In `FilterBar.tsx`:
- Add to props interface:
  ```typescript
  tags: Array<{ name: string; count: number }>;
  tag: string;
  onTagChange: (value: string) => void;
  ```
- Add a `<select>` dropdown after the assignee filter (line ~118), before the search bar:
  ```tsx
  <div className="filter-group">
    <select id="tagFilter" value={tag} onChange={(e) => onTagChange(e.target.value)}>
      <option value="">All tags</option>
      {tags.map((t) => (
        <option key={t.name} value={t.name}>{t.name} ({t.count})</option>
      ))}
    </select>
  </div>
  ```

In `App.css`, add: `#tagFilter { min-width: 150px; }` (near line ~102 with other filter min-widths).

**Step 4: Verify build and smoke test**

Run: `pnpm --filter hzl-web build && pnpm --filter hzl-cli build`
Start server: `node packages/hzl-cli/dist/cli.js serve`
Open dashboard, verify the tag dropdown appears in the filter bar.

**Step 5: Commit**

```bash
git add packages/hzl-web/src/app/App.tsx packages/hzl-web/src/app/components/Filters/FilterBar.tsx \
  packages/hzl-web/src/app/hooks/useUrlState.ts packages/hzl-web/src/app/hooks/usePreferences.ts \
  packages/hzl-web/src/app/App.css
git commit -m "feat(web): add tag filter dropdown to filter bar"
```

---

### Task 7: Redesign card layout — flatten header, progress bar, remove clutter

**Files:**
- Modify: `packages/hzl-web/src/app/components/Card/Card.tsx` (restructure JSX)
- Modify: `packages/hzl-web/src/app/App.css:440-595` (card CSS)

**Step 1: Update Card.tsx**

Remove from the card:
- The `card-blocked` section (lines 101-105)
- The `card-lease` section (lines 106-110)
- The "Unassigned" state — only render assignee when `hasAssignee` is true

Flatten the header:
- Change `card-header-right` from vertical stacking to single line
- Move progress out of the header entirely into its own progress bar row

Add progress bar below header (only when `progress > 0`):
```tsx
{task.progress != null && task.progress > 0 && (
  <div className="card-progress-bar">
    <div
      className={`card-progress-fill${task.progress >= 100 ? ' complete' : ''}`}
      style={{ width: `${Math.min(task.progress, 100)}%` }}
    />
    <span className={`card-progress-label${task.progress >= 100 ? ' complete' : ''}`}>
      {task.progress}%
    </span>
  </div>
)}
```

New card structure:
```tsx
<div className={`card${isParentTask ? ' card-parent' : ''}`} style={parentStyle} onClick={...}>
  <div className="card-header">
    <div className="card-header-left">
      {emoji} <span className="card-id">{shortId}</span>
    </div>
    <span className="card-project" title={task.project}>{task.project}</span>
  </div>
  {/* Progress bar - only if progress > 0 */}
  {progressBar}
  <div className="card-title">{task.title}</div>
  {/* Tags - Task 8 will add this */}
  {/* Subtask toggle - unchanged */}
  {subtaskSection}
  {/* Assignee - only when assigned */}
  {hasAssignee && (
    <div className="card-meta">
      <span className="card-assignee assigned" title={assigneeText}>{assigneeCardText}</span>
    </div>
  )}
</div>
```

**Step 2: Update CSS**

Change `.card-header-right` to no longer stack vertically:
```css
.card-header-right {
  /* Remove: flex-direction: column; */
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-shrink: 0;
}
```

Remove `.card-progress` badge styles (replaced by bar). Remove `.card-blocked` and `.card-lease` styles.

Add progress bar styles:
```css
.card-progress-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.card-progress-bar::before {
  content: '';
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: var(--bg-primary);
}

.card-progress-fill {
  height: 3px;
  border-radius: 2px;
  background: var(--accent);
  position: absolute;
}

.card-progress-fill.complete {
  background: var(--status-done);
}

.card-progress-label {
  font-size: 10px;
  color: var(--accent);
  flex-shrink: 0;
}

.card-progress-label.complete {
  color: var(--status-done);
}
```

Actually, for the progress bar, use a simpler structure:
```css
.card-progress-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 3px;
  margin-bottom: 6px;
  position: relative;
}

.card-progress-track {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: var(--bg-primary);
  overflow: hidden;
}

.card-progress-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
  transition: width 0.3s;
}

.card-progress-fill.complete {
  background: var(--status-done);
}

.card-progress-label {
  font-size: 10px;
  color: var(--accent);
  flex-shrink: 0;
  line-height: 1;
}

.card-progress-label.complete {
  color: var(--status-done);
}
```

And adjust the progress bar JSX:
```tsx
{task.progress != null && task.progress > 0 && (
  <div className="card-progress-row">
    <div className="card-progress-track">
      <div
        className={`card-progress-fill${task.progress >= 100 ? ' complete' : ''}`}
        style={{ width: `${Math.min(task.progress, 100)}%` }}
      />
    </div>
    <span className={`card-progress-label${task.progress >= 100 ? ' complete' : ''}`}>
      {task.progress}%
    </span>
  </div>
)}
```

Bump column min-width:
```css
.column {
  flex: 1 1 220px;
  min-width: 220px;  /* was 180px */
  max-width: 320px;
}
```

**Step 3: Verify build and visual check**

Run: `pnpm --filter hzl-web build && pnpm --filter hzl-cli build`
Start server and visually verify cards look correct.

**Step 4: Commit**

```bash
git add packages/hzl-web/src/app/components/Card/Card.tsx packages/hzl-web/src/app/App.css
git commit -m "feat(web): redesign card layout with progress bar, remove clutter"
```

---

### Task 8: Add tag chips to cards

**Files:**
- Modify: `packages/hzl-web/src/app/components/Card/Card.tsx` (add tag chips section)
- Create: `packages/hzl-web/src/app/utils/tag-color.ts` (deterministic color hash)
- Modify: `packages/hzl-web/src/app/App.css` (tag chip styles)

**Step 1: Create the tag color utility**

Create `packages/hzl-web/src/app/utils/tag-color.ts`:

```typescript
const TAG_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
];

export function getTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}
```

**Step 2: Add tag chips to Card.tsx**

After the `card-title` div and before the subtask section, add:

```tsx
{task.tags && task.tags.length > 0 && (
  <div className="card-tags">
    {task.tags.slice(0, 3).map((tag) => (
      <span key={tag} className="card-tag" style={{ '--tag-color': getTagColor(tag) } as React.CSSProperties}>
        {tag}
      </span>
    ))}
    {task.tags.length > 3 && (
      <span className="card-tag-overflow">+{task.tags.length - 3}</span>
    )}
  </div>
)}
```

Import `getTagColor` from the new utility.

**Step 3: Add CSS for tag chips**

```css
.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}

.card-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--tag-color) 15%, transparent);
  color: var(--tag-color);
  white-space: nowrap;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-tag::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tag-color);
  flex-shrink: 0;
}

.card-tag-overflow {
  font-size: 10px;
  color: var(--text-muted);
  padding: 1px 4px;
}
```

**Step 4: Verify build and visual check**

Run: `pnpm --filter hzl-web build && pnpm --filter hzl-cli build`
Create a task with tags via CLI, start server, verify chips render on the card.

**Step 5: Commit**

```bash
git add packages/hzl-web/src/app/utils/tag-color.ts packages/hzl-web/src/app/components/Card/Card.tsx \
  packages/hzl-web/src/app/App.css
git commit -m "feat(web): render tag chips on task cards"
```

---

### Task 9: Enhance modal — blocked-by with clickable titles, lease info

**Files:**
- Modify: `packages/hzl-web/src/app/components/TaskModal/TaskModal.tsx:176-181` (blocked-by section)
- Modify: `packages/hzl-web/src/app/components/TaskModal/TaskModal.css` (blocked-by styles)
- Modify: `packages/hzl-web/src/server.ts` (handleTaskDetail — enrich blocked_by with titles)

**Step 1: Enrich blocked_by in the API response**

Currently `blocked_by` in the task detail response is `string[]` (raw IDs). We need to return objects with ID + title for the modal to display clickable titles.

In `server.ts`, the `handleTaskDetail` function (line ~266) returns `blocked_by` as an array of IDs. Modify to look up task titles:

```typescript
// In handleTaskDetail, after getting the task detail:
const blockedByItems = (task.blocked_by || []).map((id: string) => {
  try {
    const dep = taskService.getTask(id);
    return { task_id: id, title: dep?.title || id };
  } catch {
    return { task_id: id, title: id };
  }
});
```

Return `blocked_by: blockedByItems` instead of the raw array.

Update `TaskDetailResponse` in `server.ts` (line ~65) to:
```typescript
blocked_by: Array<{ task_id: string; title: string }>;
```

Update the frontend `TaskDetail` type in `packages/hzl-web/src/app/api/types.ts` (line ~47):
```typescript
blocked_by: Array<{ task_id: string; title: string }>;
```

**Step 2: Update the modal blocked-by section**

In `TaskModal.tsx` (line ~176), replace:
```tsx
<div className="modal-description">{task.blocked_by.join(', ')}</div>
```
with:
```tsx
<div className="modal-blocked-list">
  {task.blocked_by.map((dep) => (
    <button
      key={dep.task_id}
      type="button"
      className="modal-blocked-item"
      onClick={() => loadTask(dep.task_id)}
    >
      {dep.title}
    </button>
  ))}
</div>
```

**Step 3: Add lease info to modal**

The lease info is already shown when `task.lease_until` is truthy (line ~161-166 in TaskModal.tsx). It shows `formatTime(task.lease_until)`. This is already in the modal, so no change needed — it was only *also* on the card, and we're removing it from the card only.

**Step 4: Add CSS for blocked-by items**

In `TaskModal.css`:
```css
.modal-blocked-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.modal-blocked-item {
  display: block;
  text-align: left;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 10px;
  color: var(--accent);
  font-size: 13px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-blocked-item:hover {
  border-color: var(--accent);
}
```

**Step 5: Verify build and visual check**

Run: `pnpm --filter hzl-web build && pnpm --filter hzl-cli build`
Create tasks with dependencies, verify blocked-by shows clickable titles in modal.

**Step 6: Commit**

```bash
git add packages/hzl-web/src/server.ts packages/hzl-web/src/app/api/types.ts \
  packages/hzl-web/src/app/components/TaskModal/TaskModal.tsx \
  packages/hzl-web/src/app/components/TaskModal/TaskModal.css
git commit -m "feat(web): show blocked-by as clickable task titles in modal"
```

---

### Task 10: Final verification — typecheck, lint, full test suite

**Files:** None (verification only)

**Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 2: Run lint**

Run: `pnpm lint`
Expected: No errors (or `pnpm lint:fix` if auto-fixable)

**Step 3: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 4: Visual smoke test**

```bash
pnpm build
node packages/hzl-cli/dist/cli.js serve
```

Create test data:
```bash
node packages/hzl-cli/dist/cli.js task add "Test tags" -p demo -t bug,urgent,v2
node packages/hzl-cli/dist/cli.js task add "Parent" -p demo -t feature
node packages/hzl-cli/dist/cli.js task add "Child" -p demo --parent <parent_id>
```

Verify:
- Tag chips appear on cards with correct colors
- Tag filter dropdown shows in filter bar with counts
- Selecting a tag filters the board
- Progress shows as thin bar (not % badge)
- No "Unassigned" badges on unassigned cards
- No "Blocked by" row on cards
- No lease timer on cards
- Blocked-by shows clickable titles in modal
- Lease info still shows in modal
- Cards are less dense and more readable
- Column width feels appropriate

**Step 5: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix(web): address review issues from smoke test"
```
