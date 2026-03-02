import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { TaskListItem } from '../../api/types';
import { getStatusColor, STATUS_ENTRIES } from '../../utils/format';
import './GraphView.css';

interface GraphViewProps {
  tasks: TaskListItem[];
  onTaskClick: (taskId: string) => void;
}

interface GraphNode {
  id: string;
  type: string;
  name: string;
  status?: string;
  progress?: number;
  assignee?: string | null;
  ring: number;
  angle: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  // Pre-computed per-node visual values (set once at data build time)
  _size?: number;
  _rgb?: [number, number, number];
  _initials?: string;
  _brightness?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
}

function getLinkNodeId(endpoint: string | GraphNode): string {
  return typeof endpoint === 'object' ? endpoint.id : endpoint;
}

function getLinkNode(endpoint: string | GraphNode): GraphNode | null {
  return typeof endpoint === 'object' ? endpoint : null;
}

function getNodeSize(node: GraphNode): number {
  if (node.type === 'root') return 20;
  if (node.type === 'project') return 14;
  return 10;
}

/** Parse hex color to r,g,b */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Get 1-2 uppercase initials from an assignee string */
function getInitials(name: string): string {
  const parts = name.trim().split(/[\s_-]+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  parentMap: Map<string, string>; // nodeId → hierarchy parent nodeId
}

function transformTasksToGraph(taskList: TaskListItem[]): GraphData {
  const nodes: GraphNode[] = [{ id: 'root', type: 'root', name: 'HZL', ring: 0, angle: 0 }];
  const links: GraphLink[] = [];
  const parentMap = new Map<string, string>();
  const projectList: string[] = [];
  const projectAngles = new Map<string, number>();

  for (const task of taskList) {
    if (task.project && !projectAngles.has(task.project)) {
      projectList.push(task.project);
      projectAngles.set(task.project, 0);
    }
  }

  projectList.forEach((proj, i) => {
    projectAngles.set(proj, (2 * Math.PI * i) / projectList.length);
  });

  const addedProjects = new Set<string>();
  for (const task of taskList) {
    if (!task.project || !task.task_id) continue;
    const projAngle = projectAngles.get(task.project) ?? 0;
    const projectId = `project:${task.project}`;

    if (!addedProjects.has(task.project)) {
      addedProjects.add(task.project);
      nodes.push({ id: projectId, type: 'project', name: task.project, ring: 1, angle: projAngle });
      links.push({ source: projectId, target: 'root', type: 'hierarchy' });
      parentMap.set(projectId, 'root');
    }

    const ring = task.parent_id ? 3 : 2;
    const angleOffset = (Math.random() - 0.5) * 0.3;
    nodes.push({
      id: task.task_id,
      type: task.parent_id ? 'subtask' : 'task',
      name: task.title,
      status: task.status,
      progress: task.progress ?? 0,
      assignee: task.assignee,
      ring,
      angle: projAngle + angleOffset,
    });

    const parent = task.parent_id || projectId;
    links.push({ source: task.task_id, target: parent, type: 'hierarchy' });
    parentMap.set(task.task_id, parent);

    if (task.blocked_by) {
      for (const blockerId of task.blocked_by) {
        links.push({ source: blockerId, target: task.task_id, type: 'dependency' });
      }
    }
  }

  // Pre-compute visual values so the 60fps canvas callback avoids per-frame work
  for (const node of nodes) {
    const color = getStatusColor(node.status, node.type);
    const rgb = hexToRgb(color);
    node._size = getNodeSize(node);
    node._rgb = rgb;
    if ((node.type === 'task' || node.type === 'subtask') && node.assignee) {
      node._initials = getInitials(node.assignee);
      node._brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
    }
  }

  return { nodes, links, parentMap };
}

/** Compute the set of node IDs on the path from any filter-matching node up to root */
function computeVisiblePath(
  activeStatuses: Set<string>,
  nodes: GraphNode[],
  parentMap: Map<string, string>,
): Set<string> {
  const pathSet = new Set<string>();
  if (activeStatuses.size === 0) return pathSet; // empty = no filter, show all

  for (const node of nodes) {
    if (node.type === 'root' || node.type === 'project') continue;
    if (!activeStatuses.has(node.status ?? '')) continue;
    // Walk up to root, marking every ancestor
    let id: string | undefined = node.id;
    while (id && !pathSet.has(id)) {
      pathSet.add(id);
      id = parentMap.get(id);
    }
  }
  // Always include root
  pathSet.add('root');
  return pathSet;
}

export default function GraphView({ tasks, onTaskClick }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const mountedRef = useRef(true);
  const [initialized, setInitialized] = useState(false);
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set());
  const hoveredNodeRef = useRef<string | null>(null);
  const parentMapRef = useRef<Map<string, string>>(new Map());
  const graphNodesRef = useRef<GraphNode[]>([]);
  const visiblePathRef = useRef<Set<string>>(new Set());
  const tasksRef = useRef(tasks);
  const onTaskClickRef = useRef(onTaskClick);
  tasksRef.current = tasks;
  onTaskClickRef.current = onTaskClick;

  const visiblePath = useMemo(
    () => computeVisiblePath(activeStatuses, graphNodesRef.current, parentMapRef.current),
    [activeStatuses, tasks], // tasks triggers recompute when graph data changes
  );
  visiblePathRef.current = visiblePath;

  const handleLegendClick = useCallback((status: string) => {
    setActiveStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  const handleZoomIn = useCallback(() => {
    if (!graphRef.current) return;
    const k = graphRef.current.zoom();
    graphRef.current.zoom(k * 1.4, 300);
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!graphRef.current) return;
    const k = graphRef.current.zoom();
    graphRef.current.zoom(k / 1.4, 300);
  }, []);

  const handleZoomFit = useCallback(() => {
    graphRef.current?.zoomToFit(400, 60);
  }, []);

  // Init graph once on mount
  useEffect(() => {
    mountedRef.current = true;
    let zoomTimer: ReturnType<typeof setTimeout>;

    (async () => {
      if (!containerRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let ForceGraph: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let d3: any;
      try {
        const mod = await import('force-graph');
        ForceGraph = mod.default;
        d3 = await import('d3');
      } catch {
        return;
      }

      if (!mountedRef.current || !containerRef.current) return;

      const RING_RADII: Record<number, number> = { 0: 0, 1: 180, 2: 360, 3: 540 };
      const baseRadius = window.innerWidth < 768 ? 0.6 : 1;

      const graphData = transformTasksToGraph(tasksRef.current);
      parentMapRef.current = graphData.parentMap;
      graphNodesRef.current = graphData.nodes;
      for (const node of graphData.nodes) {
        const radius = (RING_RADII[node.ring] ?? 300) * baseRadius;
        node.x = Math.cos(node.angle || 0) * radius;
        node.y = Math.sin(node.angle || 0) * radius;
      }

      const graph = ForceGraph()(containerRef.current)
        .graphData(graphData)
        .backgroundColor('#1a1a1a')
        .nodeLabel(() => '') // we draw our own labels
        .nodeColor((n: GraphNode) => getStatusColor(n.status, n.type))
        .nodeVal((n: GraphNode) => getNodeSize(n))
        .linkCurvature((l: GraphLink) => l.type === 'dependency' ? 0 : 0.15)
        .linkColor((l: GraphLink) => {
          const path = visiblePathRef.current;
          if (path.size > 0) {
            if (!path.has(getLinkNodeId(l.source)) || !path.has(getLinkNodeId(l.target))) {
              return 'rgba(80, 80, 80, 0.08)';
            }
          }
          return l.type === 'dependency' ? '#e57373' : 'rgba(140, 140, 140, 0.35)';
        })
        .linkWidth((l: GraphLink) => l.type === 'dependency' ? 1.5 : 1)
        .linkLabel(() => '')
        .linkDirectionalArrowLength((l: GraphLink) => l.type === 'dependency' ? 5 : 0)
        .linkDirectionalArrowRelPos(1)
        .linkDirectionalArrowColor((l: GraphLink) => l.type === 'dependency' ? '#e57373' : undefined)
        .onNodeHover((node: GraphNode | null) => {
          hoveredNodeRef.current = node?.id ?? null;
          if (containerRef.current) {
            containerRef.current.style.cursor = node && node.type !== 'root' && node.type !== 'project' ? 'pointer' : 'default';
          }
        })
        .onNodeClick((n: GraphNode) => {
          if (n.type !== 'root' && n.type !== 'project') {
            onTaskClickRef.current(n.id);
          }
        })
        .d3Force('x', d3.forceX((d: GraphNode) => {
          const radius = (RING_RADII[d.ring] ?? 300) * baseRadius;
          return Math.cos(d.angle || 0) * radius;
        }).strength(0.08))
        .d3Force('y', d3.forceY((d: GraphNode) => {
          const radius = (RING_RADII[d.ring] ?? 300) * baseRadius;
          return Math.sin(d.angle || 0) * radius;
        }).strength(0.08))
        .d3Force('collision', d3.forceCollide((d: GraphNode) => getNodeSize(d) + 30))
        .d3Force('charge', d3.forceManyBody().strength(-300))
        .d3Force('link', d3.forceLink()
          .distance((l: GraphLink) => {
            const src = getLinkNode(l.source);
            const tgt = getLinkNode(l.target);
            if (src?.type === 'root' || tgt?.type === 'root') return 220;
            if (src?.type === 'project' || tgt?.type === 'project') return 140;
            if (l.type === 'dependency') return 160;
            return 50; // subtask → parent: keep families tight
          })
          .strength((l: GraphLink) => {
            const src = getLinkNode(l.source);
            const tgt = getLinkNode(l.target);
            if (src?.type === 'root' || tgt?.type === 'root') return 0.1;
            if (l.type === 'dependency') return 0.05;
            return 0.3; // hierarchy: strong pull keeps subtrees clustered
          }))
        .linkDirectionalParticles((l: GraphLink) => l.type === 'dependency' ? 2 : 0)
        .linkDirectionalParticleWidth(2)
        .linkDirectionalParticleSpeed(0.004)
        .linkDirectionalParticleColor(() => '#e57373')
        .nodeCanvasObject((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const x = node.x!;
          const y = node.y!;
          const size = node._size ?? getNodeSize(node);
          const [r, g, b] = node._rgb ?? hexToRgb(getStatusColor(node.status, node.type));
          const isHovered = hoveredNodeRef.current === node.id;

          // --- Status filter dimming ---
          const path = visiblePathRef.current;
          const filterActive = path.size > 0;
          const isOnPath = !filterActive || path.has(node.id);
          const isAncestorOnly = filterActive && isOnPath
            && (node.type === 'root' || node.type === 'project');
          const isDimmed = filterActive && !isOnPath;

          // Draw opaque background to mask links behind dimmed nodes
          if (isDimmed || isAncestorOnly) {
            ctx.beginPath();
            ctx.arc(x, y, size + 2, 0, 2 * Math.PI);
            ctx.fillStyle = '#1a1a1a';
            ctx.fill();
          }

          if (isDimmed) {
            ctx.globalAlpha = 0.1;
          } else if (isAncestorOnly) {
            ctx.globalAlpha = 0.45;
          }

          // --- Root node: pulsing aura ---
          if (node.type === 'root') {
            const pulse = Math.sin(Date.now() / 600) * 0.25 + 0.75;
            ctx.beginPath();
            ctx.arc(x, y, 28 * pulse, 0, 2 * Math.PI);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.12 * pulse})`;
            ctx.fill();
          }

          // --- Hover glow ---
          if (isHovered) {
            ctx.beginPath();
            ctx.arc(x, y, size + 6, 0, 2 * Math.PI);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.25)`;
            ctx.fill();
          }

          // --- Gradient fill ---
          const grad = ctx.createRadialGradient(x - size * 0.3, y - size * 0.3, size * 0.1, x, y, size);
          const lighten = (v: number, amount: number) => Math.min(255, v + amount);
          grad.addColorStop(0, `rgb(${lighten(r, 50)}, ${lighten(g, 50)}, ${lighten(b, 50)})`);
          grad.addColorStop(1, `rgb(${Math.max(0, r - 20)}, ${Math.max(0, g - 20)}, ${Math.max(0, b - 20)})`);

          ctx.beginPath();
          ctx.arc(x, y, size, 0, 2 * Math.PI);
          ctx.fillStyle = grad;
          ctx.fill();

          // --- Border stroke ---
          ctx.strokeStyle = isHovered ? `rgba(255, 255, 255, 0.5)` : '#505050';
          ctx.lineWidth = isHovered ? 1.5 / globalScale : 1 / globalScale;
          ctx.stroke();

          // --- Progress arc ring (task/subtask only) ---
          const progress = node.progress ?? 0;
          if ((node.type === 'task' || node.type === 'subtask') && progress > 0) {
            const arcRadius = size + 3 / globalScale;
            const startAngle = -Math.PI / 2;
            const endAngle = startAngle + (progress / 100) * 2 * Math.PI;

            // Track (dim)
            ctx.beginPath();
            ctx.arc(x, y, arcRadius, 0, 2 * Math.PI);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 2 / globalScale;
            ctx.stroke();

            // Progress arc
            ctx.beginPath();
            ctx.arc(x, y, arcRadius, startAngle, endAngle);
            ctx.strokeStyle = `rgba(255, 255, 255, 0.55)`;
            ctx.lineWidth = 2 / globalScale;
            ctx.lineCap = 'round';
            ctx.stroke();
            ctx.lineCap = 'butt';
          }

          // --- Root label ---
          if (node.type === 'root') {
            ctx.font = `bold ${10 / globalScale}px ui-monospace, monospace`;
            ctx.fillStyle = '#1a1a1a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('HZL', x, y + 0.5);
          }

          // --- Project label ---
          if (node.type === 'project' && globalScale > 0.4) {
            ctx.font = `500 ${10 / globalScale}px ui-monospace, monospace`;
            ctx.fillStyle = '#b0b0b0';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(node.name, x, y + size + 6 / globalScale);
          }

          // --- Task title label ---
          // Show on hover at any zoom, or on all nodes when zoomed in past 1.8x
          const showLabel = (node.type === 'task' || node.type === 'subtask')
            && (isHovered || globalScale > 1.8);
          if (showLabel) {
            const maxChars = 24;
            const label = node.name.length > maxChars ? node.name.slice(0, maxChars - 1) + '\u2026' : node.name;
            const fontSize = 9 / globalScale;
            ctx.font = `${fontSize}px ui-monospace, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';

            // Text background pill for readability
            const textWidth = ctx.measureText(label).width;
            const padX = 4 / globalScale;
            const padY = 2 / globalScale;
            const textY = y + size + 5 / globalScale;
            ctx.fillStyle = 'rgba(26, 26, 26, 0.9)';
            ctx.beginPath();
            const pillRadius = 3 / globalScale;
            const pillX = x - textWidth / 2 - padX;
            const pillY = textY - padY;
            const pillW = textWidth + padX * 2;
            const pillH = fontSize + padY * 2;
            ctx.roundRect(pillX, pillY, pillW, pillH, pillRadius);
            ctx.fill();

            ctx.fillStyle = isHovered ? '#e5e5e5' : '#a3a3a3';
            ctx.fillText(label, x, textY);
          }

          // --- Assignee initials (rendered inside the node) ---
          if (node._initials) {
            ctx.font = `bold ${size * 0.9}px ui-monospace, monospace`;
            ctx.fillStyle = (node._brightness ?? 0) > 140 ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.7)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node._initials, x, y + 0.5);
          }

          // Reset alpha after dimming
          ctx.globalAlpha = 1;
        })
        .nodePointerAreaPaint((node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
          const size = getNodeSize(node);
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, size + 4, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        });

      if (!mountedRef.current) {
        graph._destructor?.();
        return;
      }

      graphRef.current = graph;
      setInitialized(true);

      zoomTimer = setTimeout(() => {
        if (graphRef.current && mountedRef.current) {
          graphRef.current.zoomToFit(400, 60);
        }
      }, 500);
    })();

    return () => {
      mountedRef.current = false;
      clearTimeout(zoomTimer);
      if (graphRef.current) {
        graphRef.current._destructor?.();
        graphRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update graph data when tasks change (no teardown — just swap data)
  useEffect(() => {
    if (!graphRef.current) return;

    const currentData = graphRef.current.graphData();
    const positionMap = new Map<string, { x: number; y: number; vx?: number; vy?: number }>();
    for (const node of currentData.nodes as GraphNode[]) {
      if (node.x !== undefined && node.y !== undefined) {
        positionMap.set(node.id, { x: node.x, y: node.y, vx: node.vx, vy: node.vy });
      }
    }

    const newData = transformTasksToGraph(tasks);
    parentMapRef.current = newData.parentMap;
    graphNodesRef.current = newData.nodes;
    for (const node of newData.nodes) {
      const pos = positionMap.get(node.id);
      if (pos) {
        node.x = pos.x;
        node.y = pos.y;
        node.vx = pos.vx;
        node.vy = pos.vy;
      }
    }

    graphRef.current.graphData(newData);
  }, [tasks]);

  // Force re-evaluation of link colors when filter changes
  useEffect(() => {
    if (!graphRef.current) return;
    graphRef.current.linkColor(graphRef.current.linkColor());
  }, [activeStatuses]);

  return (
    <div className="graph-wrapper">
      <div className="graph-container" ref={containerRef} />
      {!initialized && (
        <div className="graph-loading">
          <div className="spinner" />
          <span>Loading graph...</span>
        </div>
      )}
      {initialized && (
        <>
          <div className="graph-legend">
            {STATUS_ENTRIES.map(({ key, label, color }) => {
              const isActive = activeStatuses.has(key);
              const hasFilter = activeStatuses.size > 0;
              return (
                <button
                  key={key}
                  className={`graph-legend-item${isActive ? ' active' : ''}${hasFilter && !isActive ? ' dimmed' : ''}`}
                  onClick={() => handleLegendClick(key)}
                  title={`${isActive ? 'Hide' : 'Show'} ${label} tasks`}
                >
                  <span className="graph-legend-dot" style={{ background: color }} />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="graph-controls">
            <button className="graph-control-btn" onClick={handleZoomIn} title="Zoom in">+</button>
            <button className="graph-control-btn" onClick={handleZoomOut} title="Zoom out">&minus;</button>
            <button className="graph-control-btn" onClick={handleZoomFit} title="Fit all">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1" y="1" width="12" height="12" rx="1.5" />
                <path d="M4 7h6M7 4v6" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
