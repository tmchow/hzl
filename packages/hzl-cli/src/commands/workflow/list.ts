import { Command } from 'commander';
import { WorkflowService } from 'hzl-core/services/workflow-service.js';
import { resolveDbPaths } from '../../config.js';
import { closeDb, initializeDb, type Services } from '../../db.js';
import { handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface WorkflowListResult {
  workflows: Array<{
    name: 'start' | 'handoff' | 'delegate';
    description: string;
  }>;
}

function createWorkflowService(services: Services): WorkflowService {
  return new WorkflowService(
    services.cacheDb,
    services.eventStore,
    services.projectionEngine,
    services.taskService,
    services.db
  );
}

export function runWorkflowList(options: {
  services: Services;
  json: boolean;
}): WorkflowListResult {
  const workflowService = createWorkflowService(options.services);
  const result: WorkflowListResult = { workflows: workflowService.listWorkflows() };

  if (options.json) {
    console.log(JSON.stringify(result));
  } else {
    for (const workflow of result.workflows) {
      console.log(`${workflow.name}: ${workflow.description}`);
    }
  }

  return result;
}

export function createWorkflowListCommand(): Command {
  return new Command('list')
    .description('List available built-in workflows')
    .action(function (this: Command) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runWorkflowList({ services, json: globalOpts.json ?? false });
      } catch (error) {
        handleError(error, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
