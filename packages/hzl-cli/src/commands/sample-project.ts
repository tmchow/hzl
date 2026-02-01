// packages/hzl-cli/src/commands/sample-project.ts
import { Command } from 'commander';
import { TaskStatus } from 'hzl-core/events/types.js';
import {
  SAMPLE_PROJECT_NAME,
  SAMPLE_TASKS,
} from 'hzl-core/fixtures/sample-data.js';
import { resolveDbPaths } from '../config.js';
import { initializeDb, closeDb, type Services } from '../db.js';
import { handleError } from '../errors.js';
import { GlobalOptionsSchema } from '../types.js';

export interface SampleProjectCreateResult {
  project: string;
  tasksCreated: number;
  skipped: boolean;
}

export interface SampleProjectResetResult {
  project: string;
  deleted: number;
  created: number;
}

function createSampleProject(services: Services): number {
  const existingProject = services.projectService.getProject(SAMPLE_PROJECT_NAME);
  if (!existingProject) {
    services.projectService.createProject(SAMPLE_PROJECT_NAME);
  }

  const taskIds: string[] = [];

  for (const spec of SAMPLE_TASKS) {
    const dependsOn = spec.depends_on_indices
      ? spec.depends_on_indices
          .map((index) => taskIds[index])
          .filter((id): id is string => Boolean(id))
      : undefined;

    const task = services.taskService.createTask({
      title: spec.title,
      project: SAMPLE_PROJECT_NAME,
      description: spec.description,
      tags: spec.tags,
      priority: spec.priority ?? 0,
      depends_on: dependsOn,
    });

    taskIds.push(task.task_id);

    if (spec.status && spec.status !== 'backlog') {
      services.taskService.setStatus(task.task_id, TaskStatus.Ready);
      if (spec.status === 'in_progress' || spec.status === 'done') {
        services.taskService.claimTask(task.task_id, { author: 'sample-agent' });
      }
      if (spec.status === 'done') {
        services.taskService.completeTask(task.task_id);
      }
    }

    if (spec.comments) {
      for (const comment of spec.comments) {
        services.taskService.addComment(task.task_id, comment, { author: 'sample-user' });
      }
    }

    if (spec.checkpoints) {
      for (const checkpoint of spec.checkpoints) {
        services.taskService.addCheckpoint(task.task_id, checkpoint.name, checkpoint.data);
      }
    }
  }

  return taskIds.length;
}

function deleteSampleProjectData(services: Services): number {
  const taskRows = services.cacheDb
    .prepare('SELECT task_id FROM tasks_current WHERE project = ?')
    .all(SAMPLE_PROJECT_NAME) as { task_id: string }[];

  const taskIds = taskRows.map((row) => row.task_id);
  if (taskIds.length === 0) return 0;

  const placeholders = taskIds.map(() => '?').join(', ');

  services.cacheDb
    .prepare(`DELETE FROM task_dependencies WHERE task_id IN (${placeholders}) OR depends_on_id IN (${placeholders})`)
    .run(...taskIds, ...taskIds);
  services.cacheDb
    .prepare(`DELETE FROM task_tags WHERE task_id IN (${placeholders})`)
    .run(...taskIds);
  services.cacheDb
    .prepare(`DELETE FROM task_comments WHERE task_id IN (${placeholders})`)
    .run(...taskIds);
  services.cacheDb
    .prepare(`DELETE FROM task_checkpoints WHERE task_id IN (${placeholders})`)
    .run(...taskIds);
  services.cacheDb
    .prepare(`DELETE FROM task_search WHERE task_id IN (${placeholders})`)
    .run(...taskIds);
  services.cacheDb
    .prepare(`DELETE FROM tasks_current WHERE task_id IN (${placeholders})`)
    .run(...taskIds);

  return taskIds.length;
}

export interface SampleProjectCreateOptions {
  eventsDbPath: string;
  cacheDbPath: string;
  json: boolean;
}

export function runSampleProjectCreate(options: SampleProjectCreateOptions): SampleProjectCreateResult {
  const services = initializeDb({
    eventsDbPath: options.eventsDbPath,
    cacheDbPath: options.cacheDbPath,
  });
  try {
    const existing = services.cacheDb
      .prepare('SELECT COUNT(*) as count FROM tasks_current WHERE project = ?')
      .get(SAMPLE_PROJECT_NAME) as { count: number };

    if (existing.count > 0) {
      const result: SampleProjectCreateResult = {
        project: SAMPLE_PROJECT_NAME,
        tasksCreated: 0,
        skipped: true,
      };
      if (options.json) {
        console.log(JSON.stringify(result));
      } else {
        console.log(
          `✓ Sample project '${SAMPLE_PROJECT_NAME}' already exists with ${existing.count} tasks. Use 'sample-project reset' to recreate.`
        );
      }
      return result;
    }

    const tasksCreated = createSampleProject(services);
    const result: SampleProjectCreateResult = {
      project: SAMPLE_PROJECT_NAME,
      tasksCreated,
      skipped: false,
    };

    if (options.json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(`✓ Created sample project '${SAMPLE_PROJECT_NAME}' with ${tasksCreated} tasks`);
    }

    return result;
  } finally {
    closeDb(services);
  }
}

export interface SampleProjectResetOptions {
  eventsDbPath: string;
  cacheDbPath: string;
  json: boolean;
}

export function runSampleProjectReset(options: SampleProjectResetOptions): SampleProjectResetResult {
  const services = initializeDb({
    eventsDbPath: options.eventsDbPath,
    cacheDbPath: options.cacheDbPath,
  });
  try {
    const deleted = deleteSampleProjectData(services);
    const created = createSampleProject(services);
    const result: SampleProjectResetResult = {
      project: SAMPLE_PROJECT_NAME,
      deleted,
      created,
    };

    if (options.json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(
        `✓ Reset sample project '${SAMPLE_PROJECT_NAME}': deleted ${deleted} tasks, created ${created} tasks`
      );
    }

    return result;
  } finally {
    closeDb(services);
  }
}

export function createSampleProjectCommand(): Command {
  const command = new Command('sample-project')
    .description('Create or reset the sample project dataset');

  command
    .command('create')
    .description('Create the sample project if it does not exist')
    .action(function (this: Command) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      try {
        runSampleProjectCreate({
          eventsDbPath,
          cacheDbPath,
          json: globalOpts.json ?? false,
        });
      } catch (err) {
        handleError(err, globalOpts.json);
      }
    });

  command
    .command('reset')
    .description('Delete and recreate the sample project')
    .action(function (this: Command) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      try {
        runSampleProjectReset({
          eventsDbPath,
          cacheDbPath,
          json: globalOpts.json ?? false,
        });
      } catch (err) {
        handleError(err, globalOpts.json);
      }
    });

  return command;
}
