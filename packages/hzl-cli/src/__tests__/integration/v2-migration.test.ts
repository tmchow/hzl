import { beforeAll, describe, expect, it, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestContext, hzlExec, hzlJson, hzlMayFail, type TestContext } from './helpers.js';

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

  it('accepts legacy task next surface by normalizing to task claim --next', () => {
    hzlJson(ctx, 'project create demo');
    const created = hzlJson<{ task_id: string }>(ctx, 'task add "Legacy next" -P demo');
    hzlJson(ctx, `task set-status ${created.task_id} ready`);

    const result = hzlMayFail(ctx, 'task next --project demo --agent agent-1');
    expect(result.success).toBe(true);

    const payload = JSON.parse(result.stdout) as {
      task_id: string | null;
      decision_trace: { mode: string };
    };
    expect(payload.task_id).toBe(created.task_id);
    expect(payload.decision_trace.mode).toBe('next');
  });

  it('accepts legacy --json flag as JSON alias', () => {
    const result = hzlMayFail(ctx, 'task list --json');
    expect(result.success).toBe(true);
    const payload = JSON.parse(result.stdout);
    expect(payload.tasks).toBeDefined();
  });

  it('accepts renamed --assignee flag by normalizing to --agent', () => {
    const created = hzlJson<{ task_id: string }>(ctx, 'task add "Claim me"');
    hzlJson(ctx, `task set-status ${created.task_id} ready`);

    const result = hzlMayFail(ctx, `task claim ${created.task_id} --assignee agent-1`);
    expect(result.success).toBe(true);
    const payload = JSON.parse(result.stdout) as { task_id: string; agent: string | null };
    expect(payload.task_id).toBe(created.task_id);
    expect(payload.agent).toBe('agent-1');
  });

  it('renders markdown usage errors when corrected format flag indicates md output', () => {
    const result = hzlExec(ctx, '--fromat md task list --wut 1');
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain("Note: Interpreted '--fromat' as '--format'.");
    expect(result.stderr).toContain("Error: Could not parse option '--wut'.");
    expect(result.stderr).toContain('Examples:');
    expect(result.stderr).not.toContain('"schema_version"');
  });

  it('keeps unsupported --assignee unchanged in usage errors', () => {
    const result = hzlMayFail(ctx, 'project list --assignee agent-1');
    expect(result.success).toBe(false);
    expect(result.stderr).toBe('');

    const payload = JSON.parse(result.stdout) as {
      error: { code: string; message: string; details: { reason: string } };
    };
    expect(payload.error.code).toBe('invalid_usage');
    expect(payload.error.details.reason).toContain("Unknown option '--assignee'.");
    expect(payload.error.details.reason).not.toContain('--agent');
  });
});
