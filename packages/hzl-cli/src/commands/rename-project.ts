// packages/hzl-cli/src/commands/rename-project.ts
import { Command } from 'commander';
import { resolveDbPath } from '../config.js';
import { initializeDb, closeDb, type Services } from '../db.js';
import { EventType } from 'hzl-core/events/types.js';
import type { GlobalOptions } from '../types.js';

export interface RenameProjectResult {
  from: string;
  to: string;
  moved_count: number;
}

interface TaskRow {
  task_id: string;
  project: string;
}

export function runRenameProject(options: {
  services: Services;
  from: string;
  to: string;
  force: boolean;
  json: boolean;
}): RenameProjectResult {
  const { services, from, to, force, json } = options;
  const { db, eventStore, projectionEngine } = services;
  
  // Get all tasks in source project via direct DB query
  const sourceTasks = db.prepare('SELECT task_id, project FROM tasks_current WHERE project = ?').all(from) as TaskRow[];
  
  if (sourceTasks.length === 0) {
    const result: RenameProjectResult = { from, to, moved_count: 0 };
    if (json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(`No tasks found in project '${from}'`);
    }
    return result;
  }
  
  // Check if target project already exists (has tasks)
  const targetTasks = db.prepare('SELECT task_id FROM tasks_current WHERE project = ? LIMIT 1').all(to);
  
  if (targetTasks.length > 0 && !force) {
    throw new Error(`Project '${to}' already exists. Use --force to merge projects.`);
  }
  
  // Move all tasks from source to target by emitting task_moved events
  let movedCount = 0;
  for (const task of sourceTasks) {
    const event = eventStore.append({
      task_id: task.task_id,
      type: EventType.TaskMoved,
      data: { from_project: from, to_project: to },
    });
    projectionEngine.applyEvent(event);
    movedCount++;
  }
  
  const result: RenameProjectResult = { from, to, moved_count: movedCount };
  
  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`✓ Renamed project '${from}' to '${to}' (${movedCount} tasks moved)`);
  }
  
  return result;
}

export function createRenameProjectCommand(): Command {
  return new Command('rename-project')
    .description('Rename a project (moves all tasks)')
    .argument('<from>', 'Current project name')
    .argument('<to>', 'New project name')
    .option('-f, --force', 'Force merge if target project exists', false)
    .action(function (this: Command, from: string, to: string, opts: { force: boolean }) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      const dbPath = resolveDbPath(globalOpts.db);
      const services = initializeDb(dbPath);
      try {
        runRenameProject({
          services,
          from,
          to,
          force: opts.force,
          json: globalOpts.json ?? false,
        });
      } finally {
        closeDb(services);
      }
    });
}
