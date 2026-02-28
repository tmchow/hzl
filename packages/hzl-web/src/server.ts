import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import type { Socket } from 'net';
import {
  TaskService,
  EventStore,
  EventType,
  AmbiguousPrefixError,
  type TaskListItem as CoreTaskListItem,
} from 'hzl-core';
import { DASHBOARD_HTML } from './ui-embed.js';

export interface ServerOptions {
  port: number;
  host?: string; // Default: '0.0.0.0' (all interfaces for network/Tailscale access)
  allowFraming?: boolean; // Allow embedding in iframes (disables X-Frame-Options and adds frame-ancestors *)
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

const STREAM_POLL_MS = 2000;
const STREAM_KEEPALIVE_MS = 15000;
const STREAM_EVENT_TYPES: EventType[] = Object.values(EventType);

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
  task_assignee: string | null;
  task_description: string | null;
  task_status: string | null;
}

interface TaskEventResponse {
  id: number;
  event_id: string;
  task_id: string;
  type: string;
  data: Record<string, unknown>;
  author: string | null;
  agent_id: string | null;
  timestamp: string;
}

interface StatsResponse {
  total: number;
  by_status: Record<string, number>;
  projects: string[];
}

interface StreamReadyResponse {
  live: true;
  latest_event_id: number;
}

interface StreamUpdateResponse {
  latest_event_id: number;
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

function parseStrictNonNegativeInt(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function withLegacyAssigneeAlias(data: Record<string, unknown>): Record<string, unknown> {
  if (Object.prototype.hasOwnProperty.call(data, 'assignee')) {
    return data;
  }
  if (!Object.prototype.hasOwnProperty.call(data, 'agent')) {
    return data;
  }
  return {
    ...data,
    assignee: data.agent,
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

function writeSseEvent<T extends object>(res: ServerResponse, event: string, data: T): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function createWebServer(options: ServerOptions): ServerHandle {
  const { port, host = '0.0.0.0', allowFraming = false, taskService, eventStore } = options;
  const sockets = new Set<Socket>();
  const activeStreamResponses = new Set<ServerResponse>();

  // Route handlers
  function handleTasks(params: URLSearchParams, res: ServerResponse): void {
    const dueMonth = params.get('due_month');
    const project = params.get('project');

    const since = params.get('since') || '3d';
    const validSince = Object.prototype.hasOwnProperty.call(DATE_PRESETS, since);
    if (!dueMonth && !validSince) {
      json(
        res,
        { error: `Invalid since value: ${since}. Expected one of: ${Object.keys(DATE_PRESETS).join(', ')}` },
        400
      );
      return;
    }
    const days = DATE_PRESETS[since] ?? 3;

    // Get tasks from service (service validates dueMonth format/range)
    let rows;
    try {
      rows = taskService.listTasks({
        ...(dueMonth ? { dueMonth } : { sinceDays: days }),
        project: project ?? undefined,
      });
    } catch (err) {
      // Only treat dueMonth validation errors as 400; re-throw others (e.g. DB errors → 500)
      if (err instanceof Error && (err.message.startsWith('Invalid dueMonth') || err.message.startsWith('Invalid month'))) {
        json(res, { error: err.message }, 400);
        return;
      }
      throw err;
    }

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
      assignee: task.agent ?? null,
      progress: task.progress,
      lease_until: task.lease_until,
      created_at: task.created_at,
      updated_at: task.updated_at,
      blocked_by,
    };

    json(res, { task: taskDetail });
  }

  function handleTaskEvents(taskId: string, params: URLSearchParams, res: ServerResponse): void {
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

    const limitParam = params.get('limit');
    let limit = 200;
    if (limitParam !== null) {
      const parsed = parseStrictNonNegativeInt(limitParam);
      if (parsed === null || parsed < 1 || parsed > 500) {
        json(res, { error: 'Invalid limit value. Expected integer 1-500.' }, 400);
        return;
      }
      limit = parsed;
    }

    const events = eventStore.getByTaskId(resolvedId, { limit }).map((e) => ({
      id: e.rowid,
      event_id: e.event_id,
      task_id: e.task_id,
      type: e.type,
      data: withLegacyAssigneeAlias(e.data),
      author: e.author ?? null,
      agent_id: e.agent_id ?? null,
      timestamp: e.timestamp,
    })) as TaskEventResponse[];

    json(res, { events });
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
    const sinceParam = params.get('since') || '0';
    const sinceId = parseStrictNonNegativeInt(sinceParam);
    if (sinceId === null) {
      json(res, { error: 'Invalid since value. Expected a non-negative integer.' }, 400);
      return;
    }

    // Get events from EventStore
    const rawEvents = eventStore.getRecentEvents({ sinceId, limit: 50 });

    // Get task titles for these events (batched query to avoid N+1)
    const taskIds = [...new Set(rawEvents.map((e) => e.task_id).filter(Boolean))];
    const titleMap = taskService.getTaskTitlesByIds(taskIds);
    const taskMetadataMap = new Map<string, Pick<EventResponse, 'task_assignee' | 'task_description' | 'task_status'>>();

    for (const taskId of taskIds) {
      const task = taskService.getTaskById(taskId);
      taskMetadataMap.set(taskId, {
        task_assignee: task?.agent ?? null,
        task_description: task?.description ?? null,
        task_status: task?.status ?? null,
      });
    }

    const events: EventResponse[] = rawEvents.map((e) => ({
      id: e.rowid,
      event_id: e.event_id,
      task_id: e.task_id,
      type: e.type,
      data: withLegacyAssigneeAlias(e.data),
      author: e.author ?? null,
      agent_id: e.agent_id ?? null,
      timestamp: e.timestamp,
      task_title: titleMap.get(e.task_id) ?? null,
      task_assignee: taskMetadataMap.get(e.task_id)?.task_assignee ?? null,
      task_description: taskMetadataMap.get(e.task_id)?.task_description ?? null,
      task_status: taskMetadataMap.get(e.task_id)?.task_status ?? null,
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

  function getLatestEventId(): number {
    const latest = eventStore.getRecentEvents({
      sinceId: 0,
      limit: 1,
      types: STREAM_EVENT_TYPES,
    });
    return latest[0]?.rowid ?? 0;
  }

  function handleStream(req: IncomingMessage, res: ServerResponse): void {
    activeStreamResponses.add(res);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    res.write('retry: 2000\n\n');

    let lastEventId = getLatestEventId();
    const readyPayload: StreamReadyResponse = {
      live: true,
      latest_event_id: lastEventId,
    };
    writeSseEvent(res, 'ready', readyPayload);

    const pollTimer = setInterval(() => {
      if (req.destroyed || res.destroyed || res.writableEnded) {
        return;
      }

      const latestId = getLatestEventId();
      if (latestId > lastEventId) {
        lastEventId = latestId;
        const updatePayload: StreamUpdateResponse = { latest_event_id: latestId };
        writeSseEvent(res, 'update', updatePayload);
      }
    }, STREAM_POLL_MS);

    const keepAliveTimer = setInterval(() => {
      if (req.destroyed || res.destroyed || res.writableEnded) {
        return;
      }
      res.write(': keep-alive\n\n');
    }, STREAM_KEEPALIVE_MS);

    let closed = false;
    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      activeStreamResponses.delete(res);
      clearInterval(pollTimer);
      clearInterval(keepAliveTimer);
      req.off('close', cleanup);
      res.off('close', cleanup);
    };

    req.on('close', cleanup);
    res.on('close', cleanup);
  }

  function handleRoot(res: ServerResponse): void {
    const csp = allowFraming
      ? "default-src 'self'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; frame-ancestors *"
      : "default-src 'self'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'";

    const headers: Record<string, string> = {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    };

    if (!allowFraming) {
      headers['X-Frame-Options'] = 'DENY';
    }

    res.writeHead(200, headers);
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

      if (pathname === '/api/events/stream' || pathname === '/api/stream') {
        handleStream(req, res);
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

      const taskEventsMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/events$/);
      if (taskEventsMatch) {
        handleTaskEvents(taskEventsMatch[1], params, res);
        return;
      }

      notFound(res);
    } catch (error) {
      serverError(res, error);
    }
  }

  const server = createServer(handleRequest);
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
  });

  server.listen(port, host);

  return {
    close: () =>
      new Promise((resolve, reject) => {
        for (const streamRes of activeStreamResponses) {
          if (!streamRes.writableEnded && !streamRes.destroyed) {
            streamRes.end();
          }
        }

        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });

        if (typeof server.closeIdleConnections === 'function') {
          server.closeIdleConnections();
        }

        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        } else {
          for (const socket of sockets) {
            socket.destroy();
          }
        }
      }),
    port,
    host,
    url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`,
  };
}
