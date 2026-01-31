// packages/hzl-cli/src/config.ts
import fs from 'fs';
import path from 'path';
import os from 'os';
import { z } from 'zod';
import type { Config } from './types.js';

const ConfigFileSchema = z.object({
  dbPath: z.string().optional(),
  defaultProject: z.string().optional(),
  defaultAuthor: z.string().optional(),
  leaseMinutes: z.number().positive().optional(),
}).partial();

export function getDefaultDbPath(): string {
  return path.join(os.homedir(), '.hzl', 'data.db');
}

export function getConfigPath(): string {
  if (process.env.HZL_CONFIG) return process.env.HZL_CONFIG;
  return path.join(os.homedir(), '.hzl', 'config.json');
}

function expandTilde(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

export function resolveDbPath(cliOption?: string, configPath: string = getConfigPath()): string {
  if (cliOption) return expandTilde(cliOption);
  if (process.env.HZL_DB) return expandTilde(process.env.HZL_DB);

  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);
      if (config.dbPath) return expandTilde(config.dbPath);
    }
  } catch { /* ignore */ }

  return getDefaultDbPath();
}

export async function loadConfig(configPath: string = getConfigPath()): Promise<Config> {
  try {
    if (!fs.existsSync(configPath)) return {};
    const content = await fs.promises.readFile(configPath, 'utf-8');
    const result = ConfigFileSchema.safeParse(JSON.parse(content));
    return result.success ? result.data : {};
  } catch { return {}; }
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
      existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      // If existing config is invalid, start fresh
      existing = {};
    }
  }

  // Merge and write
  const merged = { ...existing, ...updates };
  try {
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n');
  } catch {
    throw new Error(`Cannot write config file - your database preference won't persist`);
  }
}
