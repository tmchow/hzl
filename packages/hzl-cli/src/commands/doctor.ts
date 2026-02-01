import { Command } from 'commander';
import fs from 'fs';
import { createDatastore, getInstanceId, DatabaseLock } from 'hzl-core';
import { GlobalOptionsSchema } from '../types.js';
import { resolveDbPaths, getConfigPath, readConfig, checkConfigPermissions } from '../config.js';

type CheckStatus = 'pass' | 'fail' | 'warn';

interface Check {
    status: CheckStatus;
    message?: string;
    path?: string;
    version?: number;
    actions?: Array<{ command: string; description: string }>;
}

export interface DoctorResult {
    success: boolean;
    status: 'healthy' | 'unhealthy';
    mode: string;
    checks: {
        config: Check;
        database: Check;
        migrations: Check;
        permissions: Check;
        lock: Check;
        connectivity?: Check;
        identity?: Check;
    };
}

export interface DoctorOptions {
    eventsDbPath: string;
    cacheDbPath: string;
    configPath: string;
    json: boolean;
    syncUrl?: string;
    authToken?: string;
}

export async function runDoctor(options: DoctorOptions): Promise<DoctorResult> {
    const { eventsDbPath, cacheDbPath, configPath, json, syncUrl, authToken } = options;
    const checks: DoctorResult['checks'] = {
        config: { status: 'pass' },
        database: { status: 'pass' },
        migrations: { status: 'pass' },
        permissions: { status: 'pass' },
        lock: { status: 'pass' },
    };
    let mode = 'unknown';

    // Check config
    try {
        if (fs.existsSync(configPath)) {
            const config = readConfig(configPath);
            checks.config = { status: 'pass', path: configPath };

            // Check config file permissions if authToken is stored in config (top-level or nested)
            if (config.authToken || config.db?.events?.authToken) {
                const permWarning = checkConfigPermissions(configPath);
                if (permWarning) {
                    checks.config = {
                        status: 'warn',
                        message: permWarning,
                        path: configPath,
                        actions: [
                            { command: `chmod 600 "${configPath}"`, description: 'Fix config file permissions' },
                            { command: 'Consider using TURSO_AUTH_TOKEN env var instead', description: 'More secure for auth tokens' },
                        ],
                    };
                }
            }
        } else {
            checks.config = { status: 'warn', message: 'Config file not found', path: configPath };
        }
    } catch (err) {
        checks.config = {
            status: 'fail',
            message: err instanceof Error ? err.message : 'Invalid config',
            path: configPath,
            actions: [{ command: `rm ${configPath}`, description: 'Remove corrupted config' }],
        };
    }

    // Check database
    try {
        if (!fs.existsSync(eventsDbPath)) {
            checks.database = {
                status: 'fail',
                message: 'Events database not found',
                path: eventsDbPath,
                actions: [{ command: 'hzl init', description: 'Initialize database' }],
            };
        } else {
            const datastore = createDatastore({
                events: { path: eventsDbPath, syncUrl, authToken, syncMode: 'offline', readYourWrites: true },
                cache: { path: cacheDbPath },
            });
            mode = datastore.mode;

            // Run integrity check
            const integrity = datastore.eventsDb.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
            if (integrity.integrity_check !== 'ok') {
                checks.database = {
                    status: 'fail',
                    message: `Integrity check failed: ${integrity.integrity_check}`,
                    path: eventsDbPath,
                    actions: [{ command: 'hzl init', description: 'Reinitialize database after restoring from backup' }],
                };
            } else {
                checks.database = { status: 'pass', path: eventsDbPath };
            }

            // Check identity
            const instanceId = getInstanceId(datastore.eventsDb);
            if (instanceId) {
                checks.identity = { status: 'pass', message: instanceId };
            }

            datastore.close();
        }
    } catch (err) {
        checks.database = {
            status: 'fail',
            message: err instanceof Error ? err.message : 'Database error',
            path: eventsDbPath,
        };
    }

    // Check lock
    try {
        const lockPath = `${eventsDbPath}.lock`;
        const lock = new DatabaseLock(lockPath);
        const metadata = lock.readMetadata();

        if (metadata) {
            if (lock.isStale()) {
                checks.lock = {
                    status: 'warn',
                    message: `Stale lock from PID ${metadata.pid}`,
                    actions: [{ command: `rm "${lockPath}"`, description: 'Remove stale lock file (only if no hzl process is using the database)' }],
                };
            } else {
                checks.lock = {
                    status: 'warn',
                    message: `Lock held by PID ${metadata.pid} (${metadata.command ?? 'unknown'})`,
                };
            }
        } else {
            checks.lock = { status: 'pass' };
        }
    } catch (err) {
        checks.lock = {
            status: 'fail',
            message: err instanceof Error ? err.message : 'Lock check error',
        };
    }

    // Check Turso connectivity (if sync is configured)
    if (mode !== 'local-only' && mode !== 'unknown') {
        try {
            const datastore = createDatastore({
                events: { path: eventsDbPath, syncUrl, authToken, syncMode: 'offline', readYourWrites: true },
                cache: { path: cacheDbPath },
            });

            // Attempt a sync to test connectivity
            const syncResult = await datastore.sync();
            datastore.close();

            if (syncResult.success) {
                checks.connectivity = {
                    status: 'pass',
                    message: `Connected to Turso (frame: ${syncResult.frameNo})`,
                };
            } else if (syncResult.error?.includes('Rate limited')) {
                checks.connectivity = {
                    status: 'warn',
                    message: 'Rate limited - try again later',
                };
            } else {
                checks.connectivity = {
                    status: 'fail',
                    message: syncResult.error ?? 'Sync failed',
                    actions: [
                        { command: 'Check TURSO_AUTH_TOKEN env var', description: 'Verify auth token is set correctly' },
                        { command: 'hzl init --local', description: 'Switch to local-only mode' },
                    ],
                };
            }
        } catch (err) {
            checks.connectivity = {
                status: 'fail',
                message: `Connectivity check failed: ${err instanceof Error ? err.message : String(err)}`,
                actions: [
                    { command: 'Check network connection', description: 'Ensure you can reach Turso servers' },
                    { command: 'hzl init --local', description: 'Switch to local-only mode if offline' },
                ],
            };
        }
    }

    // Check permissions
    try {
        if (fs.existsSync(eventsDbPath)) {
            fs.accessSync(eventsDbPath, fs.constants.R_OK | fs.constants.W_OK);
            checks.permissions = { status: 'pass' };
        }
    } catch {
        checks.permissions = {
            status: 'fail',
            message: 'Cannot read/write database',
            actions: [{ command: `chmod 644 ${eventsDbPath}`, description: 'Fix permissions' }],
        };
    }

    // Determine overall health
    const hasFailure = Object.values(checks).some(c => c.status === 'fail');
    const result: DoctorResult = {
        success: !hasFailure,
        status: hasFailure ? 'unhealthy' : 'healthy',
        mode,
        checks,
    };

    if (!json) {
        console.log(`Status: ${result.status}`);
        console.log(`Mode:   ${mode}`);
        console.log('');

        for (const [name, check] of Object.entries(checks)) {
            if (!check) continue;
            const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
            console.log(`${icon} ${name}: ${check.status}${check.message ? ` - ${check.message}` : ''}`);
            if (check.actions) {
                for (const action of check.actions) {
                    console.log(`    → ${action.command}: ${action.description}`);
                }
            }
        }
    }

    return result;
}

export function createDoctorCommand(): Command {
    return new Command('doctor')
        .description('Validate database setup and connectivity')
        .action(async function (this: Command) {
            const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
            const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
            const configPath = getConfigPath();
            const config = readConfig(configPath);

            // Get sync URL and auth token from config or env
            const syncUrl = process.env.HZL_SYNC_URL ?? config.syncUrl ?? config.db?.events?.syncUrl;
            const authToken = process.env.HZL_AUTH_TOKEN ?? config.authToken ?? config.db?.events?.authToken;

            const result = await runDoctor({
                eventsDbPath,
                cacheDbPath,
                configPath,
                json: globalOpts.json,
                syncUrl,
                authToken,
            });

            if (globalOpts.json) {
                console.log(JSON.stringify(result, null, 2));
            }

            process.exit(result.success ? 0 : 1);
        });
}
