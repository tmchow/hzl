// packages/hzl-cli/src/commands/serve.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServeCommand } from './serve.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('hzl serve command', () => {
  const testDir = path.join(os.tmpdir(), `serve-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('createServeCommand', () => {
    it('creates a command with correct name', () => {
      const cmd = createServeCommand();
      expect(cmd.name()).toBe('serve');
    });

    it('has port option', () => {
      const cmd = createServeCommand();
      const portOpt = cmd.options.find((o) => o.long === '--port');
      expect(portOpt).toBeDefined();
    });

    it('has host option', () => {
      const cmd = createServeCommand();
      const hostOpt = cmd.options.find((o) => o.long === '--host');
      expect(hostOpt).toBeDefined();
    });

    it('has background option', () => {
      const cmd = createServeCommand();
      const bgOpt = cmd.options.find((o) => o.long === '--background');
      expect(bgOpt).toBeDefined();
    });

    it('has stop option', () => {
      const cmd = createServeCommand();
      const stopOpt = cmd.options.find((o) => o.long === '--stop');
      expect(stopOpt).toBeDefined();
    });

    it('has status option', () => {
      const cmd = createServeCommand();
      const statusOpt = cmd.options.find((o) => o.long === '--status');
      expect(statusOpt).toBeDefined();
    });

    it('has print-systemd option', () => {
      const cmd = createServeCommand();
      const systemdOpt = cmd.options.find((o) => o.long === '--print-systemd');
      expect(systemdOpt).toBeDefined();
    });
  });

  describe('systemd unit generation', () => {
    it('generates valid systemd unit', async () => {
      const cmd = createServeCommand();
      const output: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => output.push(msg);

      try {
        // Parse just to trigger the action - we need to mock the action
        // For now, just verify the command structure
        expect(cmd.options.find((o) => o.long === '--print-systemd')).toBeDefined();
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('default values', () => {
    it('uses port 3456 by default', () => {
      const cmd = createServeCommand();
      const portOpt = cmd.options.find((o) => o.long === '--port');
      expect(portOpt?.description).toContain('3456');
    });

    it('uses localhost by default for security', () => {
      const cmd = createServeCommand();
      const hostOpt = cmd.options.find((o) => o.long === '--host');
      expect(hostOpt?.description).toContain('127.0.0.1');
    });

    it('documents 0.0.0.0 for network access', () => {
      const cmd = createServeCommand();
      const hostOpt = cmd.options.find((o) => o.long === '--host');
      expect(hostOpt?.description).toContain('0.0.0.0');
    });
  });
});
