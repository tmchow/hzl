import { Command } from 'commander';
import { resolveDbPaths } from '../config.js';
import { initializeDb, closeDb, type Services } from '../db.js';
import { CLIError, ExitCode, handleError } from '../errors.js';
import { GlobalOptionsSchema } from '../types.js';
import { parseOptionalInteger } from '../parse.js';

const DEFAULT_POLL_INTERVAL_MS = 2_000;

export interface EventsResult {
  count: number;
  lastEventId: number;
}

interface EventsCommandOptions {
  from?: string;
  limit?: string;
  follow?: boolean;
}

interface RunEventsOptions {
  services: Services;
  fromId?: number;
  limit?: number;
  follow?: boolean;
  pollIntervalMs?: number;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  writeLine?: (line: string) => void;
}

function createAbortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function streamEvents(options: RunEventsOptions): Promise<EventsResult> {
  const {
    services,
    fromId,
    limit,
    follow = false,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    signal,
    sleep = defaultSleep,
    writeLine = (line: string) => {
      process.stdout.write(`${line}\n`);
    },
  } = options;

  let count = 0;
  let lastEventId = fromId ?? (follow ? services.eventStore.getLatestEventId() : 0);

  const emitBatch = (batchLimit?: number): void => {
    const events = services.eventStore.getEvents({
      afterId: lastEventId,
      limit: batchLimit,
    });

    for (const event of events) {
      writeLine(JSON.stringify(event));
      count += 1;
      lastEventId = event.rowid;
    }
  };

  emitBatch(limit);

  if (!follow) {
    return { count, lastEventId };
  }

  while (!signal?.aborted) {
    await sleep(pollIntervalMs, signal);
    if (signal?.aborted) break;
    emitBatch();
  }

  return { count, lastEventId };
}

export async function runEvents(options: RunEventsOptions): Promise<EventsResult> {
  return streamEvents(options);
}

export function createEventsCommand(): Command {
  return new Command('events')
    .description('Stream raw ledger events as NDJSON')
    .option('--from <id>', 'Read events after rowid')
    .option('--limit <n>', 'Limit initial events emitted')
    .option('--follow', 'Keep polling for new events', false)
    .action(async function (this: Command, opts: EventsCommandOptions) {
      const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
      if (globalOpts.format !== 'json') {
        throw new CLIError('hzl events only supports JSON output', ExitCode.InvalidInput);
      }

      const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
      const services = initializeDb({ eventsDbPath, cacheDbPath });
      const controller = new AbortController();
      const onSigint = () => controller.abort();

      process.on('SIGINT', onSigint);

      try {
        await runEvents({
          services,
          fromId: parseOptionalInteger(opts.from, 'from', { min: 0 }),
          limit: parseOptionalInteger(opts.limit, 'limit', { min: 1 }),
          follow: opts.follow ?? false,
          signal: controller.signal,
        });
      } catch (e) {
        if (!isAbortError(e)) {
          handleError(e, globalOpts.json);
        }
      } finally {
        process.off('SIGINT', onSigint);
        closeDb(services);
      }
    });
}
