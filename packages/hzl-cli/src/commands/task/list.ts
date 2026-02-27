// packages/hzl-cli/src/commands/list.ts
import { Command } from 'commander';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError, CLIError, ExitCode } from '../../errors.js';
import { TaskStatus } from 'hzl-core/events/types.js';
import { GlobalOptionsSchema } from '../../types.js';
import { createShortId } from '../../short-id.js';

const validStatuses = Object.values(TaskStatus);

export interface TaskListItem {
  task_id: string;
  title: string;
  project: string;
  status: string;
  priority: number;
  agent: string | null;
  parent_id: string | null;
  due_at?: string | null;
  tags?: string[];
  description?: string | null;
  links?: string[];
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ListResult {
  tasks: TaskListItem[];
  total: number;
  page?: number;
  limit?: number;
  has_more?: boolean;
  groups?: Array<{
    agent: string | null;
    tasks: TaskListItem[];
    total: number;
  }>;
  total_tasks?: number;
}

export interface ListOptions {
  services: Services;
  project?: string;
  status?: TaskStatus;
  agent?: string;
  agentPattern?: string;
  availableOnly?: boolean;
  parent?: string;
  rootOnly?: boolean;
  limit?: number;
  page?: number;
  view?: 'summary' | 'standard' | 'full';
  groupByAgent?: boolean;
  json: boolean;
}

interface ListCommandOptions {
  project?: string;
  status?: string;
  agent?: string;
  agentPattern?: string;
  available?: boolean;
  parent?: string;
  root?: boolean;
  page?: string;
  limit?: string;
  view?: 'summary' | 'standard' | 'full';
  groupByAgent?: boolean;
}

function globToLikePattern(glob: string): string {
  let result = '';
  let escaped = false;

  for (const char of glob) {
    if (escaped) {
      if (char === '%' || char === '_' || char === '\\') result += '\\';
      result += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '*') {
      result += '%';
      continue;
    }

    if (char === '%' || char === '_' || char === '\\') {
      result += '\\';
    }
    result += char;
  }

  if (escaped) result += '\\\\';
  return result;
}

function shapeTaskForView(
  row: TaskListItem & {
    due_at: string | null;
    tags: string;
    description: string | null;
    links: string;
    metadata: string;
  },
  view: 'summary' | 'standard' | 'full'
): TaskListItem {
  const base: TaskListItem = {
    task_id: row.task_id,
    title: row.title,
    project: row.project,
    status: row.status,
    priority: row.priority,
    agent: row.agent,
    parent_id: row.parent_id,
    created_at: row.created_at,
  };

  if (view === 'summary') {
    return base;
  }

  const standard: TaskListItem = {
    ...base,
    due_at: row.due_at,
    tags: JSON.parse(row.tags || '[]') as string[],
  };

  if (view === 'standard') {
    return standard;
  }

  return {
    ...standard,
    description: row.description,
    links: JSON.parse(row.links || '[]') as string[],
    metadata: JSON.parse(row.metadata || '{}') as Record<string, unknown>,
  };
}

export function runList(options: ListOptions): ListResult {
  const {
    services,
    project,
    status,
    agent,
    agentPattern,
    availableOnly,
    parent,
    rootOnly,
    limit = 50,
    page = 1,
    view = 'summary',
    groupByAgent = false,
    json,
  } = options;
  const db = services.cacheDb;

  if (agent && agentPattern) {
    throw new CLIError('Cannot use --agent and --agent-pattern together', ExitCode.InvalidUsage);
  }
  if (page < 1 || !Number.isInteger(page)) {
    throw new CLIError('Page must be an integer >= 1', ExitCode.InvalidInput);
  }
  if (limit < 1 || !Number.isInteger(limit)) {
    throw new CLIError('Limit must be an integer >= 1', ExitCode.InvalidInput);
  }

  // Validate parent exists if specified
  if (parent) {
    const parentTask = services.taskService.getTaskById(parent);
    if (!parentTask) {
      throw new CLIError(`Parent task not found: ${parent}`, ExitCode.NotFound);
    }
  }

  // Build query with filters
  const where: string[] = ["status != 'archived'"];
  const params: Array<string | number> = [];

  if (project) {
    where.push('project = ?');
    params.push(project);
  }

  if (status) {
    where.push('status = ?');
    params.push(status);
  }

  if (agent) {
    where.push('assignee = ?');
    params.push(agent);
  }

  if (agentPattern) {
    where.push("LOWER(COALESCE(assignee, '')) LIKE LOWER(?) ESCAPE '\\'");
    params.push(globToLikePattern(agentPattern));
  }

  if (parent) {
    where.push('parent_id = ?');
    params.push(parent);
  }

  if (rootOnly) {
    where.push('parent_id IS NULL');
  }

  if (availableOnly) {
    // Match task next semantics: ready, deps satisfied, and leaf-only (no children)
    where.push(`status = 'ready'`);
    where.push(`NOT EXISTS (
      SELECT 1 FROM task_dependencies td
      JOIN tasks_current dep ON td.depends_on_id = dep.task_id
      WHERE td.task_id = tasks_current.task_id AND dep.status != 'done'
    )`);
    where.push(`NOT EXISTS (
      SELECT 1 FROM tasks_current child WHERE child.parent_id = tasks_current.task_id
    )`);
  }

  const whereClause = `WHERE ${where.join(' AND ')}`;
  const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM tasks_current ${whereClause}`).get(
    ...params
  ) as { total: number };

  const offset = (page - 1) * limit;
  const query = `
    SELECT task_id, title, project, status, priority, assignee AS agent, parent_id, created_at,
           due_at, tags, description, links, metadata
    FROM tasks_current
    ${whereClause}
    ORDER BY priority DESC, created_at ASC, task_id ASC
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(query).all(...params, limit, offset) as Array<
    TaskListItem & { due_at: string | null; tags: string; description: string | null; links: string; metadata: string }
  >;
  const tasks = rows.map((row) => shapeTaskForView(row, view));
  const hasMore = offset + rows.length < totalRow.total;

  if (groupByAgent) {
    const grouped = new Map<string, { agent: string | null; tasks: TaskListItem[] }>();
    for (const task of tasks) {
      const key = task.agent ?? '__unassigned__';
      if (!grouped.has(key)) {
        grouped.set(key, { agent: task.agent, tasks: [] });
      }
      grouped.get(key)!.tasks.push(task);
    }

    const groups = Array.from(grouped.values())
      .sort((a, b) => {
        if (a.agent === null) return 1;
        if (b.agent === null) return -1;
        return a.agent.localeCompare(b.agent);
      })
      .map((group) => ({
        agent: group.agent,
        tasks: group.tasks,
        total: group.tasks.length,
      }));

    const groupedResult: ListResult = {
      tasks,
      total: totalRow.total,
      page,
      limit,
      has_more: hasMore,
      groups,
      total_tasks: totalRow.total,
    };

    if (json) {
      console.log(JSON.stringify(groupedResult));
    } else {
      const shortId = createShortId(tasks.map(t => t.task_id));
      if (groups.length === 0) {
        console.log('No tasks found');
      } else {
        for (const group of groups) {
          console.log(`Agent: ${group.agent ?? 'unassigned'} (${group.total})`);
          for (const task of group.tasks) {
            const statusIcon = task.status === 'done' ? '✓' : task.status === 'in_progress' ? '→' : '○';
            console.log(`  ${statusIcon} [${shortId(task.task_id)}] ${task.title} (${task.project})`);
          }
          console.log('');
        }
      }
    }

    return groupedResult;
  }

  const result: ListResult = {
    tasks,
    total: totalRow.total,
    page,
    limit,
    has_more: hasMore,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    if (rows.length === 0) {
      console.log('No tasks found');
    } else {
      const shortId = createShortId(rows.map(t => t.task_id));
      console.log('Tasks:');
      for (const task of rows) {
        const statusIcon = task.status === 'done' ? '✓' : task.status === 'in_progress' ? '→' : '○';
        console.log(`  ${statusIcon} [${shortId(task.task_id)}] ${task.title} (${task.project})`);
      }
    }
  }

  return result;
}

export function createListCommand(): Command {
  return new Command('list')
    .description('List tasks')
    .option('-P, --project <project>', 'Filter by project')
    .option('-s, --status <status>', 'Filter by status')
    .option('--agent <name>', 'Filter by exact agent identity')
    .option('--agent-pattern <glob>', "Filter by case-insensitive agent glob (use '*' wildcard)")
    .option('-a, --available', 'Show only available (ready, no blocking deps)', false)
    .option('--parent <taskId>', 'Filter by parent task')
    .option('--root', 'Show only root tasks (no parent)', false)
    .option('--page <n>', 'Page number (1-based)', '1')
    .option('--group-by-agent', 'Group task details by agent')
    .option('-l, --limit <n>', 'Limit results', '50')
    .option('--view <view>', 'Response view: summary | standard | full', 'summary')
    .action(function (this: Command, opts: ListCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        const status = opts.status && validStatuses.includes(opts.status as TaskStatus)
          ? (opts.status as TaskStatus)
          : undefined;
        runList({
          services,
          project: opts.project,
          status,
          agent: opts.agent,
          agentPattern: opts.agentPattern,
          availableOnly: opts.available,
          parent: opts.parent,
          rootOnly: opts.root,
          page: parseInt(opts.page ?? '1', 10),
          view: opts.view ?? 'summary',
          groupByAgent: opts.groupByAgent,
          limit: parseInt(opts.limit ?? '50', 10),
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
