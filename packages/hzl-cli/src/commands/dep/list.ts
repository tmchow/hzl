import { Command } from 'commander';
import { TaskStatus } from 'hzl-core/events/types.js';
import { resolveDbPaths } from '../../config.js';
import { initializeDb, closeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import { createShortId } from '../../short-id.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface DependencyListItem {
  from_task_id: string;
  to_task_id: string;
  from_title: string | null;
  to_title: string | null;
  from_project: string | null;
  to_project: string | null;
  from_agent: string | null;
  to_agent: string | null;
  from_status: TaskStatus | null;
  to_status: TaskStatus | null;
  cross_project: boolean;
  blocking: boolean;
  missing_from: boolean;
  missing_to: boolean;
}

export interface DepListResult {
  dependencies: DependencyListItem[];
  total: number;
}

export interface DepListOptions {
  services: Services;
  project?: string;
  fromProject?: string;
  toProject?: string;
  agent?: string;
  fromAgent?: string;
  toAgent?: string;
  blockingOnly?: boolean;
  crossProjectOnly?: boolean;
  json: boolean;
}

interface DepListCommandOptions {
  project?: string;
  fromProject?: string;
  toProject?: string;
  agent?: string;
  fromAgent?: string;
  toAgent?: string;
  blockingOnly?: boolean;
  crossProjectOnly?: boolean;
}

interface DependencyRow {
  from_task_id: string;
  to_task_id: string;
  from_title: string | null;
  to_title: string | null;
  from_project: string | null;
  to_project: string | null;
  from_agent: string | null;
  to_agent: string | null;
  from_status: TaskStatus | null;
  to_status: TaskStatus | null;
}

function escapeMd(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function formatTaskCell(
  shortId: (taskId: string) => string,
  taskId: string,
  title: string | null,
  project: string | null
): string {
  const resolvedTitle = title ?? '[missing task]';
  const resolvedProject = project ?? 'missing';
  return `[${shortId(taskId)}] ${resolvedTitle} (${resolvedProject})`;
}

function toDependencyItem(row: DependencyRow): DependencyListItem {
  const missingFrom = row.from_project === null;
  const missingTo = row.to_project === null;
  const crossProject =
    row.from_project !== null &&
    row.to_project !== null &&
    row.from_project !== row.to_project;
  const fromCanBeBlocked =
    row.from_status === TaskStatus.Ready ||
    row.from_status === TaskStatus.InProgress ||
    row.from_status === TaskStatus.Blocked;
  const toIsDone = row.to_status === TaskStatus.Done;
  const blocking = fromCanBeBlocked && !toIsDone;

  return {
    ...row,
    cross_project: crossProject,
    blocking,
    missing_from: missingFrom,
    missing_to: missingTo,
  };
}

function printMarkdown(items: DependencyListItem[]): void {
  if (items.length === 0) {
    console.log('No dependencies found');
    return;
  }

  const shortId = createShortId(items.flatMap((item) => [item.from_task_id, item.to_task_id]));
  console.log('| From | To | Blocking | Cross-Project | Agents |');
  console.log('| --- | --- | --- | --- | --- |');

  for (const item of items) {
    const fromCell = escapeMd(
      formatTaskCell(shortId, item.from_task_id, item.from_title, item.from_project)
    );
    const toCell = escapeMd(formatTaskCell(shortId, item.to_task_id, item.to_title, item.to_project));
    const agents = escapeMd(`${item.from_agent ?? 'unassigned'} -> ${item.to_agent ?? 'unassigned'}`);
    console.log(
      `| ${fromCell} | ${toCell} | ${item.blocking ? 'yes' : 'no'} | ${item.cross_project ? 'yes' : 'no'} | ${agents} |`
    );
  }
}

export function runDepList(options: DepListOptions): DepListResult {
  const {
    services,
    project,
    fromProject,
    toProject,
    agent,
    fromAgent,
    toAgent,
    blockingOnly,
    crossProjectOnly,
    json,
  } = options;

  const where: string[] = [];
  const params: string[] = [];

  if (project) {
    where.push('(ft.project = ? OR tt.project = ?)');
    params.push(project, project);
  }
  if (fromProject) {
    where.push('ft.project = ?');
    params.push(fromProject);
  }
  if (toProject) {
    where.push('tt.project = ?');
    params.push(toProject);
  }

  if (agent) {
    where.push('(ft.agent = ? OR tt.agent = ?)');
    params.push(agent, agent);
  }
  if (fromAgent) {
    where.push('ft.agent = ?');
    params.push(fromAgent);
  }
  if (toAgent) {
    where.push('tt.agent = ?');
    params.push(toAgent);
  }

  if (blockingOnly) {
    where.push("ft.status IN ('ready', 'in_progress', 'blocked')");
    where.push("(tt.task_id IS NULL OR tt.status != 'done')");
  }

  if (crossProjectOnly) {
    where.push('ft.project IS NOT NULL');
    where.push('tt.project IS NOT NULL');
    where.push('ft.project != tt.project');
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = services.cacheDb.prepare(`
    SELECT
      d.task_id AS from_task_id,
      d.depends_on_id AS to_task_id,
      ft.title AS from_title,
      tt.title AS to_title,
      ft.project AS from_project,
      tt.project AS to_project,
      ft.agent AS from_agent,
      tt.agent AS to_agent,
      ft.status AS from_status,
      tt.status AS to_status
    FROM task_dependencies d
    LEFT JOIN tasks_current ft ON ft.task_id = d.task_id
    LEFT JOIN tasks_current tt ON tt.task_id = d.depends_on_id
    ${whereClause}
    ORDER BY COALESCE(ft.project, ''), COALESCE(tt.project, ''), d.task_id, d.depends_on_id
  `).all(...params) as DependencyRow[];

  const dependencies = rows.map(toDependencyItem);
  const result: DepListResult = {
    dependencies,
    total: dependencies.length,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    printMarkdown(dependencies);
  }

  return result;
}

export function createDepListCommand(): Command {
  return new Command('list')
    .description('List dependency edges')
    .option('-P, --project <project>', 'Filter edges where either side is in this project')
    .option('--from-project <project>', 'Filter by dependent task project')
    .option('--to-project <project>', 'Filter by dependency task project')
    .option('--agent <agent>', 'Filter edges where either side is assigned to this agent')
    .option('--from-agent <agent>', 'Filter by dependent task agent')
    .option('--to-agent <agent>', 'Filter by dependency task agent')
    .option('--blocking-only', 'Show only currently blocking dependencies', false)
    .option('--cross-project-only', 'Show only cross-project dependencies', false)
    .action(function (this: Command, opts: DepListCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runDepList({
          services,
          project: opts.project,
          fromProject: opts.fromProject,
          toProject: opts.toProject,
          agent: opts.agent,
          fromAgent: opts.fromAgent,
          toAgent: opts.toAgent,
          blockingOnly: opts.blockingOnly,
          crossProjectOnly: opts.crossProjectOnly,
          json: globalOpts.json ?? false,
        });
      } catch (error) {
        handleError(error, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
