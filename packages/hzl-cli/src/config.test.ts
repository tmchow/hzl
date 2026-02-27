import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readConfig, resolveDbPaths } from './config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('nested db config', () => {
  const testDir = path.join(os.tmpdir(), `config-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
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
});
