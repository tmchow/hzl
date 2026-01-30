// packages/hzl-cli/src/__tests__/integration/helpers.ts
import { execSync, ExecSyncOptions } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

export interface TestContext {
  tempDir: string;
  dbPath: string;
  cleanup: () => void;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.resolve(__dirname, '../../../dist/cli.js');

export function createTestContext(): TestContext {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hzl-integration-'));
  const dbPath = path.join(tempDir, 'test.db');
  return {
    tempDir,
    dbPath,
    cleanup: () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

export function hzl(ctx: TestContext, args: string, options?: ExecSyncOptions): string {
  const cmd = `node "${cliPath}" --db "${ctx.dbPath}" ${args}`;
  const result = execSync(cmd, { encoding: 'utf-8', ...options });
  return (result as string).trim();
}

export function hzlJson<T>(ctx: TestContext, args: string): T {
  const output = hzl(ctx, `${args} --json`);
  return JSON.parse(output) as T;
}

export function hzlMayFail(ctx: TestContext, args: string): { stdout: string; success: boolean } {
  try {
    const stdout = hzl(ctx, args);
    return { stdout, success: true };
  } catch (error: any) {
    return { stdout: error.stdout || '', success: false };
  }
}
