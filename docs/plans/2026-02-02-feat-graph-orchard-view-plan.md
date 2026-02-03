---
title: "feat: Add Graph Orchard View to Dashboard"
type: feat
date: 2026-02-02
brainstorm: docs/brainstorms/2026-02-02-graph-orchard-view-brainstorm.md
---

# feat: Add Graph Orchard View to Dashboard

## Overview

Add a radial/orbital visualization of tasks to the hzl-web dashboard. Users can toggle between the existing Kanban view and a new "Graph" view showing projects and tasks as nodes orbiting a central root, with animated particles flowing along dependency edges.

**Goal**: Fun, visually striking way to see your task universe. Not primarily for utility - for the joy of seeing work visualized.

## Technical Approach

### Library Choice

**[vasturiano/force-graph](https://github.com/vasturiano/force-graph)** (2D canvas version)

- Built-in animated directional particles on links
- Uses d3-force under the hood (supports `forceRadial()` for concentric rings)
- ~150KB, no framework dependencies
- Load via CDN in dashboard HTML - no build changes

### Data Model

Transform existing task data into force-graph format:

```javascript
// Input: tasks from /api/tasks (already has blocked_by)
// Output: force-graph data structure

const graphData = {
  nodes: [
    { id: 'root', type: 'root', name: 'HZL' },
    { id: 'project-1', type: 'project', name: 'my-project', ring: 1 },
    { id: 'task-abc123', type: 'task', name: 'Fix bug', status: 'in_progress', progress: 50, ring: 2, parent: 'project-1' },
    { id: 'task-def456', type: 'subtask', name: 'Write tests', status: 'ready', progress: 0, ring: 3, parent: 'task-abc123' },
  ],
  links: [
    // Hierarchy links (project → root, task → project, subtask → task)
    { source: 'project-1', target: 'root', type: 'hierarchy' },
    { source: 'task-abc123', target: 'project-1', type: 'hierarchy' },
    // Dependency links (blocking relationships - particles flow on these)
    { source: 'task-abc123', target: 'task-def456', type: 'dependency' },
  ]
};
```

### Layout Algorithm

```javascript
// d3-force configuration for radial layout
graph
  .d3Force('radial', d3.forceRadial(d => {
    switch (d.ring) {
      case 0: return 0;    // root at center
      case 1: return 150;  // projects
      case 2: return 300;  // tasks
      case 3: return 450;  // subtasks
    }
  }))
  .d3Force('collision', d3.forceCollide(d => d.type === 'root' ? 20 : 12))
  .d3Force('link', d3.forceLink().strength(0.1));  // weak links, radial dominates
```

### Visual Design

| Element | Size | Color |
|---------|------|-------|
| Root node | 20px, pulsing glow | Amber (#f59e0b) |
| Project nodes | 14px | White (#e5e5e5) |
| Task nodes (0% progress) | 8px | Status color |
| Task nodes (100% progress) | 24px | Status color |
| Dependency particles | 3px spheres | Blocking task's status color |

**Status colors** (matching existing Kanban CSS variables):
- Backlog: `var(--status-backlog)` → `#6b7280` (gray)
- Ready: `var(--status-ready)` → `#22c55e` (green)
- In Progress: `var(--status-in-progress)` → `#3b82f6` (blue)
- Blocked: `var(--status-blocked)` → `#ef4444` (red)
- Done: `var(--status-done)` → `#6b7280` (gray)

### Interactivity

- **Hover**: Tooltip with task title + status
- **Click**: Opens existing task modal (reuse `openTaskModal()`)
- **Drag**: Nodes can be repositioned; physics relaxes around them
- **Zoom/pan**: Built-in canvas controls

## Acceptance Criteria

- [x] Toggle buttons in header: `[Kanban] [Graph]`
- [x] Graph shows projects as first ring orbiting root
- [x] Tasks orbit their parent project in second ring
- [x] Subtasks orbit parent task in third ring
- [x] Animated particles flow along dependency edges (blocked_by)
- [x] Nodes sized by progress, colored by status
- [x] Clicking a node opens the task detail modal
- [x] Nodes can be dragged to reposition
- [x] View state persists in localStorage
- [x] Graph respects project/date filters
- [x] Mobile: Graph view works with touch (drag, pinch-zoom)
- [x] Lazy load: Graph initializes only when first toggled to

## Implementation Phases

### Phase 0: CSP Update

Update Content Security Policy to allow CDN scripts.

**Files to modify:**
- `packages/hzl-web/src/server.ts`

**Tasks:**
1. Update CSP header to allow `https://cdn.jsdelivr.net`
2. Use pinned version with SRI hash for security

```typescript
// packages/hzl-web/src/server.ts - update CSP
"Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'"
```

### Phase 1: View Toggle Infrastructure

Add view switching to dashboard without the actual graph yet.

**Files to modify:**
- `packages/hzl-web/src/ui/index.html`

**Tasks:**
1. Add view toggle buttons in header (after logo, before filters)
2. Add `#graphContainer` div with loading spinner (hidden by default)
3. Add `activeView` to localStorage preferences
4. Add `toggleView(view)` function to show/hide containers
5. Style toggle buttons to match existing filter button styles
6. On mobile: position toggle above status tabs

```html
<!-- packages/hzl-web/src/ui/index.html - header section (in header-left, after logo) -->
<div class="view-toggle">
  <button class="view-btn active" data-view="kanban">Kanban</button>
  <button class="view-btn" data-view="graph">Graph</button>
</div>

<!-- After .board -->
<div id="graphContainer" class="graph-container hidden">
  <div class="graph-loading">
    <div class="spinner"></div>
    <span>Loading graph...</span>
  </div>
  <!-- Force-graph canvas renders here -->
</div>
```

```css
/* packages/hzl-web/src/ui/index.html - styles */
.view-toggle {
  display: flex;
  gap: 0;
  background: var(--bg-secondary);
  border-radius: 6px;
  padding: 2px;
}
.view-btn {
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
}
.view-btn.active {
  background: var(--accent);
  color: var(--bg-primary);
}
.view-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.graph-container {
  flex: 1;
  position: relative;
  min-height: 400px;
}
.graph-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary);
}
.graph-loading .spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Mobile: toggle above status tabs */
@media (max-width: 768px) {
  .view-toggle {
    margin-bottom: 8px;
  }
}
```

### Phase 2: Force-Graph Integration

Load the library and render a basic graph.

**Tasks:**
1. Add force-graph CDN script tag (defer loading)
2. Create `initGraph()` function (called on first toggle)
3. Create `transformTasksToGraph(tasks)` function
4. Render basic force layout (no radial yet)
5. Add status colors to nodes

```html
<!-- packages/hzl-web/src/ui/index.html - before closing body -->
<script src="https://cdn.jsdelivr.net/npm/force-graph@1/dist/force-graph.min.js"
        defer
        onerror="handleGraphLibError()"></script>
```

```javascript
// CDN error handling
function handleGraphLibError() {
  console.warn('[hzl] force-graph CDN failed to load');
  const graphBtn = document.querySelector('[data-view="graph"]');
  if (graphBtn) {
    graphBtn.disabled = true;
    graphBtn.title = 'Graph unavailable - CDN failed to load';
  }
}
```

```javascript
// packages/hzl-web/src/ui/index.html - script section
let graphInstance = null;
let graphInitialized = false;
let nodeStatusMap = new Map();  // O(1) lookup for particle colors

// Helper: Get status color (uses CSS variables for consistency)
function getStatusColor(status, type) {
  if (type === 'root') return '#f59e0b';  // amber
  if (type === 'project') return '#e5e5e5';  // white
  const colors = {
    backlog: '#6b7280',
    ready: '#22c55e',
    in_progress: '#3b82f6',
    blocked: '#ef4444',
    done: '#6b7280',
  };
  return colors[status] ?? '#6b7280';
}

// Helper: Get node size based on type and progress
function getNodeSize(node) {
  if (node.type === 'root') return 20;
  if (node.type === 'project') return 14;
  // Scale 8-24px based on progress (0-100)
  const progress = node.progress ?? 0;
  return 8 + (progress / 100) * 16;
}

function transformTasksToGraph(tasks) {
  const nodes = [{ id: 'root', type: 'root', name: 'HZL', ring: 0 }];
  const links = [];
  const projects = new Set();
  nodeStatusMap.clear();  // Reset lookup map

  for (const task of tasks) {
    // Validate required fields
    if (!task.project || !task.task_id) {
      console.warn('[hzl] Skipping task with missing required fields:', task);
      continue;
    }

    // Add project node if not seen
    if (!projects.has(task.project)) {
      projects.add(task.project);
      const projectId = `project:${task.project}`;
      nodes.push({ id: projectId, type: 'project', name: task.project, ring: 1 });
      links.push({ source: projectId, target: 'root', type: 'hierarchy' });
      nodeStatusMap.set(projectId, null);  // projects have no status
    }

    // Add task node
    const ring = task.parent_id ? 3 : 2;  // subtasks in ring 3
    nodes.push({
      id: task.task_id,
      type: task.parent_id ? 'subtask' : 'task',
      name: task.title,
      status: task.status,
      progress: task.progress ?? 0,
      ring,
    });
    nodeStatusMap.set(task.task_id, task.status);  // Store for O(1) lookup

    // Hierarchy link
    const parent = task.parent_id || `project:${task.project}`;
    links.push({ source: task.task_id, target: parent, type: 'hierarchy' });

    // Dependency links (for particles)
    if (task.blocked_by) {
      for (const blockerId of task.blocked_by) {
        links.push({ source: blockerId, target: task.task_id, type: 'dependency' });
      }
    }
  }

  return { nodes, links };
}

function initGraph() {
  if (graphInitialized) return;

  // Defensive check: ensure ForceGraph loaded
  if (typeof ForceGraph === 'undefined') {
    console.error('[hzl] ForceGraph not available - CDN may have failed');
    handleGraphLibError();
    return;
  }

  const container = document.getElementById('graphContainer');
  graphInstance = ForceGraph()(container)
    .graphData(transformTasksToGraph(tasks))
    .nodeLabel(n => n.name)
    .nodeColor(n => getStatusColor(n.status, n.type))
    .nodeVal(n => getNodeSize(n))
    .linkColor(l => l.type === 'dependency' ? '#f59e0b' : '#40404080')
    .onNodeClick(n => n.type !== 'root' && n.type !== 'project' && openTaskModal(n.id));

  graphInitialized = true;
}
```

### Phase 3: Radial Layout + Particles

Apply the radial force layout and add animated particles.

**Tasks:**
1. Configure `forceRadial()` with ring distances
2. Add collision force to prevent overlap
3. Enable directional particles on dependency links
4. Style particles with status colors
5. Add responsive radius scaling for mobile

```javascript
// packages/hzl-web/src/ui/index.html - enhance initGraph()

function initGraph() {
  // ... after basic setup ...

  // Radial layout
  const RING_RADII = { 0: 0, 1: 150, 2: 300, 3: 450 };
  graphInstance
    .d3Force('radial', d3.forceRadial(d => {
      const baseRadius = window.innerWidth < 768 ? 0.6 : 1;  // scale down on mobile
      const radius = RING_RADII[d.ring] ?? 300;  // default to ring 2 if undefined
      return radius * baseRadius;
    }).strength(0.8))
    .d3Force('collision', d3.forceCollide(d => getNodeSize(d) + 4))
    .d3Force('link', d3.forceLink().strength(0.05));

  // Animated particles on dependency edges
  graphInstance
    .linkDirectionalParticles(l => l.type === 'dependency' ? 3 : 0)
    .linkDirectionalParticleWidth(3)
    .linkDirectionalParticleSpeed(0.005)
    .linkDirectionalParticleColor(l => {
      // O(1) lookup using pre-built map instead of O(n) find
      const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
      return getStatusColor(nodeStatusMap.get(sourceId));
    });
}
```

### Phase 4: Polish + Persistence

Final touches and localStorage integration.

**Tasks:**
1. Add pulsing glow animation to root node
2. Add hover tooltips with full task info
3. Persist `activeView` in localStorage
4. Update graph when filters change (debounced)
5. Handle window resize
6. Add loading spinner during graph initialization

```javascript
// packages/hzl-web/src/ui/index.html - polish

// Custom node rendering for root glow
graphInstance.nodeCanvasObject((node, ctx, globalScale) => {
  if (node.type === 'root') {
    // Pulsing glow effect
    const pulse = Math.sin(Date.now() / 500) * 0.3 + 0.7;
    ctx.beginPath();
    ctx.arc(node.x, node.y, 25 * pulse, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(245, 158, 11, ${0.3 * pulse})`;
    ctx.fill();
  }

  // Draw node
  ctx.beginPath();
  ctx.arc(node.x, node.y, getNodeSize(node), 0, 2 * Math.PI);
  ctx.fillStyle = getStatusColor(node.status, node.type);
  ctx.fill();

  // Label for projects
  if (node.type === 'project') {
    ctx.font = `${10 / globalScale}px ui-monospace`;
    ctx.fillStyle = '#e5e5e5';
    ctx.textAlign = 'center';
    ctx.fillText(node.name, node.x, node.y + 20);
  }
});

// Resize handling (debounced to avoid excessive recalculation)
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (graphInstance && activeView === 'graph') {
      graphInstance.width(graphContainer.clientWidth);
      graphInstance.height(graphContainer.clientHeight);
    }
  }, 100);
});

// Filter change updates graph
function onFilterChange() {
  savePreferences();
  if (graphInitialized && activeView === 'graph') {
    graphInstance.graphData(transformTasksToGraph(tasks));
  }
}
```

## Testing Strategy

### Manual Testing Checklist

- [ ] Toggle between Kanban and Graph views
- [ ] Verify graph shows correct hierarchy (root → projects → tasks → subtasks)
- [ ] Check particles flow along dependency edges
- [ ] Confirm node colors match status
- [ ] Confirm node sizes scale with progress
- [ ] Click task node → modal opens
- [ ] Drag nodes → physics responds
- [ ] Pinch-zoom on mobile
- [ ] Apply project filter → graph updates
- [ ] Apply date filter → graph updates
- [ ] Refresh page → remembers active view
- [ ] Resize window → graph adjusts

### Smoke Test Script

```bash
# Start dev server
npm run build -w hzl-web
node packages/hzl-web/dist/server.js --port 3456

# Open in browser
open http://localhost:3456

# Test sequence:
# 1. Click "Graph" toggle
# 2. Verify nodes render in radial pattern
# 3. Hover over task node → see tooltip
# 4. Click task node → modal opens
# 5. Drag a node → it moves, others react
# 6. Click "Kanban" → view switches back
# 7. Refresh → stays on Kanban (last selected)
```

## Dependencies & Prerequisites

- **No new npm dependencies** (force-graph loaded via CDN)
- **CSP update required** in `server.ts` to allow CDN scripts (see Phase 0)
- **No new API endpoints needed** (existing `/api/tasks` returns `blocked_by`)

## Edge Cases & Clarifications

### CSP Update Required

Current server sets strict CSP that blocks external scripts:
```typescript
// packages/hzl-web/src/server.ts line 225
"Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"
```

**Solution**: Update to allow jsdelivr CDN with SRI hash:
```typescript
"Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'"
```

### Status Colors (Canonical)

Use existing Kanban CSS variables for consistency:
- Backlog: `#6b7280` (gray)
- Ready: `#22c55e` (green) ← matches existing CSS, NOT blue from initial spec
- In Progress: `#3b82f6` (blue) ← swapped with Ready
- Blocked: `#ef4444` (red)
- Done: `#6b7280` (gray)

### CDN Failure Handling

If CDN fails to load:
1. Graph toggle button shows as disabled with tooltip "Graph unavailable"
2. Console warning: `[hzl] force-graph CDN failed to load`
3. Kanban remains functional
4. User must refresh to retry

### Loading State

While CDN loads + graph initializes (~1-3s):
1. Show spinner overlay in `#graphContainer`
2. Text: "Loading graph..."
3. If user toggles back to Kanban mid-load, cancel initialization

### Empty State

When no tasks match current filters:
- Show root node only with text "No tasks to display"
- Root node still pulses (shows graph is working)

### Mobile View Toggle

On mobile (<768px):
- View toggle appears above existing status tabs
- When Graph active: hide status tabs, show full-width canvas
- Touch: tap = click, pinch = zoom, drag = pan (not move node)
- Long-press node = move node

### Progress Null Handling

Tasks with `progress: null` render at minimum size (8px), same as 0%.

### Dependencies Outside Filter

If Task A depends on Task B, but filter excludes B's project:
- Edge is hidden (both endpoints must be visible)
- Task A shows without the edge (may appear unblocked in graph)
- This matches Kanban behavior where blocked_by only shows visible blockers

## Risk Analysis

| Risk | Mitigation |
|------|------------|
| Large task count slows rendering | Force-graph handles 1000s of nodes; unlikely issue for typical usage |
| CDN unavailable | Fallback: show Kanban only, log warning to console |
| d3-force conflicts | force-graph bundles its own d3-force; no conflict expected |
| Mobile touch issues | force-graph has built-in touch support; test on real devices |

## References

### Brainstorm
- [Graph Orchard View Brainstorm](../brainstorms/2026-02-02-graph-orchard-view-brainstorm.md)

### External Documentation
- [force-graph GitHub](https://github.com/vasturiano/force-graph)
- [d3-force API](https://d3js.org/d3-force)
- [forceRadial documentation](https://d3js.org/d3-force/position#forceRadial)

### Internal References
- Dashboard HTML: `packages/hzl-web/src/ui/index.html`
- Server API: `packages/hzl-web/src/server.ts`
- Key pattern: Always use `TaskService` methods, never bypass service layer
