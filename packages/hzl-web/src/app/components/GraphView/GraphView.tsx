import { useEffect, useRef, useCallback } from 'react';
import type { TaskListItem } from '../../api/types';
import { getStatusColor } from '../../utils/format';
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
  ring: number;
  angle: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
}

function getNodeSize(node: GraphNode): number {
  if (node.type === 'root') return 20;
  if (node.type === 'project') return 14;
  const progress = node.progress ?? 0;
  return 8 + (progress / 100) * 16;
}

function transformTasksToGraph(taskList: TaskListItem[]): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [{ id: 'root', type: 'root', name: 'HZL', ring: 0, angle: 0 }];
  const links: GraphLink[] = [];
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

    if (!addedProjects.has(task.project)) {
      addedProjects.add(task.project);
      const projectId = `project:${task.project}`;
      nodes.push({ id: projectId, type: 'project', name: task.project, ring: 1, angle: projAngle });
      links.push({ source: projectId, target: 'root', type: 'hierarchy' });
    }

    const ring = task.parent_id ? 3 : 2;
    const angleOffset = (Math.random() - 0.5) * 0.3;
    nodes.push({
      id: task.task_id,
      type: task.parent_id ? 'subtask' : 'task',
      name: task.title,
      status: task.status,
      progress: task.progress ?? 0,
      ring,
      angle: projAngle + angleOffset,
    });

    const parent = task.parent_id || `project:${task.project}`;
    links.push({ source: task.task_id, target: parent, type: 'hierarchy' });

    if (task.blocked_by) {
      for (const blockerId of task.blocked_by) {
        links.push({ source: blockerId, target: task.task_id, type: 'dependency' });
      }
    }
  }

  return { nodes, links };
}

export default function GraphView({ tasks, onTaskClick }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const initializedRef = useRef(false);

  const initGraph = useCallback(async () => {
    if (!containerRef.current || initializedRef.current) return;

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

    // Component may have unmounted during async imports
    if (!containerRef.current) return;

    initializedRef.current = true;

    const RING_RADII: Record<number, number> = { 0: 0, 1: 180, 2: 360, 3: 540 };
    const baseRadius = window.innerWidth < 768 ? 0.6 : 1;

    const graphData = transformTasksToGraph(tasks);
    for (const node of graphData.nodes) {
      const radius = (RING_RADII[node.ring] ?? 300) * baseRadius;
      node.x = Math.cos(node.angle || 0) * radius;
      node.y = Math.sin(node.angle || 0) * radius;
    }

    const graph = ForceGraph()(containerRef.current)
      .graphData(graphData)
      .backgroundColor('#1a1a1a')
      .nodeLabel((n: GraphNode) => n.name)
      .nodeColor((n: GraphNode) => getStatusColor(n.status, n.type))
      .nodeVal((n: GraphNode) => getNodeSize(n))
      .linkColor((l: GraphLink) => l.type === 'dependency' ? '#e57373' : '#40404080')
      .linkWidth((l: GraphLink) => l.type === 'dependency' ? 2 : 1)
      .linkLabel((l: GraphLink) => l.type === 'dependency' ? 'blocks' : '')
      .linkDirectionalArrowLength((l: GraphLink) => l.type === 'dependency' ? 6 : 0)
      .linkDirectionalArrowRelPos(1)
      .onNodeClick((n: GraphNode) => {
        if (n.type !== 'root' && n.type !== 'project') {
          onTaskClick(n.id);
        }
      })
      .d3Force('x', d3.forceX((d: GraphNode) => {
        const radius = (RING_RADII[d.ring] ?? 300) * baseRadius;
        return Math.cos(d.angle || 0) * radius;
      }).strength(0.3))
      .d3Force('y', d3.forceY((d: GraphNode) => {
        const radius = (RING_RADII[d.ring] ?? 300) * baseRadius;
        return Math.sin(d.angle || 0) * radius;
      }).strength(0.3))
      .d3Force('collision', d3.forceCollide((d: GraphNode) => getNodeSize(d) + 15))
      .d3Force('charge', d3.forceManyBody().strength(-50))
      .d3Force('link', d3.forceLink().strength(0.1))
      .linkDirectionalParticles((l: GraphLink) => l.type === 'dependency' ? 3 : 0)
      .linkDirectionalParticleWidth(3)
      .linkDirectionalParticleSpeed(0.005)
      .linkDirectionalParticleColor(() => '#e57373')
      .nodeCanvasObject((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
        if (node.type === 'root') {
          const pulse = Math.sin(Date.now() / 500) * 0.3 + 0.7;
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, 25 * pulse, 0, 2 * Math.PI);
          ctx.fillStyle = `rgba(245, 158, 11, ${0.3 * pulse})`;
          ctx.fill();
        }
        const size = getNodeSize(node);
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, size, 0, 2 * Math.PI);
        ctx.fillStyle = getStatusColor(node.status, node.type);
        ctx.fill();
        if (node.type === 'root') {
          ctx.font = `bold ${11 / globalScale}px ui-monospace`;
          ctx.fillStyle = '#1a1a1a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('HZL', node.x!, node.y! + 1);
        }
        if (node.type === 'project' && globalScale > 0.5) {
          ctx.font = `${10 / globalScale}px ui-monospace`;
          ctx.fillStyle = '#e5e5e5';
          ctx.textAlign = 'center';
          ctx.fillText(node.name, node.x!, node.y! + size + 12);
        }
      })
      .nodePointerAreaPaint((node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
        const size = getNodeSize(node);
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, size + 4, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
      });

    graphRef.current = graph;

    setTimeout(() => {
      if (graphRef.current) {
        graphRef.current.zoomToFit(400, 50);
      }
    }, 500);
  }, [tasks, onTaskClick]);

  useEffect(() => {
    initGraph();
    return () => {
      if (graphRef.current) {
        graphRef.current._destructor?.();
        graphRef.current = null;
      }
      initializedRef.current = false;
    };
  }, [initGraph]);

  // Update graph data when tasks change
  useEffect(() => {
    if (!graphRef.current || !initializedRef.current) return;

    const currentData = graphRef.current.graphData();
    const positionMap = new Map<string, { x: number; y: number; vx?: number; vy?: number }>();
    for (const node of currentData.nodes as GraphNode[]) {
      if (node.x !== undefined && node.y !== undefined) {
        positionMap.set(node.id, { x: node.x, y: node.y, vx: node.vx, vy: node.vy });
      }
    }

    const newData = transformTasksToGraph(tasks);
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

  return (
    <div className="graph-container" ref={containerRef}>
      {!initializedRef.current && (
        <div className="graph-loading">
          <div className="spinner" />
          <span>Loading graph...</span>
        </div>
      )}
    </div>
  );
}
