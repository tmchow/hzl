import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import {
  createDatastore
} from 'hzl-core';
import {
  resolveDbPathsWithSource,
  getDefaultDbPath,
  ensureDbDirectory,
  writeConfig,
  readConfig,
  getConfigPath,
  isDevMode,
  deriveCachePath,
  type DbPathSource
} from '../config.js';
import { GlobalOptionsSchema, type Config } from '../types.js';

export interface InitResult {
  eventsDbPath: string;
  cacheDbPath: string;
  created: boolean;
  source: DbPathSource;
  mode: string;
  syncUrl?: string;
  instanceId: string;
  encrypted?: boolean;
}

export interface InitOptions {
  eventsDbPath: string;
  cacheDbPath: string;
  pathSource: DbPathSource;
  json: boolean;
  configPath?: string;
  force?: boolean;
  syncUrl?: string;
  authToken?: string;
  encryptionKey?: string;
  local?: boolean;
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

export function runInit(options: InitOptions): InitResult {
  const {
    eventsDbPath,
    cacheDbPath,
    pathSource,
    json,
    configPath = getConfigPath(),
    force = false,
    syncUrl,
    authToken,
    encryptionKey,
    local
  } = options;

  // Check for config conflict
  const existingConfig = readConfig(configPath);
  if (existingConfig.dbPath && existingConfig.dbPath !== eventsDbPath && !force) {
    throw new Error(
      `Config already points to: ${existingConfig.dbPath}\n` +
      `Use --force to reset to default location, or --db <path> to use a specific location`
    );
  }

  const existed = fs.existsSync(eventsDbPath);

  // Ensure the directories exist
  ensureDbDirectory(eventsDbPath);
  ensureDbDirectory(cacheDbPath);

  // Initialize DataStore which handles both databases and migrations
  const datastore = createDatastore({
    events: {
      path: eventsDbPath,
      syncUrl: local ? undefined : (syncUrl ?? existingConfig.syncUrl),
      authToken: local ? undefined : (authToken ?? existingConfig.authToken),
      encryptionKey: encryptionKey ?? existingConfig.encryptionKey,
      syncMode: 'offline',
      readYourWrites: true
    },
    cache: { path: cacheDbPath }
  });

  const instanceId = datastore.instanceId;
  const mode = datastore.mode;
  const finalSyncUrl = datastore.syncUrl;

  datastore.close();

  // Write config file
  // If local flag is set, we clear syncUrl and authToken by rewriting config without them
  if (local) {
    // Read existing config and remove sync-related keys
    const existing = readConfig(configPath);
    const cleanConfig: Partial<Config> = {
      dbPath: eventsDbPath,
      defaultProject: existing.defaultProject,
      defaultAuthor: existing.defaultAuthor,
      leaseMinutes: existing.leaseMinutes,
      encryptionKey: encryptionKey ?? existing.encryptionKey,
    };
    // Write the cleaned config (overwrites, removing sync keys)
    writeConfig(cleanConfig, configPath);
  } else {
    const configUpdates: Partial<Config> = { dbPath: eventsDbPath };
    if (syncUrl) configUpdates.syncUrl = syncUrl;
    if (authToken) configUpdates.authToken = authToken;
    if (encryptionKey) configUpdates.encryptionKey = encryptionKey;
    writeConfig(configUpdates, configPath);
  }

  const result: InitResult = {
    eventsDbPath,
    cacheDbPath,
    created: !existed,
    source: pathSource,
    mode,
    instanceId,
    syncUrl: finalSyncUrl,
    encrypted: !!encryptionKey || !!existingConfig.encryptionKey
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const sourceHint = formatSourceHint(pathSource);
    const message = result.created
      ? `Initialized new database at ${result.eventsDbPath} ${sourceHint}`
      : `Database already exists at ${result.eventsDbPath} ${sourceHint}`;
    console.log(`✓ ${message}`);
    console.log(`  Mode: ${result.mode}`);
    console.log(`  Instance: ${result.instanceId}`);
    if (result.syncUrl) {
      console.log(`  Sync URL: ${result.syncUrl}`);
    }
  }

  return result;
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize a new HZL database')
    .option('-f, --force', 'Reset to default location (or use with --db for specific path)')
    .option('--sync-url <url>', 'Turso sync URL (libsql://...)')
    .option('--auth-token <token>', 'Turso auth token')
    .option('--encryption-key <key>', 'Local encryption key')
    .option('--local', 'Explicit local-only mode, don\'t configure sync')
    .action(function (this: Command) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const opts = z.object({
        force: z.boolean().optional(),
        syncUrl: z.string().optional(),
        authToken: z.string().optional(),
        encryptionKey: z.string().optional(),
        local: z.boolean().optional()
      }).parse(this.opts());
      const force = opts.force ?? false;

      let eventsDbPath: string;
      let cacheDbPath: string;
      let pathSource: DbPathSource;

      if (globalOpts.db) {
        // Explicit --db flag always wins
        eventsDbPath = path.resolve(globalOpts.db);
        cacheDbPath = deriveCachePath(eventsDbPath);
        pathSource = 'cli';
      } else if (force) {
        // --force without --db resets to default (or dev path in dev mode)
        eventsDbPath = getDefaultDbPath();
        cacheDbPath = deriveCachePath(eventsDbPath);
        pathSource = isDevMode() ? 'dev' : 'default';
      } else {
        // Normal resolution (cli -> env -> config -> default)
        const resolved = resolveDbPathsWithSource();
        eventsDbPath = resolved.eventsDbPath;
        cacheDbPath = resolved.cacheDbPath;
        pathSource = resolved.source;
      }

      runInit({
        eventsDbPath,
        cacheDbPath,
        pathSource,
        json: globalOpts.json ?? false,
        force,
        syncUrl: opts.syncUrl,
        authToken: opts.authToken,
        encryptionKey: opts.encryptionKey,
        local: opts.local
      });
    });
}
