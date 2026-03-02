# Design Direction: Nav Header

**Date:** 2026-03-01
**Rounds:** 1
**Gallery:** docs/design-explorations/2026-03-01-nav-header/v1.html

## Chosen Direction

### B1+B2 "Collapsible Rail" — Family B "Compact Rail"

**Approach:** View navigation lives in a vertical left sidebar, freeing the entire top bar for contextual filters and actions. The rail supports two states: expanded (labeled, ~120px) and collapsed (icon-only, ~48px), giving discoverability when needed and space efficiency when not.

This combines the best of B1 "Icon Rail" and B2 "Label Rail":

- **Expanded state (default):** ~120px wide rail with HZL logo at top, then text-labeled view links with small preceding icons. Active view has a filled background pill. Labels make views immediately scannable.
- **Collapsed state:** ~48px wide rail with just icons. Active view indicated by accent bar or background fill. Tooltip on hover shows the view name. A toggle control (chevron or hamburger) in the rail switches between states.
- **Top bar:** Full-width horizontal bar holding contextual filters (date, project, agent, tags), search input, settings gear, connection status, and Activity button. Filters adapt per view (e.g., minimal or hidden on Agents view).
- **Mobile:** Rail collapses entirely into a bottom tab bar with icons + short labels. Top bar becomes a compact filter/search strip.

### Key Design Decisions

1. **Three conceptual layers, spatially separated:**
   - View switching: vertical rail (left)
   - Contextual filters: horizontal top bar
   - Activity: global action in top bar, available on all views

2. **Rail collapse is user-controlled** — a toggle in the rail (bottom or top) lets the user expand/collapse. Preference persists across sessions. Default: expanded.

3. **Active view indicator:** Filled background pill in expanded state, left accent bar in collapsed state.

4. **Filter bar adapts per view:**
   - Kanban: date, project, agent, tags, search, settings
   - Calendar: project, agent, tags, search, settings (no date filter)
   - Graph: project, search, settings
   - Agents: minimal — just project filter and search, or empty

5. **Activity button is global** — present in the top bar on all views, always accessible.

## Design Parameters

- Rail expanded width: ~120px
- Rail collapsed width: ~48px
- Rail background: `--bg-secondary` (#252525) with right border
- Active item: filled `--bg-card` (#2d2d2d) with left amber accent
- View icons: 16px simple geometric SVGs before each label
- Top bar height: ~42px, same styling as current header
- Collapse toggle: chevron icon at bottom of rail, rotates on toggle
- Mobile breakpoint: ~768px — rail becomes bottom tab bar

## Context

The HZL dashboard header was a single row with ~10 elements (logo, view dropdown, 4 filter dropdowns, search, settings, connection status, activity) that overflowed on narrow viewports. The view switcher was buried in a settings dropdown, making it undiscoverable.

The redesign separates navigation from filtering spatially: views move to a persistent left rail, filters stay in a horizontal top bar. This eliminates the crowding problem and makes view switching a primary, always-visible action.
