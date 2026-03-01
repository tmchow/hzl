# FTS5 Search API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the existing SearchService to a new `GET /api/search` endpoint and replace client-side substring matching with server-side FTS5 search across titles, descriptions, and tags.

**Architecture:** Add `tags` column to FTS5 virtual table, update SearchProjector to index tags, add `/api/search` route to hzl-web server, add `useSearch` hook on the client, and switch App.tsx to call the API when searching instead of filtering in-memory.

**Tech Stack:** SQLite FTS5, Node.js HTTP server, React hooks, TypeScript

---

### Task 1: Add `tags` column to FTS5 schema

**Files:**
- Modify: `packages/hzl-core/src/db/schema.ts:131-136`

**Step 1: Update the FTS5 virtual table definition**

In `CACHE_SCHEMA_V1`, change:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS task_search USING fts5(
    task_id UNINDEXED,
    title,
    description
);
```

to:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS task_search USING fts5(
    task_id UNINDEXED,
    title,
    description,
    tags
);
```

**Step 2: Bump CURRENT_SCHEMA_VERSION in db.ts**

In `packages/hzl-cli/src/db.ts`, change:

```typescript
const CURRENT_SCHEMA_VERSION = 3;
```

to:

```typescript
const CURRENT_SCHEMA_VERSION = 4;
```

This ensures existing databases auto-rebuild with the new tags column on next startup.

**Step 3: Run typecheck to confirm no breakage**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```
feat(core): add tags column to FTS5 search table
```

---

### Task 2: Update SearchProjector to index tags

**Files:**
- Modify: `packages/hzl-core/src/projections/search.ts`
- Test: `packages/hzl-core/src/services/search-service.test.ts`

**Step 1: Write failing tests for tag search**

Add to `search-service.test.ts` inside the `describe('search')` block:

```typescript
it('finds tasks by tag match', () => {
  const event = eventStore.append({
    task_id: 'TASK1',
    type: EventType.TaskCreated,
    data: { title: 'Backend work', project: 'project-a', tags: ['api', 'urgent'] },
  });
  engine.applyEvent(event);

  const results = searchService.search('urgent');
  expect(results.tasks).toHaveLength(1);
  expect(results.tasks[0].task_id).toBe('TASK1');
});

it('finds tasks after tag update', () => {
  createTask('TASK1', 'Backend work', 'project-a');

  const updateEvent = eventStore.append({
    task_id: 'TASK1',
    type: EventType.TaskUpdated,
    data: { field: 'tags', old_value: [], new_value: ['critical'] },
  });
  engine.applyEvent(updateEvent);

  const results = searchService.search('critical');
  expect(results.tasks).toHaveLength(1);
  expect(results.tasks[0].task_id).toBe('TASK1');
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter hzl-core test src/services/search-service.test.ts`
Expected: FAIL (tags column doesn't exist in FTS5 table yet at test time, and projector doesn't index tags)

**Step 3: Update SearchProjector**

In `packages/hzl-core/src/projections/search.ts`:

1. Add `'tags'` to `SEARCHABLE_FIELDS`:
```typescript
const SEARCHABLE_FIELDS = new Set(['title', 'description', 'tags']);
```

2. Update `handleTaskCreated` to include tags:
```typescript
private handleTaskCreated(event: PersistedEventEnvelope, db: Database.Database): void {
  const data = event.data as TaskCreatedData;
  const tags = Array.isArray(data.tags) ? data.tags.join(' ') : '';
  this.stmt(db, 'insertTaskSearch', `
    INSERT INTO task_search (task_id, title, description, tags)
    VALUES (?, ?, ?, ?)
  `).run(event.task_id, data.title, data.description ?? '', tags);
}
```

3. Update `handleTaskUpdated` to read and write tags:
```typescript
private handleTaskUpdated(event: PersistedEventEnvelope, db: Database.Database): void {
  const data = event.data as TaskUpdatedData;
  if (!SEARCHABLE_FIELDS.has(data.field)) return;

  const current = this.stmt(
    db,
    'selectTaskSearchById',
    'SELECT title, description, tags FROM task_search WHERE task_id = ?'
  ).get(event.task_id) as { title: string; description: string; tags: string } | undefined;

  if (!current) return;

  const title = data.field === 'title' ? (data.new_value as string) : current.title;
  const description = data.field === 'description' ? (data.new_value as string | null) ?? '' : current.description;
  const tags = data.field === 'tags' ? (Array.isArray(data.new_value) ? (data.new_value as string[]).join(' ') : '') : current.tags;

  this.stmt(db, 'deleteTaskSearchById', 'DELETE FROM task_search WHERE task_id = ?').run(event.task_id);
  this.stmt(db, 'insertTaskSearch', `
    INSERT INTO task_search (task_id, title, description, tags)
    VALUES (?, ?, ?, ?)
  `).run(event.task_id, title, description, tags);
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter hzl-core test src/services/search-service.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat(core): index tags in FTS5 search projection
```

---

### Task 3: Add `/api/search` route to web server

**Files:**
- Modify: `packages/hzl-web/src/server.ts`
- Test: `packages/hzl-web/src/server.test.ts`

**Step 1: Write failing tests for search endpoint**

Add to `server.test.ts`. First, update the `beforeEach` to register `SearchProjector` and create a `SearchService`:

```typescript
import { SearchProjector } from 'hzl-core/projections/search';
import { SearchService } from 'hzl-core/services/search-service';
```

Add `searchService` to the variables block and create it in `beforeEach`:
```typescript
let searchService: SearchService;

// In beforeEach, after existing projector registrations:
projectionEngine.register(new SearchProjector());

// After taskService creation:
searchService = new SearchService(db);
```

Update `createServer` to pass `searchService`:
```typescript
function createServer(port: number, host = '127.0.0.1', allowFraming = false): ServerHandle {
  server = createWebServer({ port, host, allowFraming, taskService, eventStore, searchService });
  return server;
}
```

Add a new `describe('GET /api/search')` block:

```typescript
describe('GET /api/search', () => {
  it('returns matching tasks', async () => {
    taskService.createTask({ title: 'Implement authentication', project: 'test-project' });
    taskService.createTask({ title: 'Write documentation', project: 'test-project' });
    createServer(4590);
    await new Promise((r) => setTimeout(r, 20));

    const { status, data } = await fetchJson('/api/search?q=authentication');
    expect(status).toBe(200);
    const body = data as { tasks: Array<{ title: string }>; total: number };
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].title).toBe('Implement authentication');
    expect(body.total).toBe(1);
  });

  it('returns empty results for missing q param', async () => {
    createServer(4591);
    await new Promise((r) => setTimeout(r, 20));

    const { status, data } = await fetchJson('/api/search');
    expect(status).toBe(200);
    const body = data as { tasks: unknown[]; total: number };
    expect(body.tasks).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  it('supports project filter', async () => {
    taskService.createTask({ title: 'Auth for A', project: 'test-project' });
    projectService.createProject('other-project');
    taskService.createTask({ title: 'Auth for B', project: 'other-project' });
    createServer(4592);
    await new Promise((r) => setTimeout(r, 20));

    const { status, data } = await fetchJson('/api/search?q=Auth&project=test-project');
    expect(status).toBe(200);
    const body = data as { tasks: Array<{ project: string }> };
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].project).toBe('test-project');
  });

  it('finds tasks by tag', async () => {
    taskService.createTask({ title: 'Backend work', project: 'test-project', tags: ['api', 'urgent'] });
    createServer(4593);
    await new Promise((r) => setTimeout(r, 20));

    const { status, data } = await fetchJson('/api/search?q=urgent');
    expect(status).toBe(200);
    const body = data as { tasks: unknown[] };
    expect(body.tasks).toHaveLength(1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter hzl-web test src/server.test.ts -- --grep "GET /api/search"`
Expected: FAIL (searchService not in ServerOptions, no route)

**Step 3: Add searchService to ServerOptions and route handler**

In `packages/hzl-web/src/server.ts`:

1. Add import:
```typescript
import {
  TaskService,
  EventStore,
  EventType,
  AmbiguousPrefixError,
  SearchService,
  type TaskListItem as CoreTaskListItem,
} from 'hzl-core';
```

2. Add `searchService` to `ServerOptions`:
```typescript
export interface ServerOptions {
  port: number;
  host?: string;
  allowFraming?: boolean;
  taskService: TaskService;
  eventStore: EventStore;
  searchService: SearchService;
}
```

3. Destructure in `createWebServer`:
```typescript
const { port, host = '0.0.0.0', allowFraming = false, taskService, eventStore, searchService } = options;
```

4. Add `handleSearch` function (before `handleRequest`):
```typescript
function handleSearch(params: URLSearchParams, res: ServerResponse): void {
  const q = params.get('q') ?? '';
  const project = params.get('project') || undefined;
  const status = params.get('status') || undefined;

  const limitParam = params.get('limit');
  let limit: number | undefined;
  if (limitParam !== null) {
    const parsed = parseStrictNonNegativeInt(limitParam);
    if (parsed === null || parsed < 1 || parsed > 200) {
      json(res, { error: 'Invalid limit value. Expected integer 1-200.' }, 400);
      return;
    }
    limit = parsed;
  }

  const offsetParam = params.get('offset');
  let offset: number | undefined;
  if (offsetParam !== null) {
    const parsed = parseStrictNonNegativeInt(offsetParam);
    if (parsed === null) {
      json(res, { error: 'Invalid offset value. Expected non-negative integer.' }, 400);
      return;
    }
    offset = parsed;
  }

  const result = searchService.search(q, { project, status, limit, offset });
  json(res, result);
}
```

5. Add route in `handleRequest`, before the `/api/events` check:
```typescript
if (pathname === '/api/search') {
  handleSearch(params, res);
  return;
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter hzl-web test src/server.test.ts -- --grep "GET /api/search"`
Expected: PASS

**Step 5: Run the full server test suite**

Run: `pnpm --filter hzl-web test src/server.test.ts`
Expected: PASS (existing tests must still pass — they'll need `searchService` added to `createServer` call in the test `beforeEach`)

**Step 6: Update serve.ts to pass searchService**

In `packages/hzl-cli/src/commands/serve.ts`, update the `createWebServer` call in `runForeground`:

```typescript
const server = createWebServer({
  port,
  host,
  allowFraming,
  taskService: services.taskService,
  eventStore: services.eventStore,
  searchService: services.searchService,
});
```

**Step 7: Build and typecheck**

Run: `pnpm build && pnpm typecheck`
Expected: PASS

**Step 8: Commit**

```
feat(web): add GET /api/search endpoint for FTS5 search
```

---

### Task 4: Add useSearch hook and search API types on client

**Files:**
- Modify: `packages/hzl-web/src/app/api/types.ts`
- Create: `packages/hzl-web/src/app/hooks/useSearch.ts`

**Step 1: Add search types to api/types.ts**

Append to `packages/hzl-web/src/app/api/types.ts`:

```typescript
/** Search result item as returned by GET /api/search */
export interface SearchTaskResult {
  task_id: string;
  title: string;
  project: string;
  status: string;
  description: string | null;
  priority: number;
  rank: number;
}

export interface SearchResponse {
  tasks: SearchTaskResult[];
  total: number;
  limit: number;
  offset: number;
}
```

**Step 2: Create useSearch hook**

Create `packages/hzl-web/src/app/hooks/useSearch.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '../api/client';
import type { SearchResponse, SearchTaskResult } from '../api/types';

const DEBOUNCE_MS = 250;

export interface UseSearchResult {
  results: SearchTaskResult[];
  total: number;
  searching: boolean;
}

export function useSearch(query: string): UseSearchResult {
  const [results, setResults] = useState<SearchTaskResult[]>([]);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController>();

  const doSearch = useCallback((q: string) => {
    // Cancel any in-flight request
    abortRef.current?.abort();

    if (!q.trim()) {
      setResults([]);
      setTotal(0);
      setSearching(false);
      return;
    }

    setSearching(true);
    const controller = new AbortController();
    abortRef.current = controller;

    fetchJson<SearchResponse>('/api/search', { q })
      .then((data) => {
        if (!controller.signal.aborted) {
          setResults(data.tasks);
          setTotal(data.total);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResults([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      });
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!query.trim()) {
      doSearch('');
      return;
    }
    timerRef.current = setTimeout(() => doSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [query, doSearch]);

  // Cleanup on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  return { results, total, searching };
}
```

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```
feat(web): add useSearch hook and search API types
```

---

### Task 5: Wire search into App.tsx — replace client-side filtering

**Files:**
- Modify: `packages/hzl-web/src/app/App.tsx`

**Step 1: Import useSearch and update App**

In `packages/hzl-web/src/app/App.tsx`:

1. Add import:
```typescript
import { useSearch } from './hooks/useSearch';
```

2. Remove the `taskMatchesSearch` function entirely (lines 29-45).

3. Add the search hook call inside `App()`, after the `useSSE` call:
```typescript
const { results: searchResults, total: searchTotal, searching } = useSearch(searchQuery);
const isSearching = searchQuery.trim().length > 0;
```

4. Update the `filteredTasks` memo to skip client-side search filtering (replace the search block):

Replace the existing `filteredTasks` memo with:
```typescript
const filteredTasks = useMemo(() => {
  // When searching, use server results (don't filter the task list)
  if (isSearching) return [];

  let filtered = showSubtasks ? tasks : tasks.filter((t) => !t.parent_id);

  if (assignee) {
    filtered = filtered.filter((t) => getAssigneeValue(t.assignee) === assignee);
  }

  // Collapsed parents: hide children of collapsed parents
  if (showSubtasks) {
    const visibleIds = new Set(filtered.map((t) => t.task_id));
    filtered = filtered.filter((t) => {
      if (!t.parent_id) return true;
      if (!visibleIds.has(t.parent_id)) return true;
      return !collapsedParents.has(t.parent_id);
    });
  }

  return filtered;
}, [tasks, showSubtasks, assignee, collapsedParents, isSearching]);
```

5. Update `searchCounts` memo:
```typescript
const searchCounts = useMemo(() => {
  if (!isSearching) return { matched: 0, total: 0 };
  return { matched: searchResults.length, total: searchTotal };
}, [isSearching, searchResults.length, searchTotal]);
```

6. Update `visibleBoardTaskIds` memo to not reference `taskMatchesSearch`:
```typescript
const visibleBoardTaskIds = useMemo(() => {
  if (isSearching) {
    return new Set(searchResults.map((t) => t.task_id));
  }
  let boardBase = showSubtasks ? tasks : tasks.filter((t) => !t.parent_id);
  const visibleStatuses = new Set(columnVisibility);
  boardBase = boardBase.filter((t) => visibleStatuses.has(getBoardStatus(t)));
  return new Set(boardBase.map((t) => t.task_id));
}, [tasks, showSubtasks, columnVisibility, isSearching, searchResults]);
```

7. In the JSX, when `isSearching`, show search results as a flat list instead of the board. Convert search results to a minimal card display. The simplest approach: when searching, pass search results as task-like items to the Board component. Since `SearchTaskResult` has `task_id`, `title`, `project`, `status`, `priority`, `description` — we can map them to `TaskListItem` shape for the board:

In the render section, replace the kanban view block:
```typescript
{view === 'kanban' && !isSearching && (
  <>
    <MobileTabs ... />
    <Board ... />
  </>
)}

{isSearching && (
  <div className="search-results">
    {searching && <div className="search-loading">Searching...</div>}
    {!searching && searchResults.length === 0 && searchQuery.trim() && (
      <div className="search-empty">No results found</div>
    )}
    {searchResults.map((result) => (
      <div
        key={result.task_id}
        className="search-result-card"
        onClick={() => setSelectedTaskId(result.task_id)}
      >
        <div className="search-result-title">{result.title}</div>
        <div className="search-result-meta">
          <span className={`status-badge status-${result.status}`}>{result.status}</span>
          <span className="search-result-project">{result.project}</span>
        </div>
        {result.description && (
          <div className="search-result-description">{result.description}</div>
        )}
      </div>
    ))}
  </div>
)}
```

Also hide calendar/graph during search:
```typescript
{view === 'calendar' && !isSearching && (
  <CalendarView ... />
)}

{view === 'graph' && !isSearching && (
  <GraphView ... />
)}
```

**Step 2: Add minimal CSS for search results**

Create or append to `packages/hzl-web/src/app/styles/search.css` (or add inline to existing styles — check what pattern the project uses). Given the project uses component CSS files, add to the main stylesheet. Look for `App.css` or similar:

```css
.search-results {
  padding: 1rem;
  max-width: 800px;
  margin: 0 auto;
}

.search-loading,
.search-empty {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary, #666);
}

.search-result-card {
  padding: 0.75rem 1rem;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  margin-bottom: 0.5rem;
  cursor: pointer;
  background: var(--card-bg, #fff);
}

.search-result-card:hover {
  border-color: var(--accent-color, #4a9eff);
}

.search-result-title {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.search-result-meta {
  display: flex;
  gap: 0.5rem;
  font-size: 0.85em;
  color: var(--text-secondary, #666);
}

.search-result-description {
  margin-top: 0.375rem;
  font-size: 0.85em;
  color: var(--text-secondary, #666);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

**Step 3: Remove the `normalizeSearchQuery` function**

Keep it — it's still used for the input normalization. But we can simplify: the server handles query normalization, so we only need local normalization for trimming/length.

**Step 4: Build and test**

Run: `pnpm --filter hzl-web build`
Expected: PASS

**Step 5: Manual smoke test**

```bash
pnpm build
node packages/hzl-cli/dist/cli.js serve --host 127.0.0.1
```

Open http://localhost:3456, type in the search box, verify results come from the API.

**Step 6: Commit**

```
feat(web): replace client-side search with server FTS5 API
```

---

### Task 6: Clean up and final verification

**Step 1: Run full test suites**

Run: `pnpm test`
Expected: PASS

**Step 2: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 3: Fix any issues found**

**Step 4: Final commit if any cleanup needed**

```
chore: clean up after FTS5 search wiring
```
