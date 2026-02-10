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
│    1. Tasks already filtered by due_month       │
│    2. Build 7-col CSS Grid (Sun–Sat)            │
│    3. Place mini cards in day cells             │
│    4. Show "+N more" after 3 cards per cell     │
│                                                 │
│  Popover (click "+N more"):                     │
│    - Anchored to day cell                       │
│    - Lists all tasks for that day               │
│    - Click-outside dismisses                    │
│    - Cards inside open task modal               │
│                                                 │
│  openTaskModal() ─► existing modal (+ due_at)   │
└─────────────────────────────────────────────────┘
```

**Key decisions:**

- **Server-side `due_month` filtering** — When calendar is active, `fetchTasks()` sends `due_month=YYYY-MM` instead of `since=Xd`. The server queries tasks where `due_at` falls within that month — semantically correct (filters by due date, not last-updated date). This ensures a task due next week is always visible regardless of when it was last modified. When switching back to Kanban/Graph, the regular `since` filter resumes.

- **Separate data paths per view** — Kanban/Graph fetch tasks by `updated_at` (via `since`). Calendar fetches tasks by `due_at` (via `due_month`). The `tasks` global holds whatever the active view needs. Switching views triggers a re-poll with the appropriate parameters.

- **Mini cards, not full Kanban cards** — Calendar cells are small, so cards show only title (single-line, ellipsis) and project badge with a status-colored left border. Created by a new `renderMiniCard(task)` function, separate from the Kanban `renderCard()`.

---

## 1. Backend — API Changes

### 1.1 Add `due_at` to `TaskListItem` interface and query mapping

**Depends on:** none
**Files:** `packages/hzl-core/src/services/task-service.ts`, `packages/hzl-core/src/services/task-service.test.ts`

The `TaskListItem` interface (defined near `listTasks()`) omits `due_at` even though the SQL query already selects it. Add `due_at: string | null` to the interface and include it in the `rows.map()` return object inside `listTasks()`.

The web server's `TaskListItemResponse` extends `CoreTaskListItem` via spread, so `due_at` will flow through to the API response automatically — no `server.ts` change needed for this field.

Follow the pattern of other nullable fields like `assignee` and `lease_until` in the interface. (Satisfies R11.)

**Test scenarios:** (`packages/hzl-core/src/services/task-service.test.ts`)
- Task created with `due_at` → `listTasks()` result includes `due_at` value
- Task created without `due_at` → `listTasks()` result has `due_at: null`
- Task with `due_at` updated via event → `listTasks()` reflects the updated value

**Verify:** `pnpm --filter hzl-core test src/services/task-service.test.ts`

### 1.2 Add `due_month` query parameter for calendar data

**Depends on:** 1.1
**Files:** `packages/hzl-core/src/services/task-service.ts`, `packages/hzl-core/src/services/task-service.test.ts`, `packages/hzl-web/src/server.ts`, `packages/hzl-web/src/server.test.ts`

Add a new `due_month` parameter to the `/api/tasks` endpoint. When `due_month=YYYY-MM` is present, the server queries tasks where `due_at` falls within that month instead of filtering by `updated_at`.

**Core layer:** Add a new option to `listTasks()` — e.g., `dueMonth?: string` (format `YYYY-MM`). When present, replace the `updated_at >= datetime(...)` WHERE clause with `due_at >= ? AND due_at < ?` using the first and last instants of the month (e.g., `2026-02-01T00:00:00Z` to `2026-03-01T00:00:00Z`). Still exclude archived tasks. Still respect the `project` filter. The `sinceDays` parameter should be ignored when `dueMonth` is provided.

**Server layer:** In `handleTasks()`, check for a `due_month` query param. If present, pass it to `taskService.listTasks({ dueMonth, project })`. If absent, use the existing `since`/`sinceDays` logic unchanged. This keeps backward compatibility — Kanban/Graph requests are unaffected.

Follow the pattern of how `project` is passed through from the server to the service. (Satisfies R11 data availability.)

**Test scenarios:** (`packages/hzl-core/src/services/task-service.test.ts`, `packages/hzl-web/src/server.test.ts`)
- `listTasks({ dueMonth: '2026-02' })` → returns only tasks with `due_at` in February 2026
- Task with `due_at` in January → excluded from February query
- Task with no `due_at` → excluded from `dueMonth` query
- `due_month` with `project` filter → both filters apply
- `GET /api/tasks?due_month=2026-02` → returns tasks due in February
- `GET /api/tasks?due_month=2026-02&project=demo` → project filter applies
- Tasks with `due_at` at month boundaries (first/last instant) → correctly included/excluded

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
- Hide the date filter control: `dateFilter.closest('.filter-group').style.display = 'none'` for calendar, restore to `''` for other views. (Satisfies R10.)
- When switching TO calendar: trigger a re-poll so data is fetched with `due_month`
- When switching FROM calendar: trigger a re-poll so data reverts to the regular `since` value

Modify `fetchTasks()` to check `activeView`: if `'calendar'`, build the URL as `/api/tasks?due_month=YYYY-MM` (using `calendarYear` and `calendarMonth` globals from subtask 2.2) instead of the `since` parameter. Project filter still appended as usual. (Depends on 1.2 for the server to support `due_month`.)

Also extend `poll()` to call a new `renderCalendar()` function when `activeView === 'calendar'`. Follow the pattern of how `renderBoard()` and `updateGraphData()` are called conditionally.

No test file for this subtask — it's HTML/CSS/JS in the single-page app, verified manually.

**Test scenarios:** (manual)
- Click Calendar tab → calendar container visible, Kanban hidden, Graph hidden
- Date filter hidden when Calendar active, visible when switching to Kanban/Graph
- Switching to Calendar triggers data re-fetch (visible in Network tab)
- Calendar tab shows `.active` class styling (orange background)

**Verify:** Build (`pnpm build`), start server (`node packages/hzl-cli/dist/cli.js serve`), open dashboard, click Calendar tab.

### 2.2 Build month grid with CSS Grid and navigation

**Depends on:** 2.1
**Files:** `packages/hzl-web/src/ui/index.html`

**CSS:** Add styles for the calendar layout:
- `.calendar-container` — full width, padding consistent with `.board`
- `.calendar-header` — flexbox row with prev/next arrows, month/year label, and "Today" button. Style arrows and button consistent with existing `.view-btn` styling (using `var(--bg-card)`, `var(--text-primary)`, hover effects)
- `.calendar-grid` — CSS Grid with `grid-template-columns: repeat(7, 1fr)`. This creates the 7-day week layout
- `.calendar-day-header` — day-of-week labels (Sun, Mon, ..., Sat). Use `var(--text-muted)` color, centered, small uppercase text
- `.calendar-day` — individual day cell. Dark background (`var(--bg-card)`), border (`var(--border)`), min-height for consistent row sizing (~120px), padding for content
- `.calendar-day.today` — today's cell gets a distinguished border color (`var(--accent)`) and subtle background tint. (Satisfies R7.)
- `.calendar-day.other-month` — days from prev/next month that fill out the grid get dimmed styling (`var(--text-muted)` for the date number, slightly transparent background)
- `.calendar-day-number` — the date number in each cell, positioned top-left

**JS:** Add `renderCalendar()` function and month navigation state:
- Track `calendarYear` and `calendarMonth` (0-indexed) globals, initialized to current date
- `renderCalendar()` builds the grid: compute first day of month, number of days, leading/trailing days from adjacent months (so the grid always starts on Sunday). Generate the day cells. Place content (mini cards come in 2.3)
- Navigation functions: `calendarPrev()` decrements month (wrapping year), `calendarNext()` increments, `calendarToday()` resets to current month/year. Each calls `renderCalendar()` to re-render
- Month/year label shows `"February 2026"` format using `Date.toLocaleDateString()` with `{ month: 'long', year: 'numeric' }`. (Satisfies R3.)
- Weeks start on Sunday. (Key decision from PRD.)

No test file — manual verification.

**Test scenarios:** (manual)
- Calendar shows current month with correct number of days
- Day cells are aligned to correct days of the week (verify Feb 2026 starts on Sunday)
- Today's date has visual distinction (accent border)
- Prev/Next arrows navigate months correctly, including year boundary (Dec → Jan)
- "Today" button returns to current month from any other month
- Leading/trailing days from adjacent months are visually dimmed

**Verify:** Build, open dashboard, switch to Calendar, navigate months, verify grid correctness.

### 2.3 Render mini task cards in day cells

**Depends on:** 1.1, 2.2
**Files:** `packages/hzl-web/src/ui/index.html`

**CSS:** Add styles for mini cards:
- `.calendar-mini-card` — small card with `border-left: 3px solid var(--status-color)`. Dark background (`var(--bg-secondary)` or slightly lighter than cell), rounded corners (3px), padding (4px 6px), cursor pointer, hover effect. Height ~24-28px
- `.calendar-mini-title` — single-line text with `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. Use small font size (~11px)
- `.calendar-mini-project` — small badge matching Kanban `.card-project` style but smaller. Inline after title or below it depending on space
- `.calendar-more-link` — the "+N more" text link. Use `var(--accent)` color, smaller font, cursor pointer

**JS:** In `renderCalendar()`, after building the grid:
1. Filter the `tasks` array: only tasks where `due_at` is not null AND the `due_at` date (in browser local timezone) falls within the visible month. Apply project filter if active (check `projectFilter.value`)
2. Group filtered tasks by day-of-month using `new Date(task.due_at).getDate()` (after converting to local timezone)
3. For each day cell, render up to 3 mini cards using a new `renderMiniCard(task)` helper. Each card gets a `data-task-id` attribute for click handling
4. If a day has more than 3 tasks, render a "+N more" link below the 3rd card (where N = total - 3). Add a `data-date` attribute for the popover (subtask 3.1). (Satisfies R1, R5, R6.)

`renderMiniCard(task)` returns an HTML string:
- Left border color: map `task.status` to the CSS variable (e.g., `var(--status-ready)`). Follow the same status→color mapping used in the Kanban `renderCard()` function's family color logic
- Title: `task.title` escaped with `escapeHtml()` (existing utility)
- Project badge: small `<span>` with project name, styled like Kanban `.card-project` but smaller

**Important:** The existing project filter should apply to the calendar view. When rendering, check `projectFilter.value` and filter accordingly. (Satisfies R8.)

No test file — manual verification.

**Test scenarios:** (manual)
- Create tasks with `due_at` dates in current month → appear as mini cards on correct days
- Tasks without `due_at` → do not appear on calendar
- Mini card shows truncated title and project badge
- Mini card left border color matches task status
- Day with 4+ tasks shows 3 cards + "+1 more" link
- Project filter limits which tasks appear on calendar
- Tasks from adjacent months' overflow days appear dimmed (if applicable)

**Verify:** Create test tasks with `due_at` via CLI (`node packages/hzl-cli/dist/cli.js task add "Test" -p demo --due 2026-02-15`), build, open dashboard Calendar view.

---

## 3. Calendar Interactions and Polish

### 3.1 "+N more" popover

**Depends on:** 2.3
**Files:** `packages/hzl-web/src/ui/index.html`

**CSS:** Add popover styles:
- `.calendar-popover` — positioned absolute, anchored below/above the "+N more" link (use JS to calculate position). Dark background (`var(--bg-card)`), border (`var(--border)`), box-shadow for depth, rounded corners (6px), padding, z-index above the grid. Max-height with overflow-y auto for very long lists
- `.calendar-popover-header` — shows the date (e.g., "February 15") in small text at top
- Mini cards inside the popover reuse `.calendar-mini-card` styles

**JS:** Add popover show/hide logic:
- Click handler on "+N more" links: create and position the popover element. Populate with all tasks for that day (not just the overflow — show all tasks so the user sees the complete list in one place). Each card gets `data-task-id` for click-through to modal
- Position calculation: anchor to the "+N more" element. If near bottom of viewport, open upward. Use `getBoundingClientRect()` for positioning
- Dismiss: add a click-outside listener on `document`. If click target is not inside the popover, remove it. Also dismiss when opening a different day's popover. Follow the pattern of how the modal overlay handles click-outside (the existing `modalOverlay` click handler)
- Only one popover visible at a time — opening a new one closes the previous

(Satisfies R6 popover behavior.)

No test file — manual verification.

**Test scenarios:** (manual)
- Click "+2 more" → popover appears showing all tasks for that day (not just the 2 overflow)
- Popover has date header (e.g., "February 15")
- Click outside popover → dismisses
- Click "+N more" on different day → previous popover closes, new one opens
- Popover cards are clickable (verified in 3.2)
- Popover near bottom of screen opens upward

**Verify:** Create 5+ tasks on the same due date, build, open Calendar, click "+N more".

### 3.2 Wire clicks to task modal and add `due_at` to modal

**Depends on:** 2.3, 3.1
**Files:** `packages/hzl-web/src/ui/index.html`

**Click handling:** Add event delegation on `#calendarContainer` for clicks on `.calendar-mini-card` elements. Extract `data-task-id` from the clicked card and call `openTaskModal(taskId)` — the existing modal function handles everything. This works for cards in both day cells and the popover. If a popover is open, dismiss it when the modal opens. (Satisfies R2.)

**Add `due_at` to modal meta grid:** In the `openTaskModal()` function, after the existing meta items (Status, Progress, Project, Priority, Created), add a conditional "Due Date" item when `data.task.due_at` is not null. Format using `new Date(data.task.due_at).toLocaleDateString()` for locale-appropriate display (e.g., "2/15/2026" in en-US). Insert it in the meta grid HTML template string, following the same `modal-meta-item` / `modal-meta-label` / `modal-meta-value` structure as existing items. (Satisfies R9.)

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

In `renderCalendar()`, after filtering tasks for the visible month, check if the filtered list is empty. If so, display a centered empty state message inside the calendar container (below the navigation header, overlaying or replacing the grid). Message: "No tasks with due dates in [Month Year]". Use `var(--text-muted)` color, centered text, with some vertical padding.

This should also handle the case where the project filter excludes all tasks for the month — the empty state message is the same. (Satisfies R12.)

Still render the month grid behind/around the message so the calendar structure is visible and navigable. The empty state is a message overlaid on the grid or placed where cards would go, not a replacement for the entire calendar.

No test file — manual verification.

**Test scenarios:** (manual)
- Month with no due-dated tasks → shows "No tasks with due dates in February 2026"
- Project filter active that excludes all tasks → same empty message
- Navigate to month with tasks → empty state disappears, cards render
- Empty state does not prevent month navigation

**Verify:** Navigate to a month with no tasks, confirm message appears.

---

## Testing Strategy

- **Unit tests (backend):** `task-service.test.ts` for `due_at` in `TaskListItem` and `dueMonth` filtering, `server.test.ts` for `due_month` parameter
- **Integration tests:** None needed — the calendar is client-side rendering from the same API
- **Manual verification steps:**
  1. Build: `pnpm build`
  2. Create test data: `node packages/hzl-cli/dist/cli.js task add "Due today" -p demo --due $(date -u +%Y-%m-%dT%H:%M:%SZ)` and several more with various dates
  3. Start server: `node packages/hzl-cli/dist/cli.js serve`
  4. Open `http://localhost:3456`, switch to Calendar view
  5. Verify: tasks on correct days, navigation works, "+N more" popover, click-to-modal, empty state, project filter, date filter hidden

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `due_month` query returns many tasks for a busy month | Bounded by one month; even a very busy month is manageable. Server-side filtering keeps response size proportional to the month |
| Timezone edge case: task appears on wrong day | Use `new Date(isoString)` which handles timezone conversion to browser local. Document this behavior |
| Popover positioning near viewport edges | Use `getBoundingClientRect()` and flip direction (up vs down) when near bottom. Same approach used by tooltip libraries |
| Single HTML file becomes unwieldy (~2500+ lines) | Already ~2400 lines. Calendar adds ~300-400 lines. Manageable for now; extraction to separate files is a future concern |

## Open Questions

None — all decisions resolved.
