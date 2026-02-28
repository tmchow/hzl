// packages/hzl-cli/src/config.ts
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import type { Config } from './types.js';

const ConfigFileSchema = z.object({
  db: z.object({
    events: z.object({
      path: z.string().optional(),
      syncUrl: z.string().optional(),
      authToken: z.string().optional(),
      syncMode: z.enum(['replica', 'offline']).optional(),
      readYourWrites: z.boolean().optional(),
      encryptionKey: z.string().optional(),
    }).optional(),
    cache: z.object({
      path: z.string().optional(),
    }).optional(),
    sync: z.object({
      policy: z.enum(['manual', 'opportunistic', 'strict']).optional(),
      staleAfterMs: z.number().optional(),
      minIntervalMs: z.number().optional(),
      conflictStrategy: z.enum(['merge', 'discard-local', 'fail']).optional(),
    }).optional(),
  }).optional(),
  dbPath: z.string().optional(),
  hooks: z.object({
    on_done: z.object({
      url: z.string().optional(),
      headers: z.record(z.string(), z.string()).optional(),
    }).optional(),
  }).optional(),
  defaultProject: z.string().optional(),
  defaultAuthor: z.string().optional(),
  leaseMinutes: z.number().positive().optional(),
  claimStaggerMs: z.number().int().min(0).optional(),
  // flatten top-level properties for backward compatibility read
  syncUrl: z.string().optional(),
  authToken: z.string().optional(),
  encryptionKey: z.string().optional(),
}).partial();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Detect if running from source repo (development mode)
// Walks up from this file to find monorepo root
function findRepoRoot(): string | null {
  const __filename = fileURLToPath(import.meta.url);
  let dir = path.dirname(__filename);

  while (dir !== path.dirname(dir)) { // Stop at filesystem root
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const parsed: unknown = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        // Check for monorepo root: has workspaces containing hzl-cli
        if (
          isRecord(parsed) &&
          parsed.workspaces &&
          fs.existsSync(path.join(dir, 'packages', 'hzl-cli', 'package.json'))
        ) {
          return dir;
        }
      } catch {
        // Ignore parse errors
      }
    }
    dir = path.dirname(dir);
  }
  return null;
}

// Cache the repo root detection
let _repoRoot: string | null | undefined;
function getRepoRoot(): string | null {
  if (_repoRoot === undefined) {
    _repoRoot = findRepoRoot();
  }
  return _repoRoot;
}

export function isDevMode(): boolean {
  // Allow explicit override (for tests that need to check production behavior)
  if (process.env.HZL_DEV_MODE === '0') return false;
  return getRepoRoot() !== null;
}

// Get dev-local paths (inside the repo)
function getDevDataDir(): string {
  const root = getRepoRoot();
  if (!root) throw new Error('Not in dev mode');
  return path.join(root, '.local', 'hzl');
}

function getDevConfigDir(): string {
  const root = getRepoRoot();
  if (!root) throw new Error('Not in dev mode');
  return path.join(root, '.config', 'hzl');
}

// XDG Base Directory paths (with fallbacks per spec)
// On Windows, use native paths: LOCALAPPDATA for data, APPDATA for config
function getXdgDataHome(): string {
  if (process.platform === 'win32') {
    // Windows: use LOCALAPPDATA (typically C:\Users\<user>\AppData\Local)
    return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  }
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
}

function getXdgConfigHome(): string {
  if (process.platform === 'win32') {
    // Windows: use APPDATA (typically C:\Users\<user>\AppData\Roaming)
    return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  }
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

export function getDefaultDbPath(): string {
  // Running from source repo? Use project-local storage
  if (isDevMode()) {
    return path.join(getDevDataDir(), 'events.db');
  }
  return path.join(getXdgDataHome(), 'hzl', 'events.db');
}

export function getConfigPath(): string {
  if (process.env.HZL_CONFIG) {
    return enforceDevConfigIsolation(process.env.HZL_CONFIG, 'env');
  }
  // Running from source repo? Use project-local storage
  if (isDevMode()) {
    return path.join(getDevConfigDir(), 'config.json');
  }
  return path.join(getXdgConfigHome(), 'hzl', 'config.json');
}

function expandTilde(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

/**
 * Derive cache database path from events database path.
 * For events.db, returns cache.db in the same directory.
 * For other paths, appends -cache suffix.
 */
export function deriveCachePath(eventsPath: string): string {
  // Standard case: events.db -> cache.db
  if (eventsPath.endsWith('/events.db') || eventsPath.endsWith('\\events.db')) {
    return eventsPath.replace(/events\.db$/, 'cache.db');
  }
  // Generic case: append -cache suffix
  if (eventsPath.endsWith('.db')) {
    return eventsPath.replace(/\.db$/, '-cache.db');
  }
  // No .db suffix: append -cache.db
  return `${eventsPath}-cache.db`;
}

export type DbPathSource = 'cli' | 'env' | 'config' | 'default' | 'dev';

export interface ResolvedDbPaths {
  eventsDbPath: string;
  cacheDbPath: string;
}

export interface ResolvedDbPathsWithSource extends ResolvedDbPaths {
  source: DbPathSource;
}

function normalizeForCompare(filePath: string): string {
  const resolved = path.resolve(expandTilde(filePath));
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isPathWithinRoot(filePath: string, rootPath: string): boolean {
  const candidate = normalizeForCompare(filePath);
  const root = normalizeForCompare(rootPath);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function enforceDevConfigIsolation(configPath: string, source: 'env' | 'default'): string {
  if (!isDevMode()) return configPath;
  if (process.env.HZL_ALLOW_PROD_CONFIG === '1') return configPath;

  const productionConfigRoot = path.join(getXdgConfigHome(), 'hzl');
  if (isPathWithinRoot(configPath, productionConfigRoot)) {
    throw new Error(
      `Refusing to use production config path in dev mode (source: ${source}). ` +
      `Use repo-local .config/hzl/config.json, set HZL_DEV_MODE=0 to disable dev mode, ` +
      `or set HZL_ALLOW_PROD_CONFIG=1 to override intentionally.`
    );
  }

  return configPath;
}

function enforceDevDbIsolation(paths: ResolvedDbPathsWithSource): ResolvedDbPathsWithSource {
  if (!isDevMode()) return paths;
  if (process.env.HZL_ALLOW_PROD_DB === '1') return paths;

  const productionDbRoot = path.join(getXdgDataHome(), 'hzl');
  const eventsInProd = isPathWithinRoot(paths.eventsDbPath, productionDbRoot);
  const cacheInProd = isPathWithinRoot(paths.cacheDbPath, productionDbRoot);

  if (eventsInProd || cacheInProd) {
    throw new Error(
      `Refusing to use production DB path in dev mode (source: ${paths.source}). ` +
      `Use repo-local .local/hzl paths, set HZL_DEV_MODE=0 to disable dev mode, ` +
      `or set HZL_ALLOW_PROD_DB=1 to override intentionally.`
    );
  }

  return paths;
}

export function resolveDbPathsWithSource(cliOption?: string, configPath: string = getConfigPath()): ResolvedDbPathsWithSource {
  // CLI option overrides everything
  if (cliOption) {
    const expanded = expandTilde(cliOption);
    return enforceDevDbIsolation({
      eventsDbPath: expanded,
      cacheDbPath: deriveCachePath(expanded),
      source: 'cli',
    });
  }

  // Environment variables
  if (process.env.HZL_DB_EVENTS_PATH) {
    const eventsPath = expandTilde(process.env.HZL_DB_EVENTS_PATH);
    return enforceDevDbIsolation({
      eventsDbPath: eventsPath,
      cacheDbPath: expandTilde(process.env.HZL_DB_CACHE_PATH ?? deriveCachePath(eventsPath)),
      source: 'env',
    });
  }

  // Legacy HZL_DB env var
  if (process.env.HZL_DB) {
    const expanded = expandTilde(process.env.HZL_DB);
    return enforceDevDbIsolation({
      eventsDbPath: expanded,
      cacheDbPath: deriveCachePath(expanded),
      source: 'env',
    });
  }

  // Config file
  const config = readConfig(configPath);

  // New nested structure
  if (config.db?.events?.path) {
    const eventsPath = expandTilde(config.db.events.path);
    return enforceDevDbIsolation({
      eventsDbPath: eventsPath,
      cacheDbPath: expandTilde(config.db.cache?.path ?? deriveCachePath(eventsPath)),
      source: 'config',
    });
  }

  // Legacy dbPath
  if (config.dbPath) {
    const expanded = expandTilde(config.dbPath);
    return enforceDevDbIsolation({
      eventsDbPath: expanded,
      cacheDbPath: deriveCachePath(expanded),
      source: 'config',
    });
  }

  // Default
  const defaultEventsPath = getDefaultDbPath();
  return enforceDevDbIsolation({
    eventsDbPath: defaultEventsPath,
    cacheDbPath: deriveCachePath(defaultEventsPath),
    source: isDevMode() ? 'dev' : 'default',
  });
}

export function resolveDbPaths(cliOption?: string, configPath: string = getConfigPath()): ResolvedDbPaths {
  const { eventsDbPath, cacheDbPath } = resolveDbPathsWithSource(cliOption, configPath);
  return { eventsDbPath, cacheDbPath };
}

export function readConfig(configPath: string = getConfigPath()): Config {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  try {
    const parsed: unknown = JSON.parse(content);
    const result = ConfigFileSchema.safeParse(parsed);
    if (!result.success) {
      return {};
    }

    return result.data;
  } catch {
    throw new Error(`Config file at ${configPath} is invalid JSON`);
  }
}

export function ensureDbDirectory(dbPath: string): void {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function writeConfig(updates: Partial<Config>, configPath: string = getConfigPath()): void {
  // Ensure directory exists
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      throw new Error(`Cannot write config file - directory creation failed: ${dir}`);
    }
  }

  // Load existing config or start fresh
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      existing = isRecord(parsed) ? parsed : {};
    } catch {
      // If existing config is invalid, start fresh
      existing = {};
    }
  }

  // Merge and write atomically using temp file + rename
  // This prevents partial writes and reduces race condition window
  const merged = { ...existing, ...updates };
  const tempPath = `${configPath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(merged, null, 2) + '\n');
    fs.renameSync(tempPath, configPath);
  } catch {
    // Clean up temp file if it exists
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw new Error(`Cannot write config file - your database preference won't persist`);
  }
}

/**
 * Check if config file permissions are secure.
 * Returns warning message if permissions are too permissive.
 */
export function checkConfigPermissions(configPath: string): string | null {
  if (process.platform === 'win32') {
    return null; // Skip on Windows
  }

  try {
    const stats = fs.statSync(configPath);
    const mode = stats.mode & 0o777;

    if (mode & 0o077) {
      return `Config file at ${configPath} is readable by other users (mode: ${mode.toString(8)}). ` +
        `Consider running: chmod 600 "${configPath}"`;
    }
  } catch {
    // File doesn't exist
  }
  return null;
}
