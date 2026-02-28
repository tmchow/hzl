// packages/hzl-cli/src/commands/export-events.ts
import { Command } from 'commander';
import fs from 'fs';
import { resolveDbPaths } from '../config.js';
import { initializeDb, closeDb, type Services } from '../db.js';
import { handleError } from '../errors.js';
import { GlobalOptionsSchema } from '../types.js';
import { parseOptionalInteger } from '../parse.js';

export interface ExportEventsResult {
  count: number;
  path: string;
}

export function runExportEvents(options: {
  services: Services;
  outputPath: string;
  fromId?: number;
  json: boolean;
}): ExportEventsResult {
  const { services, outputPath, fromId, json } = options;
  const { db } = services;

  // Get all events
  const events = db.prepare(`
    SELECT * FROM events 
    ${fromId ? 'WHERE rowid > ?' : ''}
    ORDER BY rowid
  `).all(fromId ? [fromId] : []) as Array<Record<string, unknown>>;

  const lines = events.map(e => JSON.stringify(e));
  
  if (outputPath === '-') {
    // Write to stdout
    for (const line of lines) {
      console.log(line);
    }
  } else {
    // Write to file
    fs.writeFileSync(outputPath, lines.join('\n') + '\n');
  }

  const result: ExportEventsResult = {
    count: events.length,
    path: outputPath,
  };

  if (json && outputPath !== '-') {
    console.log(JSON.stringify(result));
  } else if (outputPath !== '-') {
    console.log(`✓ Exported ${events.length} events to ${outputPath}`);
  }

  return result;
}

export function createExportEventsCommand(): Command {
  return new Command('export-events')
    .description('Export events to JSONL file')
    .argument('[output]', 'Output file path (use - for stdout)', '-')
    .option('--from <id>', 'Export events starting from rowid')
    .action(function (
      this: Command,
      output: string,
      opts: { from?: string }
    ) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      try {
        runExportEvents({
          services,
          outputPath: output,
          fromId: parseOptionalInteger(opts.from, 'from', { min: 0 }),
          json: globalOpts.json ?? false,
        });
      } catch (e) {
        handleError(e, globalOpts.json);
      } finally {
        closeDb(services);
      }
    });
}
