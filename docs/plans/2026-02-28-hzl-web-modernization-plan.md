# Proposal: HZL Web Dashboard Modernization (Core Operator Observability)

**Date:** 2026-03-01
**Status:** Proposed
**Audience:** HZL maintainers and contributors
**Supersedes:** Prior “React-first SPA” proposal and the “Preact minimalism” counter-proposal, by updating the decision criteria now that the dashboard is a core product surface.  

---

## Executive summary

The HZL web dashboard is no longer a side project. It is the primary observability interface for the human operator. Relying on CLI queries for ongoing visibility is not practical, so the dashboard must be treated as a product-critical UI.

**Decision:** Modernize the dashboard to a **React + Vite + TypeScript** application, embedded and served by the CLI, with an explicitly “lean by default” dependency policy.

**Key nuance:** Adopt React for long-term maintainability and contributor familiarity, but **do not** automatically adopt a full SPA stack (React Query + Zustand) on day one. Start with typed fetch + SSE + React state/context, and only add heavier tooling when it clearly pays for itself (mostly when “write” capabilities and optimistic updates become central).

**Non-negotiable reliability fix:** Bundle all dependencies currently loaded from CDNs (`marked`, `dompurify`, `d3`, `force-graph`, etc.) so the dashboard does not depend on external internet access.

---

## Context and problem statement

The current dashboard is a single, large monolithic `index.html` with inline JS and CSS, which has real costs:

* Hard to maintain and safely evolve (no imports, no component boundaries, no type checks)
* Hard to test and refactor without regressions
* Hard to add richer interaction and “control plane” write actions cleanly
* Fragile runtime dependency story when libraries are pulled from CDNs

This was tolerable when the dashboard was a “nice-to-have” viewer. It is no longer tolerable when the dashboard is the operator’s primary surface.

---

## Product principles (what changes now that the dashboard is core)

When the dashboard is core, the design center shifts:

### 1) Reliability beats minimalism

If the operator cannot trust the dashboard, it fails its primary job.

### 2) Maintainability is a feature

We should optimize for “safe change velocity” because the dashboard will likely continue to grow.

### 3) Familiar defaults matter

We should prefer widely understood patterns and tools so contributors can jump in quickly and so we can lean on mature ecosystem solutions when needed.

### 4) Dependency weight still matters, but it is no longer the top constraint

Because the UI ships with a CLI, bundle size and startup cost are still real constraints. We will manage that with budgets and intentional adoption, not by choosing the lightest possible framework at the expense of ecosystem reliability.

---

## Goals and non-goals

### Goals

* **Component boundaries + type safety**

  * Vite dev loop
  * TypeScript
  * Shared types between frontend and `hzl-core`
* **Keep CLI portability**

  * UI build output must be served by the CLI without requiring external runtime files
* **Eliminate CDN fragility**

  * Dashboard must function in “no internet” environments
* **Safe migration**

  * Parallel build and feature toggle until parity and confidence
* **Create a foundation for “control plane” write actions**

  * Comments, assignment, status override, etc.

### Non-goals (for this modernization effort)

* Turning HZL into a multi-route SaaS dashboard with deep client-side routing
* SSR, streaming HTML, or complex server-driven UI
* Adopting a large UI framework and icon system by default
* Prematurely introducing advanced caching layers before we have the complexity that warrants them

---

## Decision: React + Vite + TypeScript, lean-by-default

### Why React now

React is the right “default” framework for a product-critical operator UI because:

* Contributor familiarity is maximized (fast onboarding, fewer bespoke patterns)
* The ecosystem for accessibility primitives, DnD, and interaction patterns is broad and well tested
* We reduce “compatibility edge case” risk that can show up when mixing less common frameworks with third-party libraries (especially in dialogs, portals, focus management, and DnD)

This directly addresses the reality that the dashboard is now a key part of the product, not a developer toy.

### Why not “full stack” React on day one

The counter-proposal correctly notes that the dashboard’s *current* data model is simple, and that adding React Query and Zustand can be premature complexity if you are mostly doing “fetch tasks, render tasks, SSE tells you to refetch.” 

So we keep React, but we adopt a rule:

> **No dependency without a demonstrated need tied to operator value or engineering risk reduction.**

This provides the maintainability upside of React without immediately paying the full complexity and bundle overhead of additional state layers.

---

## Proposed architecture

### Frontend stack

* **React** for UI components
* **TypeScript** across UI and shared types
* **Vite** for dev/build tooling
* **Vanilla CSS initially**

  * Optional: CSS Modules later if scoping becomes painful
* **No router initially**

  * Keep “view state” in URL params for shareability (filters, active view, selected task)
* **No global state library initially**

  * Use `useState`, `useReducer`, `useContext`, URL params, and localStorage

### Data layer

* Typed `fetch` wrapper using shared types from `hzl-core`
* SSE client module that emits events (connected, disconnected, new event)
* A small invalidation layer:

  * On SSE signal, refetch core lists (tasks, activity feed)
  * On filter changes, refetch with the new query

**Trigger to adopt React Query:** when we have multiple resources, mutations with optimistic updates, and enough invalidation complexity that ad-hoc fetch code becomes error-prone.

### Embedding and portability (CLI distribution)

We keep the portable “served by the CLI” story:

1. `vite build` outputs the UI bundle to `packages/hzl-web/dist/ui` (or similar)
2. A build step updates the server’s embedded asset source (`ui-embed.ts` or an equivalent) so the CLI can serve the UI without external dependencies at runtime
3. The CLI continues to serve a single dashboard experience, regardless of whether the user installed via npm/Homebrew/etc.

**Important:** this does not prevent a better dev experience. In dev mode, we should run Vite’s dev server with a proxy to the API endpoints served by `hzl serve`.

### Eliminate CDN fragility (required)

All libraries currently loaded from CDNs must be included as npm dependencies and bundled by Vite. This includes:

* Markdown rendering: `marked` + sanitization (`dompurify`)
* Graph view dependencies: `d3`, `force-graph` (and any other visualization libs)

This is a reliability requirement now that the dashboard is core.

---

## Dependency policy (how we keep React lean)

We will explicitly gate major dependencies behind clear criteria.

### State management

| Need                                                  | Default approach                                 | Add a library when…                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| UI state (filters, view selection, panel open/closed) | URL params + localStorage + React state/context  | State becomes deeply shared and hard to reason about across many components                              |
| Server state (tasks, activity, per-task details)      | Typed fetch hooks + SSE invalidation             | We have multiple resource types, non-trivial cache invalidation, pagination, retries, and many mutations |
| Optimistic updates                                    | Manual optimistic UI only for the simplest cases | Mutations become common and we need consistent rollback behavior                                         |

### UI primitives (dialogs, menus, popovers)

* Default: implement only what we need with careful focus management
* If accessibility edge cases become a time sink, adopt a headless accessible primitive library (example: Radix UI) for the most complex primitives only (Dialog first)

### Drag and drop

* Not a phase-1 requirement
* Consider after “write” endpoints exist and we validate that DnD materially improves operator workflow versus simple status controls

### Bundle budgets

Because this still ships inside a CLI distribution, we should set explicit budgets:

* A max gzipped size budget for the embedded UI bundle
* A “dependency growth review” rule: any new dependency above a threshold needs a short justification

This allows React while preventing uncontrolled bloat.

---

## Implementation plan

### Phase 0: Build + reliability foundation

**Deliverables**

* Vite + React + TypeScript app scaffold inside `packages/hzl-web`
* Shared types import path to `hzl-core`
* Bundled replacements for all CDN-loaded libraries
* Embedded build pipeline (build output becomes what the CLI serves)
* Dev mode:

  * Vite dev server
  * Proxy API calls to `hzl serve`
  * HMR for UI iteration

**Exit criteria**

* Running `hzl serve` can serve either:

  * the legacy dashboard, or
  * the new dashboard
* Dashboard loads with no network access and still renders correctly

---

### Phase 1: Read-only parity (core observability)

**Deliverables**

* Layout shell (header, board, optional side panel)
* Kanban board with the same statuses/columns as today
* Task cards with the same key metadata and visuals (status, progress, badges)
* Filters and view state persisted via URL + localStorage
* SSE-driven refresh working and visibly indicated (connection status + last updated time)

**Exit criteria**

* Operators can use the new dashboard as a drop-in replacement for the old one for day-to-day observability

---

### Phase 2: Detail and secondary views parity

**Deliverables**

* Task detail modal (description, tags, links, events, comments, checkpoints)
* Markdown rendering via bundled libs (and sanitized output)
* Activity panel feed parity
* Calendar view parity (if present today)
* Graph/dependency view parity (bundle visualization libs)

**Exit criteria**

* Full functional parity with the current dashboard
* Legacy `index.html` can be removed after a soak period

---

### Phase 3: Control plane (“write” capabilities)

**Deliverables**

* Server endpoints for:

  * status change
  * comments
  * assignment
* UI controls in task modal for:

  * adding comments
  * changing status
  * assigning or reassigning
* Validation and tests on server endpoints

**Exit criteria**

* Operator can take basic corrective and coordination actions without dropping to CLI commands

---

### Phase 4: Workflow acceleration and polish (optional)

**Candidates**

* Drag-and-drop between kanban columns
* Optimistic UI updates (especially if network latency is noticeable)
* Undo for status changes
* Toast notifications
* Keyboard shortcuts and power-user navigation

**Gating criteria**

* Implement only if it materially improves operator throughput and reduces friction

---

## Migration strategy

1. Build new UI in parallel with the existing dashboard.
2. Add a feature toggle to choose which UI is served.
3. Drive parity first, then replace by default.
4. Remove legacy dashboard after:

   * parity is confirmed
   * operator workflow is stable
   * “write” operations (if added) are validated

---

## Risks and mitigations

### Risk: React adds weight to a CLI-shipped UI

**Mitigation**

* Bundle budgets
* Dependency gating
* Avoid unnecessary libraries until there is proven complexity

### Risk: Accessibility and interaction bugs (modals, focus traps)

**Mitigation**

* Treat accessibility as a first-class requirement
* Adopt a headless accessible primitive library selectively if needed (Dialog first)

### Risk: SSE + fetching logic becomes ad-hoc and hard to maintain

**Mitigation**

* Centralize data access patterns in a small API client and a small set of hooks
* Adopt React Query if/when mutation complexity and cache invalidation justify it

### Risk: Offline or restricted-network environments break the dashboard

**Mitigation**

* Bundle all dependencies currently pulled from CDNs
* Avoid runtime network dependencies beyond the local `hzl serve` API

---

## Open questions (decisions we can defer)

* **Auth and remote access:** If operators use the dashboard over a LAN, do we need a minimal token gate? This should not block modernization, but it might matter once “write” actions exist.
* **UI primitives:** How soon do we want a headless UI library for dialogs/menus?
* **Performance at scale:** If task lists grow large, do we need list virtualization? (We should measure once the React version exists.)

---

## References

* Original React-based modernization proposal (Gemini, 2026-02-28). 
* Review and counter-proposal emphasizing minimalism, bundle size, and CDN fragility (Opus, 2026-02-28). 

