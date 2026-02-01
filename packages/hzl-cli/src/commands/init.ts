import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
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
  /** Reset config to default database location (non-destructive) */
  resetConfig?: boolean;
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

/**
 * Prompt for confirmation before destructive operations.
 * Returns true if user confirms, false otherwise.
 */
async function confirmDestructiveAction(eventsDbPath: string, cacheDbPath: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr, // Use stderr so prompts don't interfere with --json output
  });

  return new Promise((resolve) => {
    console.error('');
    console.error('⚠️  WARNING: This will permanently delete all HZL data:');
    console.error(`   - ${eventsDbPath}`);
    if (fs.existsSync(cacheDbPath)) {
      console.error(`   - ${cacheDbPath}`);
    }
    console.error('');
    console.error('This action cannot be undone. All tasks, projects, and history will be lost.');
    console.error('');
    console.error(`To backup first: cp "${eventsDbPath}" "${eventsDbPath}.backup"`);
    console.error('');

    rl.question("Type 'yes' to confirm: ", (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Delete existing database files for --force operation.
 * Exported for testing.
 */
export function deleteExistingDatabases(eventsDbPath: string, cacheDbPath: string): void {
  if (fs.existsSync(eventsDbPath)) {
    fs.unlinkSync(eventsDbPath);
    // Also delete WAL and SHM files if they exist
    const walPath = eventsDbPath + '-wal';
    const shmPath = eventsDbPath + '-shm';
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  }
  if (fs.existsSync(cacheDbPath)) {
    fs.unlinkSync(cacheDbPath);
    const walPath = cacheDbPath + '-wal';
    const shmPath = cacheDbPath + '-shm';
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  }
}

export function runInit(options: InitOptions): InitResult {
  const {
    eventsDbPath,
    cacheDbPath,
    pathSource,
    json,
    configPath = getConfigPath(),
    resetConfig = false,
    syncUrl,
    authToken,
    encryptionKey,
    local
  } = options;

  // Check for config conflict
  const existingConfig = readConfig(configPath);
  if (existingConfig.dbPath && existingConfig.dbPath !== eventsDbPath && !resetConfig) {
    throw new Error(
      `Config already points to: ${existingConfig.dbPath}\n` +
      `Use --reset-config to reset to default location, or --db <path> to use a specific location`
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

  // Only persist dbPath if explicitly specified via --db flag (not default/dev/env)
  const persistDbPath = pathSource === 'cli' ? eventsDbPath : undefined;

  // Write config file
  // If local flag is set, we clear syncUrl and authToken by rewriting config without them
  if (local) {
    const existing = readConfig(configPath);
    const cleanConfig: Partial<Config> = {
      dbPath: persistDbPath,
      defaultProject: existing.defaultProject,
      defaultAuthor: existing.defaultAuthor,
      leaseMinutes: existing.leaseMinutes,
      encryptionKey: encryptionKey ?? existing.encryptionKey,
    };
    // Overwrite config to remove sync keys
    writeConfig(cleanConfig, configPath);
  } else if (resetConfig) {
    // --reset-config: clear old dbPath and write fresh config
    const existing = readConfig(configPath);
    const cleanConfig: Partial<Config> = {
      defaultProject: existing.defaultProject,
      defaultAuthor: existing.defaultAuthor,
      leaseMinutes: existing.leaseMinutes,
      encryptionKey: encryptionKey ?? existing.encryptionKey,
      syncUrl: syncUrl ?? existing.syncUrl,
      authToken: authToken ?? existing.authToken,
    };
    // Ensure config directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    // Rewrite config without dbPath (use default location)
    fs.writeFileSync(configPath, JSON.stringify(cleanConfig, null, 2) + '\n');
  } else {
    const configUpdates: Partial<Config> = {
      dbPath: persistDbPath,
      syncUrl,
      authToken,
      encryptionKey,
    };
    // Only write if there are actual values to persist
    if (Object.values(configUpdates).some(v => v !== undefined)) {
      writeConfig(configUpdates, configPath);
    }
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
    .option('-r, --reset-config', 'Reset config to default database location (non-destructive)')
    .option('-f, --force', 'DESTRUCTIVE: Delete existing database and create fresh. Prompts for confirmation.')
    .option('-y, --yes', 'Skip confirmation prompt (use with --force)')
    .option('--sync-url <url>', 'Turso sync URL (libsql://...)')
    .option('--auth-token <token>', 'Turso auth token')
    .option('--encryption-key <key>', 'Local encryption key')
    .option('--local', 'Explicit local-only mode, don\'t configure sync')
    .action(async function (this: Command) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const opts = z.object({
        resetConfig: z.boolean().optional(),
        force: z.boolean().optional(),
        yes: z.boolean().optional(),
        syncUrl: z.string().optional(),
        authToken: z.string().optional(),
        encryptionKey: z.string().optional(),
        local: z.boolean().optional()
      }).parse(this.opts());

      const resetConfig = opts.resetConfig ?? false;
      const force = opts.force ?? false;
      const yes = opts.yes ?? false;
      const json = globalOpts.json ?? false;

      // Validate flag combinations
      if (force && resetConfig) {
        throw new Error('Cannot use --force and --reset-config together. Choose one.');
      }

      let eventsDbPath: string;
      let cacheDbPath: string;
      let pathSource: DbPathSource;

      if (globalOpts.db) {
        // Explicit --db flag always wins
        eventsDbPath = path.resolve(globalOpts.db);
        cacheDbPath = deriveCachePath(eventsDbPath);
        pathSource = 'cli';
      } else if (resetConfig) {
        // --reset-config without --db resets to default (or dev path in dev mode)
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

      // Handle destructive --force flag
      if (force) {
        const dbExists = fs.existsSync(eventsDbPath);

        if (dbExists) {
          // In JSON mode without --yes, we can't prompt interactively
          if (json && !yes) {
            throw new Error(
              'Cannot use --force with --json without --yes.\n' +
              'Use --force --yes to confirm destruction, or remove --json to see the confirmation prompt.'
            );
          }

          // Check if we can prompt (TTY available)
          if (!yes && !process.stdin.isTTY) {
            throw new Error(
              'Cannot prompt for confirmation in non-interactive mode.\n' +
              'Use --force --yes to confirm destruction without prompting.'
            );
          }

          // Prompt for confirmation unless --yes is provided
          if (!yes) {
            const confirmed = await confirmDestructiveAction(eventsDbPath, cacheDbPath);
            if (!confirmed) {
              console.error('Aborted. No changes made.');
              process.exit(1);
            }
          }

          // Delete existing databases
          deleteExistingDatabases(eventsDbPath, cacheDbPath);
        }
        // If no database exists, --force just initializes normally (no deletion needed)
      }

      runInit({
        eventsDbPath,
        cacheDbPath,
        pathSource,
        json,
        resetConfig,
        syncUrl: opts.syncUrl,
        authToken: opts.authToken,
        encryptionKey: opts.encryptionKey,
        local: opts.local
      });
    });
}
