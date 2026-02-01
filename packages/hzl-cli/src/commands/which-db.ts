// packages/hzl-cli/src/commands/which-db.ts
import fs from 'fs';
import { Command } from 'commander';
import { resolveDbPaths } from '../config.js';
import { GlobalOptionsSchema } from '../types.js';

export interface WhichDbResult {
  eventsDbPath: string;
  cacheDbPath: string;
  eventsDbExists: boolean;
  cacheDbExists: boolean;
}

export function runWhichDb(options: { cliPath?: string; json: boolean }): WhichDbResult {
  const { cliPath, json } = options;

  const { eventsDbPath, cacheDbPath } = resolveDbPaths(cliPath);

  const eventsDbExists = fs.existsSync(eventsDbPath);
  const cacheDbExists = fs.existsSync(cacheDbPath);

  const result: WhichDbResult = { eventsDbPath, cacheDbPath, eventsDbExists, cacheDbExists };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`Events database: ${eventsDbPath} (${eventsDbExists ? 'exists' : 'missing'})`);
    console.log(`Cache database:  ${cacheDbPath} (${cacheDbExists ? 'exists' : 'missing'})`);
  }

  return result;
}

export function createWhichDbCommand(): Command {
  return new Command('which-db')
    .description('Show resolved database paths')
    .action(function (this: Command) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      runWhichDb({
        cliPath: globalOpts.db,
        json: globalOpts.json ?? false,
      });
    });
}
