// packages/hzl-cli/src/commands/serve.ts
import { Command } from 'commander';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { resolveDbPaths, isDevMode } from '../config.js';
import { initializeDb, closeDb } from '../db.js';
import { handleError } from '../errors.js';
import { GlobalOptionsSchema } from '../types.js';
import { createWebServer } from 'hzl-web';

const DEFAULT_PORT = 3456;

interface ServeCommandOptions {
  port?: string;
  background?: boolean;
  stop?: boolean;
  status?: boolean;
  printSystemd?: boolean;
}

// Get the directory for PID and log files
function getServePidDir(): string {
  if (isDevMode()) {
    // Dev mode: use project-local .local/hzl/
    const cwd = process.cwd();
    // Walk up to find monorepo root
    let dir = cwd;
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, 'packages', 'hzl-cli'))) {
        return path.join(dir, '.local', 'hzl');
      }
      dir = path.dirname(dir);
    }
    return path.join(cwd, '.local', 'hzl');
  }

  // Production: use XDG data home
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'hzl');
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'hzl');
}

function getPidPath(): string {
  return path.join(getServePidDir(), 'serve.pid');
}

function getLogPath(): string {
  return path.join(getServePidDir(), 'serve.log');
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPidFile(): { pid: number; port: number } | null {
  const pidPath = getPidPath();
  if (!fs.existsSync(pidPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(pidPath, 'utf-8').trim();
    const [pidStr, portStr] = content.split(':');
    const pid = parseInt(pidStr, 10);
    const port = parseInt(portStr, 10) || DEFAULT_PORT;

    if (isNaN(pid)) return null;
    if (!isProcessRunning(pid)) {
      // Stale PID file, remove it
      fs.unlinkSync(pidPath);
      return null;
    }

    return { pid, port };
  } catch {
    return null;
  }
}

function writePidFile(pid: number, port: number): void {
  const pidPath = getPidPath();
  ensureDir(path.dirname(pidPath));
  fs.writeFileSync(pidPath, `${pid}:${port}`);
}

function removePidFile(): void {
  const pidPath = getPidPath();
  if (fs.existsSync(pidPath)) {
    fs.unlinkSync(pidPath);
  }
}

function printSystemdUnit(port: number): void {
  // Find the hzl binary path
  const hzlPath = process.argv[1].replace(/\.js$/, '');
  const unit = `[Unit]
Description=hzl task dashboard
After=network.target

[Service]
Type=simple
ExecStart=${hzlPath} serve --port ${port}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
  console.log(unit);
  console.log('# Install with:');
  console.log(`#   hzl serve --print-systemd > ~/.config/systemd/user/hzl-web.service`);
  console.log('#   systemctl --user daemon-reload');
  console.log('#   systemctl --user enable --now hzl-web');
}

function runStatus(): void {
  const info = readPidFile();
  if (info) {
    console.log(`hzl dashboard is running`);
    console.log(`  PID: ${info.pid}`);
    console.log(`  URL: http://localhost:${info.port}`);
    console.log(`  Log: ${getLogPath()}`);
  } else {
    console.log('hzl dashboard is not running');
  }
}

function runStop(): void {
  const info = readPidFile();
  if (!info) {
    console.log('hzl dashboard is not running');
    return;
  }

  try {
    process.kill(info.pid, 'SIGTERM');
    removePidFile();
    console.log(`hzl dashboard stopped (PID: ${info.pid})`);
  } catch (error) {
    console.error(`Failed to stop process: ${error}`);
  }
}

function runBackground(port: number, dbOption?: string): void {
  const existing = readPidFile();
  if (existing) {
    console.log(`hzl dashboard is already running on port ${existing.port} (PID: ${existing.pid})`);
    console.log(`Run 'hzl serve --stop' to stop it first`);
    return;
  }

  const logPath = getLogPath();
  ensureDir(path.dirname(logPath));

  // Build args for child process
  const args = ['serve', '--port', String(port)];
  if (dbOption) {
    args.unshift('--db', dbOption);
  }

  // Spawn detached process
  const out = fs.openSync(logPath, 'a');
  const err = fs.openSync(logPath, 'a');

  const child = spawn(process.execPath, [process.argv[1], ...args], {
    detached: true,
    stdio: ['ignore', out, err],
    env: { ...process.env, HZL_SERVE_BACKGROUND: '1' },
  });

  child.unref();

  // Write PID file
  writePidFile(child.pid!, port);

  console.log('hzl dashboard started in background');
  console.log(`  URL: http://localhost:${port}`);
  console.log(`  PID: ${child.pid}`);
  console.log(`  Log: ${logPath}`);
  console.log('');
  console.log(`Run 'hzl serve --stop' to stop`);
}

async function runForeground(port: number, dbOption?: string): Promise<void> {
  const { eventsDbPath, cacheDbPath } = resolveDbPaths(dbOption);
  const services = initializeDb({ eventsDbPath, cacheDbPath });

  const server = createWebServer({
    port,
    cacheDb: services.cacheDb,
    eventsDb: services.db,
  });

  // Write PID file for --status to detect
  writePidFile(process.pid, port);

  const devIndicator = isDevMode() ? ' (dev mode)' : '';
  console.log(`hzl dashboard running at ${server.url}${devIndicator}`);
  console.log(`Listening on 0.0.0.0:${port} (accessible from network)`);
  console.log('Press Ctrl+C to stop');

  // Handle shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    removePidFile();
    await server.close();
    closeDb(services);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep process alive
  await new Promise(() => {});
}

export function createServeCommand(): Command {
  return new Command('serve')
    .description('Start the web dashboard server')
    .option('-p, --port <port>', `Port to listen on (default: ${DEFAULT_PORT})`)
    .option('-b, --background', 'Run in background')
    .option('--stop', 'Stop the background server')
    .option('--status', 'Check if server is running')
    .option('--print-systemd', 'Print systemd unit file')
    .action(async function (this: Command, opts: ServeCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const port = parseInt(opts.port ?? String(DEFAULT_PORT), 10);

      try {
        if (opts.printSystemd) {
          printSystemdUnit(port);
          return;
        }

        if (opts.status) {
          runStatus();
          return;
        }

        if (opts.stop) {
          runStop();
          return;
        }

        if (opts.background) {
          // Don't re-fork if we're already the background process
          if (process.env.HZL_SERVE_BACKGROUND === '1') {
            await runForeground(port, globalOpts.db);
          } else {
            runBackground(port, globalOpts.db);
          }
          return;
        }

        // Default: foreground mode
        await runForeground(port, globalOpts.db);
      } catch (e) {
        handleError(e, globalOpts.json);
      }
    });
}
