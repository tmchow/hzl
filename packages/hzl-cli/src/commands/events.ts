import { Command } from 'commander';
import { resolveDbPaths } from '../config.js';
import { initializeDb, closeDb, type Services } from '../db.js';
import { CLIError, ExitCode, handleError } from '../errors.js';
import { GlobalOptionsSchema } from '../types.js';
import { parseOptionalInteger } from '../parse.js';

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_READ_BATCH_SIZE = 500;

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
  writeLine?: (line: string) => void | Promise<void>;
}

function createAbortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isBrokenPipeError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'EPIPE'
  );
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

function defaultWriteLine(line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      process.stdout.write(`${line}\n`, (error?: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
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
    writeLine = defaultWriteLine,
  } = options;

  let count = 0;
  let lastEventId = fromId ?? (follow ? services.eventStore.getLatestEventId() : 0);

  const emitBatch = async (maxEvents?: number): Promise<boolean> => {
    let remaining = maxEvents ?? Number.POSITIVE_INFINITY;

    while (remaining > 0 && !signal?.aborted) {
      const pageSize = Number.isFinite(remaining)
        ? Math.min(remaining, DEFAULT_READ_BATCH_SIZE)
        : DEFAULT_READ_BATCH_SIZE;
      const events = services.eventStore.getEvents({
        afterId: lastEventId,
        limit: pageSize,
      });

      if (events.length === 0) {
        return true;
      }

      for (const event of events) {
        try {
          await writeLine(JSON.stringify(event));
        } catch (error) {
          if (isAbortError(error) || isBrokenPipeError(error)) {
            return false;
          }
          throw error;
        }
        count += 1;
        lastEventId = event.rowid;
      }

      remaining -= events.length;
      if (events.length < pageSize) {
        return true;
      }
    }

    return !signal?.aborted;
  };

  const initialCompleted = await emitBatch(limit);
  if (!initialCompleted) {
    return { count, lastEventId };
  }

  if (!follow) {
    return { count, lastEventId };
  }

  while (!signal?.aborted) {
    await sleep(pollIntervalMs, signal);
    if (signal?.aborted) break;
    const completed = await emitBatch();
    if (!completed) break;
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
      let services: Services | null = null;
      const controller = new AbortController();
      const onSigint = () => controller.abort();

      try {
        if (globalOpts.format !== 'json') {
          throw new CLIError('hzl events only supports JSON output', ExitCode.InvalidInput);
        }

        const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
        services = initializeDb({ eventsDbPath, cacheDbPath });
        process.on('SIGINT', onSigint);

        await runEvents({
          services,
          fromId: parseOptionalInteger(opts.from, 'from', { min: 0 }),
          limit: parseOptionalInteger(opts.limit, 'limit', { min: 1 }),
          follow: opts.follow ?? false,
          signal: controller.signal,
        });
      } catch (e) {
        if (!isAbortError(e) && !isBrokenPipeError(e)) {
          handleError(e, globalOpts.json);
        }
      } finally {
        process.off('SIGINT', onSigint);
        if (services) {
          closeDb(services);
        }
      }
    });
}
