import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import type { Database } from 'libsql';
import { DASHBOARD_HTML } from './ui-embed.js';

export interface ServerOptions {
  port: number;
  cacheDb: Database;
  eventsDb: Database;
}

export interface ServerHandle {
  close: () => Promise<void>;
  port: number;
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

interface TaskListItem {
  task_id: string;
  title: string;
  project: string;
  status: string;
  priority: number;
  claimed_by_agent_id: string | null;
  lease_until: string | null;
  updated_at: string;
  blocked_by: string[] | null;
}

interface TaskDetail {
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
  claimed_by_author: string | null;
  claimed_by_agent_id: string | null;
  lease_until: string | null;
  created_at: string;
  updated_at: string;
  blocked_by: string[];
}

interface Comment {
  event_rowid: number;
  task_id: string;
  author: string | null;
  agent_id: string | null;
  text: string;
  timestamp: string;
}

interface Checkpoint {
  event_rowid: number;
  task_id: string;
  name: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface Event {
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

interface Stats {
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
    'Access-Control-Allow-Origin': '*',
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
  const { port, cacheDb, eventsDb } = options;

  // Prepare statements
  const listTasksStmt = cacheDb.prepare(`
    SELECT task_id, title, project, status, priority,
           claimed_by_agent_id, lease_until, updated_at
    FROM tasks_current
    WHERE status != 'archived'
      AND updated_at >= datetime('now', ?)
    ORDER BY priority DESC, updated_at DESC
  `);

  const listTasksWithProjectStmt = cacheDb.prepare(`
    SELECT task_id, title, project, status, priority,
           claimed_by_agent_id, lease_until, updated_at
    FROM tasks_current
    WHERE status != 'archived'
      AND updated_at >= datetime('now', ?)
      AND project = ?
    ORDER BY priority DESC, updated_at DESC
  `);

  const blockedTasksStmt = cacheDb.prepare(`
    SELECT tc.task_id, GROUP_CONCAT(td.depends_on_id) as blocked_by
    FROM tasks_current tc
    JOIN task_dependencies td ON tc.task_id = td.task_id
    JOIN tasks_current dep ON td.depends_on_id = dep.task_id
    WHERE tc.status = 'ready' AND dep.status != 'done'
    GROUP BY tc.task_id
  `);

  const getTaskStmt = cacheDb.prepare(`
    SELECT task_id, title, project, status, priority, parent_id,
           description, links, tags, due_at, metadata,
           claimed_at, claimed_by_author, claimed_by_agent_id, lease_until,
           created_at, updated_at
    FROM tasks_current
    WHERE task_id = ?
  `);

  const getTaskDepsStmt = cacheDb.prepare(`
    SELECT td.depends_on_id
    FROM task_dependencies td
    JOIN tasks_current dep ON td.depends_on_id = dep.task_id
    WHERE td.task_id = ? AND dep.status != 'done'
  `);

  const getCommentsStmt = cacheDb.prepare(`
    SELECT event_rowid, task_id, author, agent_id, text, timestamp
    FROM task_comments
    WHERE task_id = ?
    ORDER BY event_rowid ASC
  `);

  const getCheckpointsStmt = cacheDb.prepare(`
    SELECT event_rowid, task_id, name, data, timestamp
    FROM task_checkpoints
    WHERE task_id = ?
    ORDER BY event_rowid ASC
  `);

  const getEventsStmt = eventsDb.prepare(`
    SELECT e.id, e.event_id, e.task_id, e.type, e.data, e.author, e.agent_id, e.timestamp
    FROM events e
    WHERE e.type IN ('status_changed', 'comment_added', 'checkpoint_recorded', 'task_created')
      AND e.id > ?
    ORDER BY e.id DESC
    LIMIT 50
  `);

  const getStatsStmt = cacheDb.prepare(`
    SELECT status, COUNT(*) as count
    FROM tasks_current
    WHERE status != 'archived'
    GROUP BY status
  `);

  const getProjectsStmt = cacheDb.prepare(`
    SELECT DISTINCT project FROM tasks_current WHERE status != 'archived' ORDER BY project
  `);

  // Route handlers
  function handleTasks(params: URLSearchParams, res: ServerResponse): void {
    const since = params.get('since') || '3d';
    const project = params.get('project');
    const days = DATE_PRESETS[since] ?? 3;
    const dateOffset = `-${days} days`;

    // Get tasks
    let rows: Array<{
      task_id: string;
      title: string;
      project: string;
      status: string;
      priority: number;
      claimed_by_agent_id: string | null;
      lease_until: string | null;
      updated_at: string;
    }>;

    if (project) {
      rows = listTasksWithProjectStmt.all(dateOffset, project) as typeof rows;
    } else {
      rows = listTasksStmt.all(dateOffset) as typeof rows;
    }

    // Get blocked tasks
    const blockedRows = blockedTasksStmt.all() as Array<{ task_id: string; blocked_by: string }>;
    const blockedMap = new Map<string, string[]>();
    for (const row of blockedRows) {
      blockedMap.set(row.task_id, row.blocked_by.split(','));
    }

    // Merge blocked info into tasks
    const tasks: TaskListItem[] = rows.map((row) => ({
      ...row,
      blocked_by: blockedMap.get(row.task_id) ?? null,
    }));

    json(res, { tasks, since, project });
  }

  function handleTaskDetail(taskId: string, res: ServerResponse): void {
    const row = getTaskStmt.get(taskId) as {
      task_id: string;
      title: string;
      project: string;
      status: string;
      priority: number;
      parent_id: string | null;
      description: string | null;
      links: string;
      tags: string;
      due_at: string | null;
      metadata: string;
      claimed_at: string | null;
      claimed_by_author: string | null;
      claimed_by_agent_id: string | null;
      lease_until: string | null;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (!row) {
      notFound(res, `Task not found: ${taskId}`);
      return;
    }

    // Get blocking dependencies
    const depRows = getTaskDepsStmt.all(taskId) as Array<{ depends_on_id: string }>;
    const blocked_by = depRows.map((r) => r.depends_on_id);

    const task: TaskDetail = {
      task_id: row.task_id,
      title: row.title,
      project: row.project,
      status: row.status,
      priority: row.priority,
      parent_id: row.parent_id,
      description: row.description,
      links: JSON.parse(row.links) as string[],
      tags: JSON.parse(row.tags) as string[],
      due_at: row.due_at,
      metadata: JSON.parse(row.metadata) as Record<string, unknown>,
      claimed_at: row.claimed_at,
      claimed_by_author: row.claimed_by_author,
      claimed_by_agent_id: row.claimed_by_agent_id,
      lease_until: row.lease_until,
      created_at: row.created_at,
      updated_at: row.updated_at,
      blocked_by,
    };

    json(res, { task });
  }

  function handleComments(taskId: string, res: ServerResponse): void {
    const rows = getCommentsStmt.all(taskId) as Comment[];
    json(res, { comments: rows });
  }

  function handleCheckpoints(taskId: string, res: ServerResponse): void {
    const rows = getCheckpointsStmt.all(taskId) as Array<{
      event_rowid: number;
      task_id: string;
      name: string;
      data: string;
      timestamp: string;
    }>;
    const checkpoints: Checkpoint[] = rows.map((r) => ({
      event_rowid: r.event_rowid,
      task_id: r.task_id,
      name: r.name,
      data: JSON.parse(r.data) as Record<string, unknown>,
      timestamp: r.timestamp,
    }));
    json(res, { checkpoints });
  }

  function handleEvents(params: URLSearchParams, res: ServerResponse): void {
    const sinceId = parseInt(params.get('since') || '0', 10);
    const rows = getEventsStmt.all(sinceId) as Array<{
      id: number;
      event_id: string;
      task_id: string;
      type: string;
      data: string;
      author: string | null;
      agent_id: string | null;
      timestamp: string;
    }>;

    // Get task titles for these events
    const taskIds = [...new Set(rows.map((r) => r.task_id))];
    const titleMap = new Map<string, string>();
    for (const tid of taskIds) {
      const task = getTaskStmt.get(tid) as { title: string } | undefined;
      if (task) {
        titleMap.set(tid, task.title);
      }
    }

    const events: Event[] = rows.map((r) => ({
      id: r.id,
      event_id: r.event_id,
      task_id: r.task_id,
      type: r.type,
      data: JSON.parse(r.data) as Record<string, unknown>,
      author: r.author,
      agent_id: r.agent_id,
      timestamp: r.timestamp,
      task_title: titleMap.get(r.task_id) ?? null,
    }));

    json(res, { events });
  }

  function handleStats(res: ServerResponse): void {
    const statusRows = getStatsStmt.all() as Array<{ status: string; count: number }>;
    const projectRows = getProjectsStmt.all() as Array<{ project: string }>;

    const by_status: Record<string, number> = {};
    let total = 0;
    for (const row of statusRows) {
      by_status[row.status] = row.count;
      total += row.count;
    }

    const stats: Stats = {
      total,
      by_status,
      projects: projectRows.map((r) => r.project),
    };

    json(res, stats);
  }

  function handleRoot(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
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

  server.listen(port, '0.0.0.0');

  return {
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
    port,
    url: `http://localhost:${port}`,
  };
}
