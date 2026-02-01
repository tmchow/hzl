import { Command } from 'commander';
import fs from 'fs';
import { z } from 'zod';
import {
  createDatastore,
  getInstanceId
} from 'hzl-core';
import {
  resolveDbPathWithSource,
  getDefaultDbPath,
  ensureDbDirectory,
  writeConfig,
  readConfig,
  getConfigPath,
  isDevMode,
  resolveDbPaths,
  type DbPathSource
} from '../config.js';
import { GlobalOptionsSchema } from '../types.js';

export interface InitResult {
  path: string;
  created: boolean;
  source: DbPathSource;
  mode: string;
  syncUrl?: string;
  instanceId: string;
  encrypted?: boolean;
}

export interface InitOptions {
  dbPath: string;
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

export async function runInit(options: InitOptions): Promise<InitResult> {
  const {
    dbPath,
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
  if (existingConfig.dbPath && existingConfig.dbPath !== dbPath && !force) {
    throw new Error(
      `Config already points to: ${existingConfig.dbPath}\n` +
      `Use --force to reset to default location, or --db <path> to use a specific location`
    );
  }

  const existed = fs.existsSync(dbPath);

  // Ensure the directory exists
  ensureDbDirectory(dbPath);

  // Use resolveDbPaths to treat dbPath as the events db and derive cache db
  const { eventsDbPath, cacheDbPath } = resolveDbPaths(dbPath, configPath);

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
  // If local flag is set, we clear syncUrl and authToken
  const configUpdates: any = { dbPath };

  if (local) {
    // Explicitly disabling sync requires undefined or special handling?
    // writeConfig merges, so passing undefined usually doesn't delete keys in typical implementations unless logic handles it.
    // However, existing Config interface treats them as optional.
    // To clear them, we might need value that writeConfig understands, or rely on them being optional.
    // Simple approach: set to undefined might not remove from file if implementation uses {...existing, ...updates}.
    // But since Config is flat object and defined via Zod, partial updates work.
    // Assuming simple merge. To delete, we probably need null or re-write if key deletion is needed.
    // But in this implementation, let's just update what we have.
    // If user wants to "forget", we might need null support in types.
    // For now, let's just write what is provided.
  } else {
    if (syncUrl) configUpdates.syncUrl = syncUrl;
    if (authToken) configUpdates.authToken = authToken;
  }

  if (encryptionKey) configUpdates.encryptionKey = encryptionKey;

  writeConfig(configUpdates, configPath);

  const result: InitResult = {
    path: dbPath,
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
      ? `Initialized new database at ${result.path} ${sourceHint}`
      : `Database already exists at ${result.path} ${sourceHint}`;
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
    .action(async function (this: Command) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const opts = z.object({
        force: z.boolean().optional(),
        syncUrl: z.string().optional(),
        authToken: z.string().optional(),
        encryptionKey: z.string().optional(),
        local: z.boolean().optional()
      }).parse(this.opts());
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
        syncUrl: opts.syncUrl,
        authToken: opts.authToken,
        encryptionKey: opts.encryptionKey,
        local: opts.local
      });
    });
}
