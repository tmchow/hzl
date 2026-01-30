// packages/hzl-cli/src/commands/which-db.ts
import fs from 'fs';
import { Command } from 'commander';
import { resolveDbPath, getDefaultDbPath } from '../config.js';
import type { GlobalOptions } from '../types.js';

export interface WhichDbResult {
  path: string;
  source: 'cli' | 'env' | 'config' | 'default';
  exists: boolean;
}

export function runWhichDb(options: { cliPath?: string; json: boolean }): WhichDbResult {
  const { cliPath, json } = options;
  
  // Determine source and path
  let source: WhichDbResult['source'];
  let path: string;
  
  if (cliPath) {
    source = 'cli';
    path = cliPath;
  } else if (process.env.HZL_DB) {
    source = 'env';
    path = process.env.HZL_DB;
  } else {
    // Try config file, else default
    const resolved = resolveDbPath(undefined);
    const defaultPath = getDefaultDbPath();
    if (resolved === defaultPath) {
      source = 'default';
      path = defaultPath;
    } else {
      source = 'config';
      path = resolved;
    }
  }
  
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
