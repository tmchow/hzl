import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import {
  TaskService,
  EventStore,
  AmbiguousPrefixError,
  type TaskListItem as CoreTaskListItem,
} from 'hzl-core';
import { DASHBOARD_HTML } from './ui-embed.js';

export interface ServerOptions {
  port: number;
  host?: string; // Default: '0.0.0.0' (all interfaces for network/Tailscale access)
  taskService: TaskService;
  eventStore: EventStore;
}

export interface ServerHandle {
  close: () => Promise<void>;
  port: number;
  host: string;
  url: string;
}

// Date filter presets in days
const DATE_PRESETS: Record<string, number> = {
  '1d': 1,
  '3d': 3,
  '7d': 7,
  '14d': 14,
  '30d': 30,
};

// Response types for the API
interface TaskListItemResponse extends CoreTaskListItem {
  blocked_by: string[] | null;
  subtask_count: number;
  subtask_total: number;
}

interface TaskDetailResponse {
  task_id: string;
  title: string;
  project: string;
  status: string;
  priority: number;
  parent_id: string | null;
  description: string | null;
  links: string[];
  tags: string[];
  due_at: string | null;
  metadata: Record<string, unknown>;
  claimed_at: string | null;
  assignee: string | null;
  progress: number | null;
  lease_until: string | null;
  created_at: string;
  updated_at: string;
  blocked_by: string[];
}

interface EventResponse {
  id: number;
  event_id: string;
  task_id: string;
  type: string;
  data: Record<string, unknown>;
  author: string | null;
  agent_id: string | null;
  timestamp: string;
  task_title: string | null;
}

interface StatsResponse {
  total: number;
  by_status: Record<string, number>;
  projects: string[];
}

function parseUrl(url: string): { pathname: string; params: URLSearchParams } {
  const idx = url.indexOf('?');
  if (idx === -1) {
    return { pathname: url, params: new URLSearchParams() };
  }
  return {
    pathname: url.slice(0, idx),
    params: new URLSearchParams(url.slice(idx + 1)),
  };
}

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    // No CORS header - dashboard is served from same origin
  });
  res.end(JSON.stringify(data));
}

function notFound(res: ServerResponse, message = 'Not Found'): void {
  json(res, { error: message }, 404);
}

function serverError(res: ServerResponse, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Internal Server Error';
  json(res, { error: message }, 500);
}

export function createWebServer(options: ServerOptions): ServerHandle {
  const { port, host = '0.0.0.0', taskService, eventStore } = options;

  // Route handlers
  function handleTasks(params: URLSearchParams, res: ServerResponse): void {
    const dueMonth = params.get('due_month');
    const project = params.get('project');

    // Validate due_month if provided
    if (dueMonth) {
      if (!/^\d{4}-\d{2}$/.test(dueMonth)) {
        json(res, { error: 'Invalid due_month format. Expected YYYY-MM.' }, 400);
        return;
      }
      const month = parseInt(dueMonth.split('-')[1], 10);
      if (month < 1 || month > 12) {
        json(res, { error: 'Invalid month in due_month. Expected 01-12.' }, 400);
        return;
      }
    }

    const since = params.get('since') || '3d';
    const days = DATE_PRESETS[since] ?? 3;

    // Get tasks from service
    const rows = taskService.listTasks({
      ...(dueMonth ? { dueMonth } : { sinceDays: days }),
      project: project ?? undefined,
    });

    // Get blocked tasks map from service
    const blockedMap = taskService.getBlockedByMap();

    // Get subtask counts for parent tasks (filtered + total)
    const subtaskCounts = taskService.getSubtaskCounts({
      ...(dueMonth ? {} : { sinceDays: days }),
      project: project ?? undefined,
    });
    const subtaskTotals = taskService.getSubtaskCounts();

    // Merge blocked info and subtask counts into tasks
    const tasks: TaskListItemResponse[] = rows.map((row) => ({
      ...row,
      blocked_by: blockedMap.get(row.task_id) ?? null,
      subtask_count: subtaskCounts.get(row.task_id) ?? 0,
      subtask_total: subtaskTotals.get(row.task_id) ?? 0,
    }));

    json(res, { tasks, since: dueMonth ? undefined : since, project, due_month: dueMonth ?? undefined });
  }

  function handleTaskDetail(taskId: string, res: ServerResponse): void {
    let resolvedId: string;
    try {
      const result = taskService.resolveTaskId(taskId);
      if (!result) {
        notFound(res, `Task not found: ${taskId}`);
        return;
      }
      resolvedId = result;
    } catch (e) {
      if (e instanceof AmbiguousPrefixError) {
        json(res, { error: e.message }, 400);
        return;
      }
      throw e;
    }

    const task = taskService.getTaskById(resolvedId);

    if (!task) {
      notFound(res, `Task not found: ${taskId}`);
      return;
    }

    // Get blocking dependencies from service
    const blocked_by = taskService.getBlockingDependencies(resolvedId);

    const taskDetail: TaskDetailResponse = {
      task_id: task.task_id,
      title: task.title,
      project: task.project,
      status: task.status,
      priority: task.priority,
      parent_id: task.parent_id,
      description: task.description,
      links: task.links,
      tags: task.tags,
      due_at: task.due_at,
      metadata: task.metadata,
      claimed_at: task.claimed_at,
      assignee: task.assignee,
      progress: task.progress,
      lease_until: task.lease_until,
      created_at: task.created_at,
      updated_at: task.updated_at,
      blocked_by,
    };

    json(res, { task: taskDetail });
  }

  function handleComments(taskId: string, res: ServerResponse): void {
    const comments = taskService.getComments(taskId);
    // Map to response format (convert undefined to null for JSON)
    const response = comments.map((c) => ({
      event_rowid: c.event_rowid,
      task_id: c.task_id,
      author: c.author ?? null,
      agent_id: c.agent_id ?? null,
      text: c.text,
      timestamp: c.timestamp,
    }));
    json(res, { comments: response });
  }

  function handleCheckpoints(taskId: string, res: ServerResponse): void {
    const checkpoints = taskService.getCheckpoints(taskId);
    json(res, { checkpoints });
  }

  function handleEvents(params: URLSearchParams, res: ServerResponse): void {
    const sinceId = parseInt(params.get('since') || '0', 10);

    // Get events from EventStore
    const rawEvents = eventStore.getRecentEvents({ sinceId, limit: 50 });

    // Get task titles for these events (batched query to avoid N+1)
    const taskIds = [...new Set(rawEvents.map((e) => e.task_id).filter(Boolean))];
    const titleMap = taskService.getTaskTitlesByIds(taskIds);

    const events: EventResponse[] = rawEvents.map((e) => ({
      id: e.rowid,
      event_id: e.event_id,
      task_id: e.task_id,
      type: e.type,
      data: e.data,
      author: e.author ?? null,
      agent_id: e.agent_id ?? null,
      timestamp: e.timestamp,
      task_title: titleMap.get(e.task_id) ?? null,
    }));

    json(res, { events });
  }

  function handleStats(res: ServerResponse): void {
    const stats = taskService.getStats();

    const response: StatsResponse = {
      total: stats.total,
      by_status: stats.byStatus,
      projects: stats.projects,
    };

    json(res, response);
  }

  function handleRoot(res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });
    res.end(DASHBOARD_HTML);
  }

  // Request handler
  function handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const { pathname, params } = parseUrl(req.url || '/');

    try {
      // Route matching
      if (pathname === '/') {
        handleRoot(res);
        return;
      }

      if (pathname === '/api/tasks') {
        handleTasks(params, res);
        return;
      }

      if (pathname === '/api/events') {
        handleEvents(params, res);
        return;
      }

      if (pathname === '/api/stats') {
        handleStats(res);
        return;
      }

      // /api/tasks/:id routes
      const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskMatch) {
        handleTaskDetail(taskMatch[1], res);
        return;
      }

      const commentsMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/comments$/);
      if (commentsMatch) {
        handleComments(commentsMatch[1], res);
        return;
      }

      const checkpointsMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/checkpoints$/);
      if (checkpointsMatch) {
        handleCheckpoints(checkpointsMatch[1], res);
        return;
      }

      notFound(res);
    } catch (error) {
      serverError(res, error);
    }
  }

  const server = createServer(handleRequest);

  server.listen(port, host);

  return {
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
    port,
    host,
    url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`,
  };
}
