import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '../../..');
const cliPath = path.resolve(__dirname, '../../../dist/cli.js');

interface TestContext {
  tempDir: string;
  dbPath: string;
  configPath: string;
  cleanup: () => void;
}

function createTestContext(): TestContext {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-config-test-'));
  const dbPath = path.join(tempDir, 'test.db');
  const configPath = path.join(tempDir, 'config.json');
  return {
    tempDir,
    dbPath,
    configPath,
    cleanup: () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

describe('config integration', () => {
  let ctx: TestContext;

  beforeAll(() => {
    execSync('npm run build', { cwd: packageRoot, stdio: 'inherit' });
  });

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  // Helper that runs CLI with HZL_CONFIG set but without --db flag
  // This allows the config file to be the source of db path
  function hzlWithConfigOnly(args: string): string {
    const cmd = `node "${cliPath}" ${args}`;
    const result = execSync(cmd, {
      encoding: 'utf-8',
      env: { ...process.env, HZL_CONFIG: ctx.configPath, HZL_DB: undefined },
    });
    return (result as string).trim();
  }

  function hzlJsonWithConfigOnly<T>(args: string): T {
    const output = hzlWithConfigOnly(`${args} --json`);
    return JSON.parse(output) as T;
  }

  // Helper that runs CLI with --db flag (uses ctx.dbPath explicitly)
  function hzlWithDb(args: string): string {
    const cmd = `node "${cliPath}" --db "${ctx.dbPath}" ${args}`;
    const result = execSync(cmd, {
      encoding: 'utf-8',
      env: { ...process.env, HZL_CONFIG: ctx.configPath, HZL_DB: undefined },
    });
    return (result as string).trim();
  }

  function hzlJsonWithDb<T>(args: string): T {
    const output = hzlWithDb(`${args} --json`);
    return JSON.parse(output) as T;
  }

  it('init creates config, subsequent commands use it', () => {
    // Init with --db flag to specify the database path
    const initResult = hzlJsonWithDb<{ eventsDbPath: string; created: boolean }>('init');
    expect(initResult.created).toBe(true);
    expect(initResult.eventsDbPath).toBe(ctx.dbPath);

    // Verify config file was created
    expect(fs.existsSync(ctx.configPath)).toBe(true);

    // Now run config WITHOUT --db flag - should read from config file
    const config = hzlJsonWithConfigOnly<{ db: { value: string; source: string } }>('config');
    expect(config.db.source).toBe('config');
    expect(config.db.value).toBe(ctx.dbPath);
  });

  it('config shows cli source when --db flag is used', () => {
    // Init first
    hzlJsonWithDb<{ eventsDbPath: string; created: boolean }>('init');

    // Config with --db flag should show 'cli' as source
    const config = hzlJsonWithDb<{ db: { value: string; source: string } }>('config');
    expect(config.db.source).toBe('cli');
    expect(config.db.value).toBe(ctx.dbPath);
  });

  it('config shows default when no config file exists', () => {
    // Don't init - just check config with no config file
    // Disable dev mode to test production behavior
    const cmd = `node "${cliPath}" config --json`;
    const result = execSync(cmd, {
      encoding: 'utf-8',
      env: { ...process.env, HZL_CONFIG: ctx.configPath, HZL_DB: undefined, HZL_DEV_MODE: '0' },
    });
    const config = JSON.parse(result.trim()) as { db: { value: string; source: string } };
    expect(config.db.source).toBe('default');
    // Platform-aware assertion: Windows uses AppData\Local, Unix uses .local/share
    if (process.platform === 'win32') {
      expect(config.db.value).toMatch(/AppData[/\\]Local[/\\]hzl/);
    } else {
      expect(config.db.value).toContain('.local/share/hzl');
    }
  });
});
