# FTS5 Search API Design

## Problem

SearchService with FTS5 virtual table exists in hzl-core but is unused by the web API. Client-side search does substring matching on already-loaded tasks — can't search descriptions or tags not in the list payload, no relevance ranking.

## Solution

Wire SearchService to a new `GET /api/search` endpoint. Add `tags` to the FTS5 index. Replace client-side filtering with API calls when searching.

## Approach: Hybrid (server search, keep client filtering for non-search)

Dedicated search endpoint. When user types in the search box, hit the API. When search is empty, show normal filtered view as today.

## Changes

### 1. Schema — add `tags` to FTS5 table

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS task_search USING fts5(
    task_id UNINDEXED,
    title,
    description,
    tags
);
```

FTS5 doesn't support ALTER TABLE ADD COLUMN, so: drop + recreate + rebuild via projection engine.

### 2. SearchProjector — handle tags

- Add `'tags'` to `SEARCHABLE_FIELDS`
- `handleTaskCreated`: include `data.tags?.join(' ') ?? ''` as 4th column
- `handleTaskUpdated`: handle `field === 'tags'` — new_value is an array, join with spaces
- Update SELECT to include `tags` column
- Update INSERT to include `tags` parameter

### 3. SearchService — include tags in results

- Add `tags: string` to `SearchTaskResult` (raw space-joined string from FTS5)
- Update SQL to select tags column

### 4. API route — `GET /api/search`

- Query params: `q` (required), `project`, `status`, `limit`, `offset`
- Empty `q` returns `{ tasks: [], total: 0 }`
- Calls `SearchService.search(q, { project, status, limit, offset })`
- Returns `SearchResult` JSON

### 5. Client — call API when searching

- When search query is non-empty, `fetch('/api/search?q=...')` with ~250ms debounce
- Display results in a flat list (search spans all statuses)
- When search is cleared, return to normal filtered view
- Remove `taskMatchesSearch` function from App.tsx

## What stays the same

- Normal task listing, kanban view, filters — untouched
- SSE streaming, all other endpoints — untouched
- FilterBar component — same input, wired to API instead of local filter
