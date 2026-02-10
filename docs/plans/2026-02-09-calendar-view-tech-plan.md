# Calendar View for Web Dashboard - Technical Plan

**Date:** 2026-02-09
**Status:** Planning
**PRD:** `docs/prd/2026-02-09-calendar-view-prd.md`

## Overview

Add a calendar month view as the second tab (Kanban → Calendar → Graph) in the hzl web dashboard. Tasks with a `due_at` date appear as mini cards on their due day. Tapping a card opens the existing task detail modal. Navigation arrows and a "Today" button let users move across months.

The dashboard is a single HTML file (`packages/hzl-web/src/ui/index.html`) with embedded CSS and JS, using no frontend framework. The calendar follows this pattern — vanilla JS with CSS Grid for the month layout.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Backend (hzl-core + hzl-web server)            │
│                                                 │
│  TaskListItem + due_at                          │
│  New due_month param queries by due_at range    │
│  (padded ±1 day for timezone safety)            │
│                                                 │
│  /api/tasks?since=3d         (Kanban/Graph)     │
│  /api/tasks?due_month=2026-02 (Calendar)        │
└──────────────────────┬──────────────────────────┘
                       │ JSON
┌──────────────────────▼──────────────────────────┐
│  Frontend (index.html)                          │
│                                                 │
│  poll() ─► fetchTasks()                         │
│         │  (uses due_month when calendar active) │
│         │                                       │
│         ├─► renderBoard()     [Kanban view]     │
│         ├─► renderCalendar()  [Calendar view]   │
│         └─► updateGraphData() [Graph view]      │
│                                                 │
│  renderCalendar():                              │
│    1. Filter server results to local-tz month   │
│    2. Build 7-col CSS Grid (Sun–Sat)            │
│    3. Place mini cards in current-month days     │
│    4. Show "+N more" after 3 cards per cell     │
│                                                 │
│  Popover (click "+N more"):                     │
│    - Anchored below "+N more" link              │
│    - Lists all tasks for that day               │
│    - Click-outside dismisses                    │
│    - Cards inside open task modal               │
│                                                 │
│  openTaskModal() ─► existing modal (+ due_at)   │
└─────────────────────────────────────────────────┘
```

**Key decisions:**

- **Server-side `due_month` filtering with timezone padding** — When calendar is active, `fetchTasks()` sends `due_month=YYYY-MM`. The server queries tasks where `due_at` falls within that month, padded by 1 day on each side to account for UTC-vs-local timezone offsets (e.g., for February: `due_at >= Jan 31 AND due_at < Mar 2` in UTC). The client then filters precisely to local-timezone days within the visible month. This ensures a task due `2026-03-01T05:00:00Z` (which is Feb 28 in US Pacific) is returned by the February query and displayed on the correct local day.

- **Separate data paths per view** — Kanban/Graph fetch tasks by `updated_at` (via `since`). Calendar fetches tasks by `due_at` (via `due_month`). The `tasks` global holds whatever the active view needs. Switching views triggers a re-poll with the appropriate parameters.

- **Mini cards, not full Kanban cards** — Calendar cells are small, so cards show only title (single-line, ellipsis) and project badge with a status-colored left border. Created by a new `renderMiniCard(task)` function, separate from the Kanban `renderCard()`.

- **Adjacent-month grid padding cells are empty** — The calendar grid may show leading/trailing days from the previous/next month to fill out weeks. These cells show the dimmed date number only — no task cards. Task cards only appear on days within the current month.

---

## 1. Backend — API Changes

### 1.1 Add `due_at` to `TaskListItem` interface and query mapping

**Depends on:** none
**Files:** `packages/hzl-core/src/services/task-service.ts`, `packages/hzl-core/src/services/task-service.test.ts`

Two changes needed:

1. **Interface:** Add `due_at: string | null` to the `TaskListItem` interface (defined near `listTasks()`). Follow the pattern of other nullable fields like `assignee` and `lease_until`.

2. **Mapping:** Add `due_at: row.due_at` to the `rows.map()` return object inside `listTasks()`. The SQL query already selects `due_at` from `tasks_current`, but the mapping explicitly omits it — this is the line that needs to change.

The web server's `TaskListItemResponse` extends `CoreTaskListItem` via spread (`...row`), so once the mapping includes `due_at`, it flows through to the API response automatically — no `server.ts` change needed. (Satisfies R11.)

**Test scenarios:** (`packages/hzl-core/src/services/task-service.test.ts`)
- Task created with `due_at` → `listTasks()` result includes `due_at` value
- Task created without `due_at` → `listTasks()` result has `due_at: null`
- Task with `due_at` updated via event → `listTasks()` reflects the updated value

**Verify:** `pnpm --filter hzl-core test src/services/task-service.test.ts`

### 1.2 Add `due_month` query parameter for calendar data

**Depends on:** 1.1
**Files:** `packages/hzl-core/src/services/task-service.ts`, `packages/hzl-core/src/services/task-service.test.ts`, `packages/hzl-web/src/server.ts`, `packages/hzl-web/src/server.test.ts`

Add a new `due_month` parameter to the `/api/tasks` endpoint. When `due_month=YYYY-MM` is present, the server queries tasks where `due_at` falls within that month (with timezone padding) instead of filtering by `updated_at`.

**Server layer:** In `handleTasks()`, check for a `due_month` query param. Validate format with regex (`/^\d{4}-\d{2}$/`) and verify month is 01-12 — return 400 Bad Request for invalid values. If valid, pass it to `taskService.listTasks({ dueMonth, project })`. If absent, use the existing `since`/`sinceDays` logic unchanged. This keeps backward compatibility.

**Core layer:** Add a new option to `listTasks()` — `dueMonth?: string` (format `YYYY-MM`). When present:
- Compute date boundaries with ±1 day padding for timezone safety: for `2026-02`, query `due_at >= '2026-01-31T00:00:00Z' AND due_at < '2026-03-02T00:00:00Z'`
- Replace the `updated_at >= datetime(...)` WHERE clause entirely — do not apply the `sinceDays` filter
- Still exclude archived tasks, still respect `project` filter

**Query branching:** `listTasks()` currently has two SQL paths (with/without `project`). Adding `dueMonth` creates a third condition. Recommend building the WHERE clause dynamically: start with `status != 'archived'`, conditionally append the date clause (`due_at` range when `dueMonth` is set, `updated_at >= datetime(...)` when `sinceDays` is set), and conditionally append `project = ?`. This avoids a combinatorial explosion of SQL strings.

(Satisfies R11 data availability.)

**Test scenarios:** (`packages/hzl-core/src/services/task-service.test.ts`, `packages/hzl-web/src/server.test.ts`)
- `listTasks({ dueMonth: '2026-02' })` → returns only tasks with `due_at` in February 2026
- Task with `due_at` in January → excluded from February query
- Task with no `due_at` → excluded from `dueMonth` query
- `due_month` with `project` filter → both filters apply
- `GET /api/tasks?due_month=2026-02` → returns tasks due in February
- `GET /api/tasks?due_month=2026-02&project=demo` → project filter applies
- Tasks near month boundaries included by ±1 day padding (e.g., `2026-03-01T05:00:00Z` included in Feb query)
- `GET /api/tasks?due_month=abc` → 400 Bad Request
- `GET /api/tasks?due_month=2026-13` → 400 Bad Request

**Verify:** `pnpm --filter hzl-core test src/services/task-service.test.ts && pnpm --filter hzl-web test`

---

## 2. Calendar View — Structure and Rendering

### 2.1 Add Calendar tab and view switching

**Depends on:** none
**Files:** `packages/hzl-web/src/ui/index.html`

Add a third button to the `.view-toggle` div: `<button class="view-btn" data-view="calendar">Calendar</button>`, positioned between Kanban and Graph buttons. (Satisfies R4.)

Create a new container div `<div id="calendarContainer" class="calendar-container hidden"></div>` between the `#board` and `#graphContainer` elements. This holds the entire calendar UI.

Extend `setActiveView(view)` to handle the `'calendar'` case:
- Show `#calendarContainer`, hide `#board` (+ mobile tabs) and `#graphContainer`
- Hide the date filter control: `dateFilter.closest('.filter-group').style.display = 'none'` for calendar, restore to `''` for other views. Note: hiding via `display: none` preserves the `<select>` element's value in the DOM, so no separate storage is needed — when switching back, `dateFilter.value` still has the user's previous selection. (Satisfies R10.)
- Trigger a re-poll on every view switch (both TO and FROM calendar), so data is fetched with the appropriate parameters for the new view

Modify `fetchTasks()` to check `activeView`: if `'calendar'`, build the URL as `/api/tasks?due_month=YYYY-MM` instead of the `since` parameter. The `calendarMonth` global is 0-indexed (JS Date convention), so convert to 1-indexed for the API: `` `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}` ``. Project filter still appended as usual. (Depends on 1.2 for the server to support `due_month`.)

Also extend `poll()` to call a new `renderCalendar()` function when `activeView === 'calendar'`. Follow the pattern of how `renderBoard()` and `updateGraphData()` are called conditionally.

**State persistence on view switch:** When the user switches from Calendar to Kanban and back, `calendarYear` and `calendarMonth` globals persist — the user returns to the month they were viewing, not reset to the current month.

No test file for this subtask — it's HTML/CSS/JS in the single-page app, verified manually.

**Test scenarios:** (manual)
- Click Calendar tab → calendar container visible, Kanban hidden, Graph hidden
- Date filter hidden when Calendar active, visible when switching to Kanban/Graph
- Switching to Calendar triggers data re-fetch (visible in Network tab: `due_month` param)
- Calendar tab shows `.active` class styling (orange background)
- Switch to Kanban and back → calendar remembers the navigated month
- Date filter value preserved after switching to Calendar and back

**Verify:** Build (`pnpm build`), start server (`node packages/hzl-cli/dist/cli.js serve`), open dashboard, click Calendar tab.

### 2.2 Build month grid with CSS Grid and navigation

**Depends on:** 2.1
**Files:** `packages/hzl-web/src/ui/index.html`

**CSS:** Add styles for the calendar layout. Use existing CSS variables (`var(--bg-card)`, `var(--border)`, `var(--text-muted)`, `var(--accent)`) for consistency with the dashboard theme:
- `.calendar-container` — full width, padding consistent with `.board`
- `.calendar-header` — flexbox row: prev/next arrows, month/year label, "Today" button. Style consistently with existing `.view-btn`
- `.calendar-grid` — 7-column CSS Grid for the week layout
- `.calendar-day-header` — day-of-week labels (Sun–Sat), muted color, centered
- `.calendar-day` — day cell with dark background, border, consistent min-height for uniform rows
- `.calendar-day.today` — distinguished with accent border color and subtle background tint. (Satisfies R7.)
- `.calendar-day.other-month` — leading/trailing days from adjacent months: dimmed date number, no task content (empty padding cells)
- `.calendar-day-number` — date number in each cell

**JS:** Add `renderCalendar()` function and month navigation state:
- Track `calendarYear` and `calendarMonth` (0-indexed, matching JS Date convention) globals, initialized to current date
- `renderCalendar()` builds the grid: compute first day of month, number of days, leading/trailing empty days from adjacent months (so the grid always starts on Sunday). Adjacent-month cells show only the dimmed date number — no task cards
- Navigation functions: `calendarPrev()`, `calendarNext()`, `calendarToday()` — each updates the month/year globals AND triggers `poll()` to re-fetch data for the new month. The poll callback calls `renderCalendar()` with the fresh data. Call sequence: update globals → `poll()` → (poll calls `renderCalendar()`)
- Month/year label shows `"February 2026"` format using `Date.toLocaleDateString()` with `{ month: 'long', year: 'numeric' }`. (Satisfies R3.)
- Weeks start on Sunday. (Key decision from PRD.)

No test file — manual verification.

**Test scenarios:** (manual)
- Calendar shows current month with correct number of days
- Day cells are aligned to correct days of the week (verify Feb 2026 starts on Sunday)
- Today's date has visual distinction (accent border)
- Prev/Next arrows navigate months correctly, including year boundary (Dec → Jan)
- "Today" button returns to current month from any other month
- Leading/trailing days from adjacent months are visually dimmed with no task content
- Navigating months triggers a new API call with the correct `due_month` param (visible in Network tab)

**Verify:** Build, open dashboard, switch to Calendar, navigate months, verify grid correctness.

### 2.3 Render mini task cards in day cells

**Depends on:** 1.1, 2.2
**Files:** `packages/hzl-web/src/ui/index.html`

**CSS:** Add styles for mini cards — compact, single-line, status-colored left border, styled consistently with existing Kanban card components (use same CSS variables). Key classes:
- `.calendar-mini-card` — status-colored left border, dark background, rounded corners, cursor pointer, hover effect
- `.calendar-mini-title` — single-line with ellipsis truncation
- `.calendar-mini-project` — small badge matching Kanban `.card-project` style but smaller
- `.calendar-more-link` — "+N more" text link in accent color

Exact sizing should be tuned visually during implementation — the plan specifies behavior, not pixel values.

**JS:** In `renderCalendar()`, after building the grid:
1. Filter the `tasks` array to the current month in local timezone. The server returns tasks with ±1 day padding (for timezone safety), so the client must filter precisely: convert each task's `due_at` to a local `Date`, check that its year and month match `calendarYear` and `calendarMonth`. Apply project filter if active (`projectFilter.value`)
2. Group filtered tasks by local day using the full local date as key (not just `getDate()` — avoids collisions with adjacent-month days from the padded server response)
3. For each current-month day cell, render up to 3 mini cards using a `renderMiniCard(task)` helper. Each card gets a `data-task-id` attribute for click handling
4. If a day has more than 3 tasks, render a "+N more" link (where N = total - 3). Add a `data-date` attribute for the popover (subtask 3.1). (Satisfies R1, R5, R6.)

`renderMiniCard(task)` returns an HTML string:
- Left border color: map `task.status` to the CSS variable (e.g., `var(--status-ready)`). Follow the same status→color mapping used in the Kanban `renderCard()` function
- Title: `task.title` escaped with `escapeHtml()` (existing utility)
- Project badge: small `<span>` with project name

The project filter applies to the calendar view — when rendering, filter by `projectFilter.value`. (Satisfies R8.)

No test file — manual verification.

**Test scenarios:** (manual)
- Create tasks with `due_at` dates in current month → appear as mini cards on correct days
- Tasks without `due_at` → do not appear on calendar
- Mini card shows truncated title and project badge
- Mini card left border color matches task status
- Day with 4+ tasks shows 3 cards + "+1 more" link
- Project filter limits which tasks appear on calendar
- Adjacent-month padding cells remain empty (no task cards)
- Task due at `2026-02-15T05:00:00Z` appears on Feb 14 for UTC-8 users (timezone conversion)

**Verify:** Create test tasks with `due_at` via CLI (`node packages/hzl-cli/dist/cli.js task add "Test" -p demo --due 2026-02-15`), build, open dashboard Calendar view.

---

## 3. Calendar Interactions and Polish

### 3.1 "+N more" popover

**Depends on:** 2.3
**Files:** `packages/hzl-web/src/ui/index.html`

**CSS:** Add popover styles — dark background (`var(--bg-card)`), border, box-shadow for depth, rounded corners, z-index above the grid. Max-height with overflow-y auto for long lists. Popover header shows the date (e.g., "February 15"). Mini cards inside reuse `.calendar-mini-card` styles.

**JS:** Add popover show/hide logic:
- Click handler on "+N more" links: create and position the popover element absolutely below the "+N more" link. Populate with all tasks for that day (the complete list, not just overflow). Each card gets `data-task-id` for click-through to modal
- Dismiss on click-outside: add a document click listener. If click target is not inside the popover, remove it. Follow the pattern of the existing `modalOverlay` click handler
- Only one popover visible at a time — opening a new one closes the previous

(Satisfies R6 popover behavior.)

No test file — manual verification.

**Test scenarios:** (manual)
- Click "+2 more" → popover appears showing all tasks for that day
- Popover has date header (e.g., "February 15")
- Click outside popover → dismisses
- Click "+N more" on different day → previous popover closes, new one opens
- Popover cards are clickable (verified in 3.2)

**Verify:** Create 5+ tasks on the same due date, build, open Calendar, click "+N more".

### 3.2 Wire clicks to task modal and add `due_at` to modal

**Depends on:** 2.3, 3.1
**Files:** `packages/hzl-web/src/ui/index.html`

**Click handling:** Add event delegation on `#calendarContainer` for clicks on `.calendar-mini-card` elements. Extract `data-task-id` from the clicked card and call `openTaskModal(taskId)` — the existing modal function handles everything. This works for cards in both day cells and the popover. If a popover is open, dismiss it when the modal opens. (Satisfies R2.)

**Add `due_at` to modal meta grid:** In the `openTaskModal()` function, after the existing meta items (Status, Progress, Project, Priority, Created), add a conditional "Due Date" item when `data.task.due_at` is not null. Format using `new Date(data.task.due_at).toLocaleDateString()` for locale-appropriate display (e.g., "2/15/2026" in en-US). Follow the same `modal-meta-item` / `modal-meta-label` / `modal-meta-value` structure as existing items. (Satisfies R9.)

No test file — manual verification.

**Test scenarios:** (manual)
- Click mini card in day cell → task detail modal opens with correct task
- Click mini card inside popover → modal opens, popover dismisses
- Modal shows "Due Date" field with locale-formatted date for tasks with `due_at`
- Modal does NOT show "Due Date" field for tasks without `due_at`
- Modal close button works normally, returning to calendar view

**Verify:** Click various mini cards, verify modal content matches task.

### 3.3 Empty state

**Depends on:** 2.2
**Files:** `packages/hzl-web/src/ui/index.html`

In `renderCalendar()`, after filtering tasks for the visible month, check if the filtered list is empty. If so, display a centered empty state message inside the calendar container (below the navigation header, overlaying the grid). Message: "No tasks with due dates in [Month Year]". Use `var(--text-muted)` color, centered text.

This handles both cases: no tasks have `due_at` in this month, or the project filter excludes all tasks. (Satisfies R12.)

Still render the month grid so the calendar structure is visible and navigable.

No test file — manual verification.

**Test scenarios:** (manual)
- Month with no due-dated tasks → shows "No tasks with due dates in February 2026"
- Project filter active that excludes all tasks → same empty message
- Navigate to month with tasks → empty state disappears, cards render
- Empty state does not prevent month navigation

**Verify:** Navigate to a month with no tasks, confirm message appears.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `due_month` query returns many tasks for a busy month | Bounded by one month + 2 days padding. Even a very busy month is manageable for a CLI task tracker |
| Timezone month-boundary mismatch | Server pads ±1 day; client filters precisely by local timezone. A task due `2026-03-01T05:00:00Z` (Feb 28 in US Pacific) is included in Feb query and rendered on the correct local day |
| Single HTML file becomes unwieldy (~2500+ lines) | Already ~2400 lines. Calendar adds ~300-400 lines. Manageable for now; extraction to separate files is a future concern |

## Open Questions

None — all decisions resolved.
