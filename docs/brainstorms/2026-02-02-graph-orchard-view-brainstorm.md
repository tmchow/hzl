# Graph Orchard View - Brainstorm

**Date**: 2026-02-02
**Status**: Ready for planning

## What We're Building

A radial/orbital visualization of tasks in the hzl-web dashboard. Toggle between the existing Kanban view and a new "Graph" view that shows projects and tasks as nodes orbiting a central root, with animated particles flowing along dependency edges.

**Goal**: Fun, visually striking way to see your task universe at a glance. Not primarily for utility - for the joy of seeing your work visualized.

## Why This Approach

### Radial Layout
- Projects orbit a central root node
- Tasks orbit their parent project
- Subtasks orbit their parent task
- Creates natural hierarchy visualization without traditional tree boxes

### Animated Particles on Edges
- Particles flow from blocking task → blocked task
- Shows dependency direction at a glance
- Adds dynamism and visual interest
- Built into the chosen library (no custom animation code)

### 2D Canvas over 3D WebGL
- Better mobile performance
- Simpler integration with existing vanilla JS dashboard
- Less overwhelming for informational viewing
- Still visually engaging

## Key Decisions

### Library: vasturiano/force-graph
- [GitHub](https://github.com/vasturiano/force-graph) - 2D canvas version
- Built-in directional particle animation on links
- Uses d3-force under the hood (radial layout support)
- ~150KB, no framework dependencies
- Load via CDN - no build changes needed

### Visual Design
- **Root node**: Larger, amber (#f59e0b), pulsing glow
- **Project nodes**: Medium, white/gray, labeled with project name
- **Task nodes**:
  - Size scales with progress (0% = 8px, 100% = 24px)
  - Color matches Kanban status colors:
    - Backlog: gray (#6b7280)
    - Ready: blue (#3b82f6)
    - In Progress: amber (#f59e0b)
    - Blocked: red (#ef4444)
    - Done: green (#22c55e)
- **Particles**: Color matches blocking task's status, moderate speed

### Layout
- d3-force with `forceRadial()` for concentric rings
- Ring 0: Root (center)
- Ring 1: Projects (~150px radius)
- Ring 2: Top-level tasks (~300px radius)
- Ring 3: Subtasks (~450px radius)
- Collision force prevents overlap
- Responsive: smaller radii on mobile

### Interactivity
- Hover: Tooltip with task title + status
- Click: Opens existing task modal
- Drag: Reposition nodes (physics relaxes around them)
- Zoom/pan: Standard canvas controls

### UI Integration
- Tab buttons in header: `[Kanban] [Graph]`
- Active state persists in localStorage
- Graph loads lazily on first toggle
- Respects existing project/date filters
- Smooth fade transitions when filters change

## Open Questions

None - design is complete and validated.

## Next Steps

Run `/workflows:plan` to create implementation tasks.

## Research Sources

- [vasturiano/force-graph](https://github.com/vasturiano/force-graph) - 2D force-directed graph with particle animation
- [vasturiano/3d-force-graph](https://github.com/vasturiano/3d-force-graph) - 3D version (not using)
- [D3 Force Layout](https://d3js.org/d3-force) - Underlying physics engine
- [Cytoscape.js Concentric Layout](https://js.cytoscape.org/demos/concentric-layout/) - Alternative considered
