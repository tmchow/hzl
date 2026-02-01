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
  defaultProject: z.string().optional(),
  defaultAuthor: z.string().optional(),
  leaseMinutes: z.number().positive().optional(),
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
    return path.join(getDevDataDir(), 'data.db');
  }
  return path.join(getXdgDataHome(), 'hzl', 'data.db');
}

export function getConfigPath(): string {
  if (process.env.HZL_CONFIG) return process.env.HZL_CONFIG;
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
 * Handles paths with and without .db extension.
 */
function deriveCachePath(eventsPath: string): string {
  if (eventsPath.endsWith('.db')) {
    return eventsPath.replace(/\.db$/, '-cache.db');
  }
  // No .db suffix: append -cache.db
  return `${eventsPath}-cache.db`;
}

export type DbPathSource = 'cli' | 'env' | 'config' | 'default' | 'dev';

export interface ResolvedDbPath {
  path: string;
  source: DbPathSource;
}

export function resolveDbPathWithSource(cliOption?: string, configPath: string = getConfigPath()): ResolvedDbPath {
  if (cliOption) return { path: expandTilde(cliOption), source: 'cli' };
  if (process.env.HZL_DB) return { path: expandTilde(process.env.HZL_DB), source: 'env' };

  const config = readConfig(configPath);
  if (config.dbPath) return { path: expandTilde(config.dbPath), source: 'config' };

  // Dev mode returns 'dev' source, otherwise 'default'
  return { path: getDefaultDbPath(), source: isDevMode() ? 'dev' : 'default' };
}

export function resolveDbPath(cliOption?: string, configPath: string = getConfigPath()): string {
  return resolveDbPathWithSource(cliOption, configPath).path;
}

export interface ResolvedDbPaths {
  eventsDbPath: string;
  cacheDbPath: string;
}

export function resolveDbPaths(cliOption?: string, configPath: string = getConfigPath()): ResolvedDbPaths {
  // CLI option overrides everything
  if (cliOption) {
    const expanded = expandTilde(cliOption);
    return {
      eventsDbPath: expanded,
      cacheDbPath: deriveCachePath(expanded),
    };
  }

  // Environment variables
  if (process.env.HZL_DB_EVENTS_PATH) {
    const eventsPath = expandTilde(process.env.HZL_DB_EVENTS_PATH);
    return {
      eventsDbPath: eventsPath,
      cacheDbPath: expandTilde(process.env.HZL_DB_CACHE_PATH ?? deriveCachePath(eventsPath)),
    };
  }

  // Legacy HZL_DB env var
  if (process.env.HZL_DB) {
    const expanded = expandTilde(process.env.HZL_DB);
    return {
      eventsDbPath: expanded,
      cacheDbPath: deriveCachePath(expanded),
    };
  }

  // Config file
  const config = readConfig(configPath);

  // New nested structure
  if (config.db?.events?.path) {
    const eventsPath = expandTilde(config.db.events.path);
    return {
      eventsDbPath: eventsPath,
      cacheDbPath: expandTilde(config.db.cache?.path ?? deriveCachePath(eventsPath)),
    };
  }

  // Legacy dbPath
  if (config.dbPath) {
    const expanded = expandTilde(config.dbPath);
    return {
      eventsDbPath: expanded,
      cacheDbPath: deriveCachePath(expanded),
    };
  }

  // Default
  const defaultEventsPath = getDefaultDbPath();
  return {
    eventsDbPath: defaultEventsPath,
    cacheDbPath: deriveCachePath(defaultEventsPath),
  };
}

export function readConfig(configPath: string = getConfigPath()): Config {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  try {
    const parsed: unknown = JSON.parse(content);
    const result = ConfigFileSchema.safeParse(parsed);
    return result.success ? result.data : {};
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
