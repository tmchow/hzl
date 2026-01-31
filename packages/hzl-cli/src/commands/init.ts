// packages/hzl-cli/src/commands/init.ts
import { Command } from 'commander';
import fs from 'fs';
import { resolveDbPath, ensureDbDirectory, writeConfig, readConfig, getConfigPath } from '../config.js';
import type { GlobalOptions } from '../types.js';

export interface InitResult {
  path: string;
  created: boolean;
}

export interface InitOptions {
  dbPath: string;
  json: boolean;
  configPath?: string;
  force?: boolean;
}

/**
 * Lower-level init function that creates and initializes the database.
 * Separated from CLI wiring to allow mocking/testing.
 */
export async function runInit(options: InitOptions): Promise<InitResult> {
  const { dbPath, json, configPath = getConfigPath(), force = false } = options;

  // Check for config conflict
  const existingConfig = readConfig(configPath);
  if (existingConfig.dbPath && existingConfig.dbPath !== dbPath && !force) {
    throw new Error(
      `Config already exists pointing to ${existingConfig.dbPath}\n` +
      `Use --force to reinitialize with a different database`
    );
  }

  const existed = fs.existsSync(dbPath);
  
  // Ensure the directory exists
  ensureDbDirectory(dbPath);
  
  // Dynamic import to avoid test resolution issues
  // This is only executed at runtime, not during static analysis
  const { initializeDb, closeDb } = await import('../db.js');
  
  // Initialize DB which handles migrations
  const services = initializeDb(dbPath);
  closeDb(services);

  // Write config file
  writeConfig({ dbPath }, configPath);

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
    .option('-f, --force', 'Force reinitialize even if config points elsewhere')
    .action(async function (this: Command) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      const opts = this.opts();
      await runInit({
        dbPath: resolveDbPath(globalOpts.db),
        json: globalOpts.json ?? false,
        force: opts.force ?? false,
      });
    });
}
