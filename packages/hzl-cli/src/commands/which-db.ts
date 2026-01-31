// packages/hzl-cli/src/commands/which-db.ts
import fs from 'fs';
import { Command } from 'commander';
import { resolveDbPathWithSource, type DbPathSource } from '../config.js';
import type { GlobalOptions } from '../types.js';

export interface WhichDbResult {
  path: string;
  source: DbPathSource;
  exists: boolean;
}

export function runWhichDb(options: { cliPath?: string; json: boolean }): WhichDbResult {
  const { cliPath, json } = options;

  // Use centralized resolution logic
  const resolved = resolveDbPathWithSource(cliPath);
  const { path, source } = resolved;

  // Check if file exists
  const exists = fs.existsSync(path);

  const result: WhichDbResult = { path, source, exists };
  
  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`Database: ${path}`);
    console.log(`Source: ${source}`);
    console.log(`Exists: ${exists ? 'yes' : 'no'}`);
  }
  
  return result;
}

export function createWhichDbCommand(): Command {
  return new Command('which-db')
    .description('Show resolved database path')
    .action(function (this: Command) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      runWhichDb({
        cliPath: globalOpts.db,
        json: globalOpts.json ?? false,
      });
    });
}
