import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import type { Socket } from 'net';
import {
  TaskService,
  EventStore,
  EventType,
  AmbiguousPrefixError,
  SearchService,
  StatsService,
  type TaskListItem as CoreTaskListItem,
} from 'hzl-core';
import { GatewayClient } from 'hzl-core/services/gateway-client.js';
import { normalizeDurationLabel, parseDurationToMinutes } from 'hzl-core/utils/duration.js';
import { UI_FILES, LEGACY_DASHBOARD_HTML, type EmbeddedFile } from './ui-embed.js';

export interface ServerOptions {
  port: number;
  host?: string; // Default: '0.0.0.0' (all interfaces for network/Tailscale access)
  allowFraming?: boolean; // Allow embedding in iframes (disables X-Frame-Options and adds frame-ancestors *)
  taskService: TaskService;
  eventStore: EventStore;
  searchService: SearchService;
  statsService: StatsService;
  gatewayUrl?: string;
  gatewayToken?: string;
  configDir?: string;
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
  stale: boolean;
  stale_minutes: number | null;
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
  stale_after_minutes: number | null;
  claimed_at: string | null;
  assignee: string | null;
  progress: number | null;
  lease_until: string | null;
  created_at: string;
  updated_at: string;
  blocked_by: Array<{ task_id: string; title: string }>;
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

function parseDurationMinutes(value: string): number | null {
  const minutes = parseDurationToMinutes(value);
  if (minutes === null || !Number.isSafeInteger(minutes) || minutes < 1) return null;
  return minutes;
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

function bytes(
  res: ServerResponse,
  body: Buffer,
  contentType: string,
  status = 200,
  cacheControl?: string
): void {
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': String(body.length),
  };

  if (cacheControl) {
    headers['Cache-Control'] = cacheControl;
  }

  res.writeHead(status, headers);
  res.end(body);
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

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

export function createWebServer(options: ServerOptions): ServerHandle {
  const { port, host = '0.0.0.0', allowFraming = false, taskService, eventStore, searchService, statsService } = options;
  const sockets = new Set<Socket>();
  const activeStreamResponses = new Set<ServerResponse>();

  // Gateway client (lazy-init)
  let gatewayClient: GatewayClient | null = null;

  function getOrCreateGatewayClient(): GatewayClient {
    if (!gatewayClient) {
      const configDir = options.configDir ?? '.';
      const url = options.gatewayUrl ?? 'ws://127.0.0.1:18789';
      gatewayClient = new GatewayClient({ url, token: options.gatewayToken, configDir });
    }
    return gatewayClient;
  }

  // Gateway API route handlers
  async function handleGatewayStatus(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!gatewayClient && !options.gatewayUrl) {
      json(res, { status: 'unconfigured' });
      return;
    }
    const client = getOrCreateGatewayClient();

    // If configured but not yet connected, trigger a connection attempt
    if (client.getStatus() === 'disconnected') {
      try {
        await client.call('ping');
      } catch {
        // Connection failed — status will reflect 'disconnected'
      }
    }

    json(res, { status: client.getStatus() });
  }

  async function handleGatewayConfig(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await parseBody(req) as { url?: string; token?: string };
    if (!body.url) {
      json(res, { error: 'url is required' }, 400);
      return;
    }

    const client = getOrCreateGatewayClient();
    client.configure(body.url, body.token);

    // Try to connect
    try {
      await client.call('ping').catch(() => {});
    } catch {
      // Connection attempt may fail, that's ok — status reflects it
    }

    json(res, { status: client.getStatus() });
  }

  async function handleGatewayProxy(method: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!gatewayClient && !options.gatewayUrl) {
      json(res, { error: 'gateway_unavailable', message: 'Gateway not configured' }, 503);
      return;
    }
    const client = getOrCreateGatewayClient();

    try {
      const body = req.method === 'POST' ? await parseBody(req) : undefined;
      const params = body && typeof body === 'object' && Object.keys(body).length > 0
        ? body
        : undefined;
      const result = await client.call(method, params);
      json(res, result ?? {});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gateway error';
      if (message.includes('not configured') || message.includes('disconnected')) {
        json(res, { error: 'gateway_unavailable', message }, 503);
      } else {
        json(res, { error: message }, 502);
      }
    }
  }

  // Route handlers
  function handleTasks(params: URLSearchParams, res: ServerResponse): void {
    const dueMonth = params.get('due_month');
    const project = params.get('project');
    const tag = params.get('tag') || undefined;

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
        tag,
      });
    } catch (err) {
      // Only treat dueMonth validation errors as 400; re-throw others (e.g. DB errors → 500)
      const domainCode = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
      if (domainCode === 'task_invalid_due_month') {
        const message = err instanceof Error ? err.message : 'Invalid dueMonth';
        json(res, { error: message }, 400);
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

    // Compute stale indicators
    const staleThresholdParam = params.get('staleThreshold');
    const staleThreshold = staleThresholdParam !== null
      ? parseInt(staleThresholdParam, 10)
      : 10;

    const staleMap = taskService.getStaleTasks({
      thresholdMinutes: isNaN(staleThreshold) ? 10 : staleThreshold,
      project: project ?? undefined,
    });

    // Merge blocked info, subtask counts, and stale info into tasks
    const tasks: TaskListItemResponse[] = rows.map((row) => ({
      ...row,
      blocked_by: blockedMap.get(row.task_id) ?? null,
      subtask_count: subtaskCounts.get(row.task_id) ?? 0,
      subtask_total: subtaskTotals.get(row.task_id) ?? 0,
      stale: staleMap.has(row.task_id),
      stale_minutes: staleMap.get(row.task_id) ?? null,
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

    // Get blocking dependencies from service and enrich with titles
    const blockedByIds = taskService.getBlockingDependencies(resolvedId);
    const blockedByItems = blockedByIds.map((id: string) => {
      try {
        const dep = taskService.getTaskById(id);
        return { task_id: id, title: dep?.title || id };
      } catch {
        return { task_id: id, title: id };
      }
    });

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
      stale_after_minutes: task.stale_after_minutes,
      claimed_at: task.claimed_at,
      assignee: task.agent ?? null,
      progress: task.progress,
      lease_until: task.lease_until,
      created_at: task.created_at,
      updated_at: task.updated_at,
      blocked_by: blockedByItems,
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

  function handleStats(params: URLSearchParams, res: ServerResponse): void {
    const project = params.get('project') || undefined;
    const windowParam = params.get('window') ?? '24h';
    const windowMinutes = parseDurationMinutes(windowParam);
    if (windowMinutes === null) {
      json(res, { error: 'Invalid window value. Expected durations like 30, 30m, 2h, or 7d.' }, 400);
      return;
    }

    const stats = statsService.getStats({
      project,
      windowMinutes,
      windowLabel: normalizeDurationLabel(windowParam) ?? '24h',
    });

    json(res, stats);
  }

  function handleTags(res: ServerResponse): void {
    const tags = taskService.getTagCounts();
    json(res, { tags });
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

  function handleSearch(params: URLSearchParams, res: ServerResponse): void {
    const q = params.get('q') ?? '';
    const project = params.get('project') || undefined;
    const status = params.get('status') || undefined;

    const limitParam = params.get('limit');
    let limit: number | undefined;
    if (limitParam !== null) {
      const parsed = parseStrictNonNegativeInt(limitParam);
      if (parsed === null || parsed < 1 || parsed > 200) {
        json(res, { error: 'Invalid limit value. Expected integer 1-200.' }, 400);
        return;
      }
      limit = parsed;
    }

    const offsetParam = params.get('offset');
    let offset: number | undefined;
    if (offsetParam !== null) {
      const parsed = parseStrictNonNegativeInt(offsetParam);
      if (parsed === null) {
        json(res, { error: 'Invalid offset value. Expected non-negative integer.' }, 400);
        return;
      }
      offset = parsed;
    }

    const result = searchService.search(q, { project, status, limit, offset });
    json(res, result);
  }

  function handleAgents(params: URLSearchParams, res: ServerResponse): void {
    const project = params.get('project') || undefined;

    const sinceParam = params.get('since');
    let sinceDays: number | undefined;
    if (sinceParam) {
      if (!Object.prototype.hasOwnProperty.call(DATE_PRESETS, sinceParam)) {
        json(
          res,
          { error: `Invalid since value. Expected one of: ${Object.keys(DATE_PRESETS).join(', ')}` },
          400
        );
        return;
      }
      sinceDays = DATE_PRESETS[sinceParam];
    }

    const agents = taskService.getAgentRoster({ project, sinceDays });

    // Annotate agent tasks with stale info
    const staleMap = taskService.getStaleTasks({ thresholdMinutes: 10 });
    const annotatedAgents = agents.map((agent) => ({
      ...agent,
      tasks: agent.tasks.map((t) => ({
        ...t,
        stale: staleMap.has(t.taskId),
        stale_minutes: staleMap.get(t.taskId) ?? null,
      })),
    }));

    json(res, { agents: annotatedAgents });
  }

  function handleAgentEvents(agentId: string, params: URLSearchParams, res: ServerResponse): void {
    const decodedAgentId = decodeURIComponent(agentId);

    const limitParam = params.get('limit');
    let limit = 50;
    if (limitParam !== null) {
      const parsed = parseStrictNonNegativeInt(limitParam);
      if (parsed === null || parsed < 1 || parsed > 200) {
        json(res, { error: 'Invalid limit value. Expected integer 1-200.' }, 400);
        return;
      }
      limit = parsed;
    }

    const offsetParam = params.get('offset');
    let offset = 0;
    if (offsetParam !== null) {
      const parsed = parseStrictNonNegativeInt(offsetParam);
      if (parsed === null) {
        json(res, { error: 'Invalid offset value. Expected non-negative integer.' }, 400);
        return;
      }
      offset = parsed;
    }

    const result = taskService.getAgentEvents(decodedAgentId, { limit, offset });
    json(res, { events: result.events, total: result.total });
  }

  function handleAgentTasks(agentId: string, params: URLSearchParams, res: ServerResponse): void {
    const decodedAgentId = decodeURIComponent(agentId);
    const project = params.get('project') || undefined;
    const result = taskService.getAgentTasks(decodedAgentId, { project });
    json(res, result);
  }

  const useLegacy = process.env.HZL_LEGACY_DASHBOARD === '1';

  function serveHtml(res: ServerResponse, html: string): void {
    const csp = useLegacy
      ? (allowFraming
          ? "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; frame-ancestors *"
          : "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'")
      : (allowFraming
          ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors *"
          : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:");

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
    res.end(html);
  }

  function serveStaticFile(res: ServerResponse, file: EmbeddedFile, pathname: string): void {
    let cacheControl: string;
    if (pathname.startsWith('/assets/')) {
      // Vite hashed assets are immutable — cache aggressively
      cacheControl = 'public, max-age=31536000, immutable';
    } else if (pathname === '/sw.js') {
      // Service workers must not be cached to ensure updates propagate
      cacheControl = 'no-cache';
    } else {
      cacheControl = 'max-age=3600';
    }
    bytes(res, file.content, file.contentType, 200, cacheControl);
  }

  // Cache the resolved HTML string to avoid repeated Buffer→string conversion
  const indexHtml: string = (() => {
    if (useLegacy) {
      return LEGACY_DASHBOARD_HTML;
    }
    const indexFile = UI_FILES.get('/index.html');
    return indexFile ? indexFile.content.toString('utf-8') : '<html><body>Dashboard not found.</body></html>';
  })();

  // Request handler
  function handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const { pathname, params } = parseUrl(req.url || '/');

    try {
      // 1. API routes
      if (pathname === '/api/tasks') {
        handleTasks(params, res);
        return;
      }

      if (pathname === '/api/search') {
        handleSearch(params, res);
        return;
      }

      if (pathname === '/api/events') {
        handleEvents(params, res);
        return;
      }

      if (pathname === '/api/stats') {
        handleStats(params, res);
        return;
      }

      if (pathname === '/api/tags') {
        handleTags(res);
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

      // /api/agents routes
      if (pathname === '/api/agents') {
        handleAgents(params, res);
        return;
      }

      const agentTasksMatch = pathname.match(/^\/api\/agents\/([^/]+)\/tasks$/);
      if (agentTasksMatch) {
        handleAgentTasks(agentTasksMatch[1], params, res);
        return;
      }

      const agentEventsMatch = pathname.match(/^\/api\/agents\/([^/]+)\/events$/);
      if (agentEventsMatch) {
        handleAgentEvents(agentEventsMatch[1], params, res);
        return;
      }

      // Gateway API routes
      if (pathname === '/api/gateway/status' && req.method === 'GET') {
        void handleGatewayStatus(req, res).catch((e) => serverError(res, e));
        return;
      }

      if (pathname === '/api/gateway/config' && req.method === 'POST') {
        void handleGatewayConfig(req, res).catch((e) => serverError(res, e));
        return;
      }

      if (pathname === '/api/gateway/agents' && req.method === 'POST') {
        void handleGatewayProxy('agents.list', req, res).catch((e) => serverError(res, e));
        return;
      }

      if (pathname === '/api/gateway/cron/list' && req.method === 'POST') {
        void handleGatewayProxy('cron.list', req, res).catch((e) => serverError(res, e));
        return;
      }

      if (pathname === '/api/gateway/cron/add' && req.method === 'POST') {
        void handleGatewayProxy('cron.add', req, res).catch((e) => serverError(res, e));
        return;
      }

      if (pathname === '/api/gateway/cron/update' && req.method === 'POST') {
        void handleGatewayProxy('cron.update', req, res).catch((e) => serverError(res, e));
        return;
      }

      if (pathname === '/api/gateway/cron/remove' && req.method === 'POST') {
        void handleGatewayProxy('cron.remove', req, res).catch((e) => serverError(res, e));
        return;
      }

      if (pathname === '/api/gateway/cron/run' && req.method === 'POST') {
        void handleGatewayProxy('cron.run', req, res).catch((e) => serverError(res, e));
        return;
      }

      if (pathname === '/api/gateway/cron/status' && req.method === 'GET') {
        void handleGatewayProxy('cron.status', req, res).catch((e) => serverError(res, e));
        return;
      }

      // Catch-all for unknown /api/ paths
      if (pathname.startsWith('/api/')) {
        notFound(res);
        return;
      }

      // 2. Static files from the UI build
      const file = UI_FILES.get(pathname);
      if (file && pathname !== '/index.html' && pathname !== '/legacy.html') {
        serveStaticFile(res, file, pathname);
        return;
      }

      // 3. SPA fallback: serve index.html for navigation-like requests (no file extension).
      //    Paths with a file extension that weren't matched above are genuine 404s.
      const lastSegment = pathname.split('/').pop() ?? '';
      if (lastSegment.includes('.')) {
        notFound(res);
        return;
      }

      serveHtml(res, indexHtml);
    } catch (error) {
      serverError(res, error);
    }
  }

  // Eagerly connect to gateway if configured (don't wait for frontend to poll)
  if (options.gatewayUrl) {
    const client = getOrCreateGatewayClient();
    client.call('ping').catch(() => {
      // Connection or handshake failed — pairing message already printed if needed
    });
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
        // Dispose gateway client
        if (gatewayClient) {
          gatewayClient.dispose();
          gatewayClient = null;
        }

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
