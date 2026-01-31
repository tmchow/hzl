# Config File Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `hzl init --db /custom/path` persist the database location so subsequent commands use it automatically.

**Architecture:** Extend existing config infrastructure in `config.ts`. Add `--force` flag and config conflict detection to `hzl init`. Add `hzl config` command for debugging. Add `HZL_CONFIG` env var support.

**Tech Stack:** TypeScript, Commander.js, Vitest, Zod

**Note:** The codebase already uses `dbPath` as the config key (not `db` as in the design doc). We'll stick with `dbPath` for consistency.

---

## Task 1: Add HZL_CONFIG Environment Variable Support

**Files:**
- Modify: `packages/hzl-cli/src/config.ts:19-21`
- Test: `packages/hzl-cli/src/config.test.ts`

**Step 1: Write the failing test**

Add to `config.test.ts`:

```typescript
import { getConfigPath } from './config.js';

describe('getConfigPath', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.HZL_CONFIG;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns HZL_CONFIG env var when set', () => {
    process.env.HZL_CONFIG = '/custom/config.json';
    expect(getConfigPath()).toBe('/custom/config.json');
  });

  it('returns default path when HZL_CONFIG not set', () => {
    expect(getConfigPath()).toContain('.hzl/config.json');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-cli -- src/config.test.ts`
Expected: FAIL - first test fails because `getConfigPath` ignores env var

**Step 3: Write minimal implementation**

Update `getConfigPath()` in `config.ts`:

```typescript
export function getConfigPath(): string {
  if (process.env.HZL_CONFIG) return process.env.HZL_CONFIG;
  return path.join(os.homedir(), '.hzl', 'config.json');
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-cli -- src/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/config.ts packages/hzl-cli/src/config.test.ts
git commit -m "feat: add HZL_CONFIG env var support"
```

---

## Task 2: Add Config Write Function with Error Handling

**Files:**
- Modify: `packages/hzl-cli/src/config.ts`
- Test: `packages/hzl-cli/src/config.test.ts`

**Step 1: Write the failing tests**

Add to `config.test.ts`:

```typescript
import { writeConfig } from './config.js';

describe('writeConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates config file with dbPath', () => {
    const configPath = path.join(tempDir, 'config.json');
    writeConfig({ dbPath: '/my/db.sqlite' }, configPath);

    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(content.dbPath).toBe('/my/db.sqlite');
  });

  it('creates parent directory if needed', () => {
    const configPath = path.join(tempDir, 'subdir', 'config.json');
    writeConfig({ dbPath: '/my/db.sqlite' }, configPath);

    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('merges with existing config', () => {
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ otherKey: 'value' }));

    writeConfig({ dbPath: '/my/db.sqlite' }, configPath);

    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(content.dbPath).toBe('/my/db.sqlite');
    expect(content.otherKey).toBe('value');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-cli -- src/config.test.ts`
Expected: FAIL - `writeConfig` doesn't exist

**Step 3: Write minimal implementation**

Add to `config.ts`:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-cli -- src/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/config.ts packages/hzl-cli/src/config.test.ts
git commit -m "feat: add writeConfig function with error handling"
```

---

## Task 3: Add Config Read Function with Strict Error Handling

**Files:**
- Modify: `packages/hzl-cli/src/config.ts`
- Test: `packages/hzl-cli/src/config.test.ts`

The existing `resolveDbPath` silently ignores invalid JSON. Per the design, we should error loudly.

**Step 1: Write the failing tests**

Add to `config.test.ts`:

```typescript
import { readConfig } from './config.js';

describe('readConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-readconfig-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty config when file does not exist', () => {
    const configPath = path.join(tempDir, 'nonexistent.json');
    const config = readConfig(configPath);
    expect(config).toEqual({});
  });

  it('returns parsed config when file exists', () => {
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ dbPath: '/my/db.sqlite' }));

    const config = readConfig(configPath);
    expect(config.dbPath).toBe('/my/db.sqlite');
  });

  it('throws on invalid JSON', () => {
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, 'not valid json {{{');

    expect(() => readConfig(configPath))
      .toThrow(`Config file at ${configPath} is invalid JSON`);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-cli -- src/config.test.ts`
Expected: FAIL - `readConfig` doesn't exist

**Step 3: Write minimal implementation**

Add to `config.ts`:

```typescript
export function readConfig(configPath: string = getConfigPath()): Config {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  try {
    const parsed = JSON.parse(content);
    const result = ConfigFileSchema.safeParse(parsed);
    return result.success ? result.data : {};
  } catch {
    throw new Error(`Config file at ${configPath} is invalid JSON`);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-cli -- src/config.test.ts`
Expected: PASS

**Step 5: Update resolveDbPath to use readConfig**

Update `resolveDbPath` in `config.ts` to use the new strict `readConfig`:

```typescript
export function resolveDbPath(cliOption?: string, configPath: string = getConfigPath()): string {
  if (cliOption) return expandTilde(cliOption);
  if (process.env.HZL_DB) return expandTilde(process.env.HZL_DB);

  const config = readConfig(configPath);
  if (config.dbPath) return expandTilde(config.dbPath);

  return getDefaultDbPath();
}
```

**Step 6: Run all tests**

Run: `npm test -w hzl-cli`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/hzl-cli/src/config.ts packages/hzl-cli/src/config.test.ts
git commit -m "feat: add readConfig with strict JSON error handling"
```

---

## Task 4: Update hzl init to Write Config File

**Files:**
- Modify: `packages/hzl-cli/src/commands/init.ts`
- Create: `packages/hzl-cli/src/commands/init.test.ts`

**Step 1: Write the failing tests**

Create `packages/hzl-cli/src/commands/init.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runInit } from './init.js';

describe('runInit', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-init-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes config file with dbPath after init', async () => {
    const dbPath = path.join(tempDir, 'data.db');
    const configPath = path.join(tempDir, 'config.json');

    await runInit({ dbPath, json: true, configPath });

    expect(fs.existsSync(configPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.dbPath).toBe(dbPath);
  });

  it('allows re-init with same path (idempotent)', async () => {
    const dbPath = path.join(tempDir, 'data.db');
    const configPath = path.join(tempDir, 'config.json');

    await runInit({ dbPath, json: true, configPath });
    await runInit({ dbPath, json: true, configPath }); // Second init

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.dbPath).toBe(dbPath);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-cli -- src/commands/init.test.ts`
Expected: FAIL - `runInit` doesn't accept `configPath` and doesn't write config

**Step 3: Update runInit to write config**

Update `init.ts`:

```typescript
import { Command } from 'commander';
import fs from 'fs';
import { resolveDbPath, ensureDbDirectory, writeConfig, getConfigPath } from '../config.js';
import type { GlobalOptions } from '../types.js';

export interface InitResult {
  path: string;
  created: boolean;
}

export interface InitOptions {
  dbPath: string;
  json: boolean;
  configPath?: string;
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const { dbPath, json, configPath = getConfigPath() } = options;
  const existed = fs.existsSync(dbPath);

  // Ensure the directory exists
  ensureDbDirectory(dbPath);

  // Dynamic import to avoid test resolution issues
  const { initializeDb, closeDb } = await import('../db.js');

  // Initialize DB which handles migrations
  const services = initializeDb(dbPath);
  closeDb(services);

  // Write config file
  writeConfig({ dbPath }, configPath);

  const result: InitResult = { path: dbPath, created: !existed };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    const message = result.created
      ? `Initialized new database at ${result.path}`
      : `Database already exists at ${result.path}`;
    console.log(`✓ ${message}`);
  }

  return result;
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize a new HZL database')
    .action(async function (this: Command) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      await runInit({
        dbPath: resolveDbPath(globalOpts.db),
        json: globalOpts.json ?? false,
      });
    });
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-cli -- src/commands/init.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/commands/init.ts packages/hzl-cli/src/commands/init.test.ts
git commit -m "feat: hzl init writes config file with dbPath"
```

---

## Task 5: Add --force Flag and Config Conflict Detection

**Files:**
- Modify: `packages/hzl-cli/src/commands/init.ts`
- Test: `packages/hzl-cli/src/commands/init.test.ts`

**Step 1: Write the failing tests**

Add to `init.test.ts`:

```typescript
it('errors when config points to different path without --force', async () => {
  const dbPath = path.join(tempDir, 'new.db');
  const configPath = path.join(tempDir, 'config.json');

  // Pre-existing config pointing elsewhere
  fs.writeFileSync(configPath, JSON.stringify({ dbPath: '/other/path.db' }));

  await expect(runInit({ dbPath, json: true, configPath }))
    .rejects.toThrow('Config already exists pointing to /other/path.db');
});

it('overwrites config when --force is used', async () => {
  const dbPath = path.join(tempDir, 'new.db');
  const configPath = path.join(tempDir, 'config.json');

  // Pre-existing config pointing elsewhere
  fs.writeFileSync(configPath, JSON.stringify({ dbPath: '/other/path.db' }));

  await runInit({ dbPath, json: true, configPath, force: true });

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  expect(config.dbPath).toBe(dbPath);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-cli -- src/commands/init.test.ts`
Expected: FAIL - no conflict detection

**Step 3: Update runInit with conflict detection**

Update `init.ts`:

```typescript
import { Command } from 'commander';
import fs from 'fs';
import { resolveDbPath, ensureDbDirectory, writeConfig, readConfig, getConfigPath } from '../config.js';
import type { GlobalOptions } from '../types.js';

export interface InitResult {
  path: string;
  created: boolean;
}

export interface InitOptions {
  dbPath: string;
  json: boolean;
  configPath?: string;
  force?: boolean;
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const { dbPath, json, configPath = getConfigPath(), force = false } = options;

  // Check for config conflict
  const existingConfig = readConfig(configPath);
  if (existingConfig.dbPath && existingConfig.dbPath !== dbPath && !force) {
    throw new Error(
      `Config already exists pointing to ${existingConfig.dbPath}\n` +
      `Use --force to reinitialize with a different database`
    );
  }

  const existed = fs.existsSync(dbPath);

  // Ensure the directory exists
  ensureDbDirectory(dbPath);

  // Dynamic import to avoid test resolution issues
  const { initializeDb, closeDb } = await import('../db.js');

  // Initialize DB which handles migrations
  const services = initializeDb(dbPath);
  closeDb(services);

  // Write config file
  writeConfig({ dbPath }, configPath);

  const result: InitResult = { path: dbPath, created: !existed };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    const message = result.created
      ? `Initialized new database at ${result.path}`
      : `Database already exists at ${result.path}`;
    console.log(`✓ ${message}`);
  }

  return result;
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize a new HZL database')
    .option('-f, --force', 'Force reinitialize even if config points elsewhere')
    .action(async function (this: Command) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      const opts = this.opts();
      await runInit({
        dbPath: resolveDbPath(globalOpts.db),
        json: globalOpts.json ?? false,
        force: opts.force ?? false,
      });
    });
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-cli -- src/commands/init.test.ts`
Expected: PASS

**Step 5: Run all tests**

Run: `npm test -w hzl-cli`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/hzl-cli/src/commands/init.ts packages/hzl-cli/src/commands/init.test.ts
git commit -m "feat: add --force flag and config conflict detection to init"
```

---

## Task 6: Add hzl config Command

**Files:**
- Create: `packages/hzl-cli/src/commands/config.ts`
- Create: `packages/hzl-cli/src/commands/config.test.ts`
- Modify: `packages/hzl-cli/src/index.ts`

**Step 1: Write the failing tests**

Create `packages/hzl-cli/src/commands/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runConfig } from './config.js';

describe('runConfig', () => {
  const originalEnv = process.env;
  let tempDir: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.HZL_DB;
    delete process.env.HZL_CONFIG;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-config-cmd-test-'));
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('shows db path from config file', () => {
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ dbPath: '/my/db.sqlite' }));

    const result = runConfig({ cliPath: undefined, json: true, configPath });

    expect(result.db.value).toBe('/my/db.sqlite');
    expect(result.db.source).toBe('config');
  });

  it('shows db path from CLI flag', () => {
    const configPath = path.join(tempDir, 'config.json');

    const result = runConfig({ cliPath: '/cli/db.sqlite', json: true, configPath });

    expect(result.db.value).toBe('/cli/db.sqlite');
    expect(result.db.source).toBe('cli');
  });

  it('shows db path from env var', () => {
    const configPath = path.join(tempDir, 'config.json');
    process.env.HZL_DB = '/env/db.sqlite';

    const result = runConfig({ cliPath: undefined, json: true, configPath });

    expect(result.db.value).toBe('/env/db.sqlite');
    expect(result.db.source).toBe('env');
  });

  it('shows default when nothing configured', () => {
    const configPath = path.join(tempDir, 'nonexistent.json');

    const result = runConfig({ cliPath: undefined, json: true, configPath });

    expect(result.db.value).toContain('.hzl/data.db');
    expect(result.db.source).toBe('default');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w hzl-cli -- src/commands/config.test.ts`
Expected: FAIL - file doesn't exist

**Step 3: Create config command**

Create `packages/hzl-cli/src/commands/config.ts`:

```typescript
import { Command } from 'commander';
import { readConfig, getDefaultDbPath, getConfigPath } from '../config.js';
import type { GlobalOptions } from '../types.js';

export interface ConfigResult {
  db: {
    value: string;
    source: 'cli' | 'env' | 'config' | 'default';
  };
}

export interface ConfigOptions {
  cliPath?: string;
  json: boolean;
  configPath?: string;
}

export function runConfig(options: ConfigOptions): ConfigResult {
  const { cliPath, json, configPath = getConfigPath() } = options;

  // Determine db source and value
  let dbSource: ConfigResult['db']['source'];
  let dbValue: string;

  if (cliPath) {
    dbSource = 'cli';
    dbValue = cliPath;
  } else if (process.env.HZL_DB) {
    dbSource = 'env';
    dbValue = process.env.HZL_DB;
  } else {
    const config = readConfig(configPath);
    if (config.dbPath) {
      dbSource = 'config';
      dbValue = config.dbPath;
    } else {
      dbSource = 'default';
      dbValue = getDefaultDbPath();
    }
  }

  const result: ConfigResult = {
    db: { value: dbValue, source: dbSource },
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`db: ${dbValue} (from ${dbSource})`);
  }

  return result;
}

export function createConfigCommand(): Command {
  return new Command('config')
    .description('Show current configuration')
    .action(function (this: Command) {
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      runConfig({
        cliPath: globalOpts.db,
        json: globalOpts.json ?? false,
      });
    });
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w hzl-cli -- src/commands/config.test.ts`
Expected: PASS

**Step 5: Register command in index.ts**

Add import at top of `index.ts`:

```typescript
import { createConfigCommand } from './commands/config.js';
```

Add after `createWhichDbCommand()` line:

```typescript
program.addCommand(createConfigCommand());
```

**Step 6: Run all tests**

Run: `npm test -w hzl-cli`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/hzl-cli/src/commands/config.ts packages/hzl-cli/src/commands/config.test.ts packages/hzl-cli/src/index.ts
git commit -m "feat: add hzl config command"
```

---

## Task 7: Integration Test

**Files:**
- Create: `packages/hzl-cli/src/__tests__/integration/config.test.ts`

**Step 1: Write integration test**

Create `packages/hzl-cli/src/__tests__/integration/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createTestContext, hzl, hzlJson, type TestContext } from './helpers.js';

describe('config integration', () => {
  let ctx: TestContext;
  let configPath: string;

  beforeEach(() => {
    ctx = createTestContext();
    configPath = path.join(ctx.tempDir, 'config.json');
  });

  afterEach(() => {
    ctx.cleanup();
  });

  // Helper that sets HZL_CONFIG for this test
  function hzlWithConfig(args: string): string {
    const originalConfig = process.env.HZL_CONFIG;
    process.env.HZL_CONFIG = configPath;
    try {
      return hzl(ctx, args);
    } finally {
      if (originalConfig) {
        process.env.HZL_CONFIG = originalConfig;
      } else {
        delete process.env.HZL_CONFIG;
      }
    }
  }

  function hzlJsonWithConfig<T>(args: string): T {
    const originalConfig = process.env.HZL_CONFIG;
    process.env.HZL_CONFIG = configPath;
    try {
      return hzlJson<T>(ctx, args);
    } finally {
      if (originalConfig) {
        process.env.HZL_CONFIG = originalConfig;
      } else {
        delete process.env.HZL_CONFIG;
      }
    }
  }

  it('init creates config, subsequent commands use it', () => {
    // Init with the test context db path
    hzlWithConfig('init');

    // Config should show the db path from config
    const config = hzlJsonWithConfig<{ db: { value: string; source: string } }>('config');
    expect(config.db.source).toBe('config');
    expect(config.db.value).toBe(ctx.dbPath);
  });
});
```

**Step 2: Build and run test**

Run: `npm run build && npm test -w hzl-cli -- src/__tests__/integration/config.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/hzl-cli/src/__tests__/integration/config.test.ts
git commit -m "test: add config integration test"
```

---

## Task 8: Update Documentation

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

**Step 1: Update README.md**

Find the Environment Variables section and update it:

```markdown
### Configuration

HZL stores configuration in `~/.hzl/config.json`. The config file is created automatically when you run `hzl init`.

To use a custom database location:

```bash
hzl init --db ~/my-project/tasks.db
```

Subsequent commands will automatically use this database.

**Config resolution order (highest to lowest priority):**
1. `--db` flag
2. `HZL_DB` environment variable
3. `~/.hzl/config.json`
4. Default: `~/.hzl/data.db`

| Variable | Description |
|----------|-------------|
| `HZL_DB` | Override database location |
| `HZL_CONFIG` | Override config file location (default: `~/.hzl/config.json`) |
```

**Step 2: Update AGENTS.md**

Update the "Database Location" section:

```markdown
## Database Location

Default: `~/.hzl/data.db`. Config stored in `~/.hzl/config.json`.

Resolution order: `--db` flag → `HZL_DB` env → config file → default.

Override with `HZL_DB` env var, `--db` flag, or `hzl init --db /path`.
```

**Step 3: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: document config file and HZL_CONFIG env var"
```

---

## Summary

After completing all tasks:

1. `HZL_CONFIG` env var support added
2. `writeConfig` function with error handling
3. `readConfig` function with strict JSON error handling
4. `hzl init` writes config file
5. `hzl init --force` for config conflicts
6. `hzl config` command for debugging
7. Integration test verifying end-to-end flow
8. Documentation updated

Run full test suite: `npm test`
