# Calendar View for Web Dashboard - PRD

**Date:** 2026-02-09
**Status:** Brainstorming

## Goal

Add a calendar month view to the hzl web dashboard so users can visualize tasks by their due dates. Tasks with a `due_at` date appear on the calendar on the day they're due, and tapping a task opens the existing task detail modal. This gives users a time-oriented perspective on their work alongside the existing status-oriented (Kanban) and relationship-oriented (Graph) views.

## Scope

### In Scope

- Month-view calendar as a third view tab (tab order: Kanban → Calendar → Graph)
- Tasks with `due_at` dates displayed as mini cards on their due day, using the browser's local timezone
- Mini cards show task title + project badge, color-coded by status (same palette as Kanban). Single-line with ellipsis truncation, styled consistently with Kanban card badges.
- Tapping a mini card opens the existing task detail modal
- Month navigation: previous/next month arrows and a "Today" button to return to current month
- Overflow handling: show up to 3 mini cards per day cell, then a "+N more" link
- "+N more" opens a popover anchored to the day cell listing all tasks. Popover dismisses on click-outside. Mini cards inside the popover are clickable (open task modal).
- Today's date visually highlighted on the calendar grid
- Existing project filter applies to the calendar view
- Date filter control is hidden when calendar view is active (restores previous value when switching back to Kanban/Graph)
- Display `due_at` in the task detail modal (currently missing from modal), formatted in the user's locale
- Empty state: when no tasks have `due_at` in the visible month, show a message like "No tasks with due dates this month"
- Task list API needs to include `due_at` in list responses (currently only returned by detail endpoint) so the calendar can render without N+1 requests

### Boundaries

- **No drag-to-reschedule** — the calendar is view-only. Editing due dates is done through the CLI or future modal enhancements, not by dragging on the calendar.
- **No task creation from calendar** — clicking an empty day does not create a task.
- **No overdue visual treatment** — tasks past their due date look the same as any other task. Simplicity over visual noise.
- **No week or day views** — month view only. Other time scales can be added later if needed.
- **No external calendar library** — built with vanilla JS and CSS Grid, consistent with the existing dashboard approach.
- **No due date editing from the modal** — the modal displays `due_at` as read-only information.
- **Tasks without `due_at` do not appear on the calendar** — the calendar only shows tasks that have a due date set.
- **No mobile-specific layout** — basic CSS responsiveness only. Dedicated mobile UX deferred until real usage warrants it.

## Requirements

| ID | Priority | Requirement |
|----|----------|-------------|
| R1 | Core | Calendar displays a month grid with tasks positioned on their `due_at` date, using browser local timezone |
| R2 | Core | Tapping a task mini card opens the existing task detail modal |
| R3 | Must | Month navigation via prev/next arrows and a "Today" button |
| R4 | Must | Calendar is the second tab in the view toggle (Kanban → Calendar → Graph) |
| R5 | Must | Mini cards show task title (single-line, ellipsis truncation) and project badge, with left-border color indicating status |
| R6 | Must | Day cells show up to 3 mini cards; overflow shows a "+N more" popover (dismisses on click-outside, cards inside are clickable) |
| R7 | Must | Today's date is visually distinguished on the calendar grid |
| R8 | Must | Existing project filter applies to calendar view (filters which tasks appear) |
| R9 | Must | `due_at` field displayed in the task detail modal metadata grid, locale-formatted |
| R10 | Must | Date filter control hidden when calendar view is active; restores previous value when switching views |
| R11 | Must | Task list API includes `due_at` so calendar can render without per-task detail requests |
| R12 | Must | Empty state message when no tasks have due dates in the visible month |
| R13 | Out | Drag-to-reschedule — calendar is view-only |
| R14 | Out | Week/day views — month view only for v1 |
| R15 | Out | Task creation from clicking empty days |
| R16 | Out | Mobile-specific layout — basic CSS responsiveness only for v1 |

## Chosen Direction

Custom vanilla JS + CSS Grid calendar, built from scratch without external libraries. The dashboard is already a single HTML file with vanilla JS, and the calendar is view-only (no drag/drop complexity), making a custom implementation straightforward and consistent with the existing codebase. This avoids adding CDN dependencies for what is fundamentally a styled grid with click handlers.

## Alternatives Considered

- **Lightweight calendar library via CDN** — would reduce initial code but adds a dependency and may fight the library's styling opinions for a simple view-only grid.
- **FullCalendar via CDN** — full-featured but heavyweight for a view-only calendar with no drag/drop or event editing.

## Key Decisions

- **Status color-coding (not project or priority):** Mini cards use the same status-based color scheme as Kanban cards for visual consistency across views.
- **Mini cards (not pills or dots):** Each task shows title + project badge rather than just a colored dot or pill. Provides enough context to be useful without needing to click every task.
- **"+N more" popover (not scrollable cells or inline expansion):** Keeps the calendar grid visually clean with uniform row heights. A floating popover anchored to the day cell lists all tasks without disrupting the grid layout.
- **No overdue treatment:** Tasks past their due date are displayed normally. Avoids visual clutter and keeps the implementation simple.
- **Date filter hidden in calendar view:** The existing date filter filters by `updated_at` for recent activity. The calendar has its own month-based navigation, so the date filter is hidden (not disabled/grayed) to avoid confusion. Previous filter value restores when switching back.
- **Browser local timezone:** `due_at` ISO timestamps are converted to the browser's local timezone for display. A task due at `2026-02-15T02:00:00Z` appears on Feb 14 for a US Pacific user.
- **Weeks start on Sunday:** Consistent with most US calendar conventions. Can be made configurable later if needed.

## Next Steps

> Review PRD, then create technical plan.
