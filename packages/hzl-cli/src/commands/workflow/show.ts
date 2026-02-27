import { Command } from 'commander';
import {
  WorkflowService,
  type WorkflowName,
} from 'hzl-core/services/workflow-service.js';
import { resolveDbPaths } from '../../config.js';
import { closeDb, initializeDb, type Services } from '../../db.js';
import { CLIError, ExitCode, handleError } from '../../errors.js';
import { GlobalOptionsSchema } from '../../types.js';

export interface WorkflowShowResult {
  workflow: {
    name: WorkflowName;
    description: string;
    supports_auto_op_id: boolean;
    args: Array<{
      name: string;
      required: boolean;
      description: string;
      default?: string;
    }>;
    notes: string[];
  };
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

function parseWorkflowName(name: string): WorkflowName {
  if (name === 'start' || name === 'handoff' || name === 'delegate') {
    return name;
  }
  throw new CLIError(`Unknown workflow: ${name}`, ExitCode.NotFound);
}

export function runWorkflowShow(options: {
  services: Services;
  name: string;
  json: boolean;
}): WorkflowShowResult {
  const workflowName = parseWorkflowName(options.name);
  const workflowService = createWorkflowService(options.services);
  const definition = workflowService.showWorkflow(workflowName);
  const result: WorkflowShowResult = { workflow: definition };

  if (options.json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`${definition.name}`);
    console.log(`Description: ${definition.description}`);
    console.log(`Supports --auto-op-id: ${definition.supports_auto_op_id ? 'yes' : 'no'}`);
    console.log('Arguments:');
    for (const arg of definition.args) {
      const required = arg.required ? 'required' : 'optional';
      const defaultText = arg.default ? ` [default: ${arg.default}]` : '';
      console.log(`  ${arg.name} (${required}) - ${arg.description}${defaultText}`);
    }
    if (definition.notes.length > 0) {
      console.log('Notes:');
      for (const note of definition.notes) {
        console.log(`  - ${note}`);
      }
    }
  }

  return result;
}

export function createWorkflowShowCommand(): Command {
  return new Command('show')
    .description('Show workflow details and contract notes')
    .argument('<name>', 'Workflow name')
    .action(function (this: Command, name: string) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runWorkflowShow({ services, name, json: globalOpts.json ?? false });
      } catch (error) {
        handleError(error, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
