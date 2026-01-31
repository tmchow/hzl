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
