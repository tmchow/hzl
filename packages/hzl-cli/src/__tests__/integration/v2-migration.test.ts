import { beforeAll, describe, expect, it, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestContext, hzlMayFail, type TestContext } from './helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '../../..');

beforeAll(() => {
  execSync('npm run build', { cwd: packageRoot, stdio: 'inherit' });
}, 120_000);

describe('v2 migration surfaces', { timeout: 30000 }, () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('returns migration hint for task next', () => {
    const result = hzlMayFail(ctx, 'task next');
    expect(result.success).toBe(false);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('command_removed');
    expect(payload.error.details.replacement).toBe('hzl task claim --next');
  });

  it('returns migration hint for removed --json flag', () => {
    const result = hzlMayFail(ctx, 'task list --json');
    expect(result.success).toBe(false);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('flag_removed');
    expect(payload.error.details.replacement).toContain('--format md');
  });

  it('returns migration hint for renamed --assignee flag', () => {
    const result = hzlMayFail(ctx, 'task claim TASK123 --assignee agent-1');
    expect(result.success).toBe(false);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('flag_renamed');
    expect(payload.error.details.replacement).toBe('Use `--agent`.');
  });
});
