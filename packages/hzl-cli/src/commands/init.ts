// packages/hzl-cli/src/commands/init.ts
import { Command } from 'commander';
import fs from 'fs';
import { z } from 'zod';
import {
  resolveDbPathWithSource,
  getDefaultDbPath,
  ensureDbDirectory,
  writeConfig,
  readConfig,
  getConfigPath,
  isDevMode,
  type DbPathSource
} from '../config.js';
import { GlobalOptionsSchema } from '../types.js';

export interface InitResult {
  path: string;
  created: boolean;
  source: DbPathSource;
}

export interface InitOptions {
  dbPath: string;
  pathSource: DbPathSource;
  json: boolean;
  configPath?: string;
  force?: boolean;
}

function formatSourceHint(source: DbPathSource): string {
  switch (source) {
    case 'cli': return `(from --db flag)`;
    case 'env': return `(from HZL_DB env var)`;
    case 'config': return `(from existing config)`;
    case 'dev': return `(dev mode - isolated from production)`;
    case 'default': return `(default location)`;
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

/**
 * Lower-level init function that creates and initializes the database.
 * Separated from CLI wiring to allow mocking/testing.
 */
export async function runInit(options: InitOptions): Promise<InitResult> {
  const { dbPath, pathSource, json, configPath = getConfigPath(), force = false } = options;

  // Check for config conflict
  const existingConfig = readConfig(configPath);
  if (existingConfig.dbPath && existingConfig.dbPath !== dbPath && !force) {
    throw new Error(
      `Config already points to: ${existingConfig.dbPath}\n` +
      `Use --force to reset to default location, or --db <path> to use a specific location`
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

  const result: InitResult = { path: dbPath, created: !existed, source: pathSource };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    const sourceHint = formatSourceHint(pathSource);
    const message = result.created
      ? `Initialized new database at ${result.path} ${sourceHint}`
      : `Database already exists at ${result.path} ${sourceHint}`;
    console.log(`✓ ${message}`);
  }

  return result;
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize a new HZL database')
    .option('-f, --force', 'Reset to default location (or use with --db for specific path)')
    .action(async function (this: Command) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const opts = z.object({ force: z.boolean().optional() }).parse(this.opts());
      const force = opts.force ?? false;

      let dbPath: string;
      let pathSource: DbPathSource;

      if (globalOpts.db) {
        // Explicit --db flag always wins
        const resolved = resolveDbPathWithSource(globalOpts.db);
        dbPath = resolved.path;
        pathSource = resolved.source;
      } else if (force) {
        // --force without --db resets to default (or dev path in dev mode)
        dbPath = getDefaultDbPath();
        pathSource = isDevMode() ? 'dev' : 'default';
      } else {
        // Normal resolution (cli -> env -> config -> default)
        const resolved = resolveDbPathWithSource();
        dbPath = resolved.path;
        pathSource = resolved.source;
      }

      await runInit({
        dbPath,
        pathSource,
        json: globalOpts.json ?? false,
        force,
      });
    });
}
