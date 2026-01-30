// packages/hzl-cli/src/commands/init.ts
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { resolveDbPath, ensureDbDirectory } from '../config.js';
import type { GlobalOptions } from '../types.js';

export interface InitResult {
  path: string;
  created: boolean;
}

/**
 * Lower-level init function that creates and initializes the database.
 * Separated from CLI wiring to allow mocking/testing.
 */
export async function runInit(options: { dbPath: string; json: boolean }): Promise<InitResult> {
  const { dbPath, json } = options;
  const existed = fs.existsSync(dbPath);
  
  // Ensure the directory exists
  ensureDbDirectory(dbPath);
  
  // Dynamic import to avoid test resolution issues
  // This is only executed at runtime, not during static analysis
  const { initializeDb, closeDb } = await import('../db.js');
  
  // Initialize DB which handles migrations
  const services = initializeDb(dbPath);
  closeDb(services);

  const result: InitResult = { path: dbPath, created: !existed };
  
  if (json) {
    console.log(JSON.stringify(result));
  } else {
    const message = result.created
      ? `Initialized new database at ${result.path}`
      : `Database already exists at ${result.path}`;
    console.log(`✓ ${message}`);
  }
  
  return result;
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize a new HZL database')
    .action(async function (this: Command) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      await runInit({
        dbPath: resolveDbPath(globalOpts.db),
        json: globalOpts.json ?? false,
      });
    });
}
