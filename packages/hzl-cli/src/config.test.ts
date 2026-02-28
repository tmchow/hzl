import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getConfigPath, isDevMode, readConfig, resolveDbPaths } from './config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('nested db config', () => {
  const testDir = path.join(os.tmpdir(), `config-test-${Date.now()}`);
  const xdgDataHome = process.platform === 'win32'
    ? (process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'))
    : (process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'));
  const xdgConfigHome = process.platform === 'win32'
    ? (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
    : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    delete process.env.HZL_DB;
    delete process.env.HZL_ALLOW_PROD_DB;
    delete process.env.HZL_CONFIG;
    delete process.env.HZL_ALLOW_PROD_CONFIG;
    delete process.env.HZL_DEV_MODE;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('reads nested events path', () => {
    const configPath = path.join(testDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      db: {
        events: { path: '/custom/events.db' },
        cache: { path: '/custom/cache.db' },
      }
    }));

    const paths = resolveDbPaths(undefined, configPath);
    expect(paths.eventsDbPath).toBe('/custom/events.db');
    expect(paths.cacheDbPath).toBe('/custom/cache.db');
  });

  it('supports legacy dbPath for backward compatibility', () => {
    const configPath = path.join(testDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      dbPath: '/legacy/data.db'
    }));

    const paths = resolveDbPaths(undefined, configPath);
    expect(paths.eventsDbPath).toBe('/legacy/data.db');
    expect(paths.cacheDbPath).toBe('/legacy/data-cache.db');
  });

  it('cli option overrides config', () => {
    const configPath = path.join(testDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      db: { events: { path: '/custom/events.db' } }
    }));

    const paths = resolveDbPaths('/cli/override.db', configPath);
    expect(paths.eventsDbPath).toBe('/cli/override.db');
  });

  it('reads claimStaggerMs from config', () => {
    const configPath = path.join(testDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      claimStaggerMs: 750
    }));

    const config = readConfig(configPath);
    expect(config.claimStaggerMs).toBe(750);
  });

  it('blocks production XDG DB paths while in dev mode', () => {
    const prodPath = path.join(xdgDataHome, 'hzl', 'events.db');
    process.env.HZL_DB = prodPath;

    if (!isDevMode()) {
      expect(() => resolveDbPaths(undefined, path.join(testDir, 'config.json'))).not.toThrow();
      return;
    }

    expect(() => resolveDbPaths(undefined, path.join(testDir, 'config.json'))).toThrow(
      /Refusing to use production DB path in dev mode/
    );
  });

  it('allows production XDG DB paths with explicit override', () => {
    const prodPath = path.join(xdgDataHome, 'hzl', 'events.db');
    process.env.HZL_DB = prodPath;
    process.env.HZL_ALLOW_PROD_DB = '1';

    const paths = resolveDbPaths(undefined, path.join(testDir, 'config.json'));
    expect(paths.eventsDbPath).toBe(prodPath);
  });

  it('blocks production XDG config path while in dev mode', () => {
    const prodConfigPath = path.join(xdgConfigHome, 'hzl', 'config.json');
    process.env.HZL_CONFIG = prodConfigPath;

    if (!isDevMode()) {
      expect(getConfigPath()).toBe(prodConfigPath);
      return;
    }

    expect(() => getConfigPath()).toThrow(/Refusing to use production config path in dev mode/);
  });

  it('allows production XDG config path with explicit override', () => {
    const prodConfigPath = path.join(xdgConfigHome, 'hzl', 'config.json');
    process.env.HZL_CONFIG = prodConfigPath;
    process.env.HZL_ALLOW_PROD_CONFIG = '1';

    expect(getConfigPath()).toBe(prodConfigPath);
  });
});
