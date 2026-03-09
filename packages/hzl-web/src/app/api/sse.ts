import {
  getNumberProperty,
  isRecord,
  parseJsonValue,
} from 'hzl-core/utils/json.js';

export interface SSEClient {
  connect: () => void;
  disconnect: () => void;
}

const MIN_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;

function parseLatestEventId(raw: unknown): number | null {
  if (typeof raw !== 'string') {
    return null;
  }

  try {
    const parsed = parseJsonValue(raw);
    if (isRecord(parsed)) {
      return getNumberProperty(parsed, 'latest_event_id');
    }
  } catch {
    // ignore parse errors
  }

  return null;
}

/**
 * Creates an SSE client that listens to /api/events/stream.
 * Calls onUpdate with the latest event ID when the server pushes an update.
 * Reconnects with exponential backoff on disconnection.
 */
export function createSSEClient(onUpdate: (eventId: number) => void): SSEClient {
  let es: EventSource | null = null;
  let retryMs = MIN_RETRY_MS;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function handleEventData(e: MessageEvent<unknown>): void {
    const latestEventId = parseLatestEventId(e.data);
    if (latestEventId !== null) {
      onUpdate(latestEventId);
    }
  }

  function scheduleReconnect(): void {
    if (stopped) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, retryMs);
    retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
  }

  function connect(): void {
    if (stopped) return;
    cleanup();

    es = new EventSource('/api/events/stream');

    es.addEventListener('ready', (e: Event) => {
      retryMs = MIN_RETRY_MS;
      if (e instanceof MessageEvent) {
        handleEventData(e);
      }
    });

    es.addEventListener('update', handleEventData);

    es.onerror = () => {
      cleanup();
      scheduleReconnect();
    };
  }

  function cleanup(): void {
    if (es) {
      es.close();
      es = null;
    }
  }

  function disconnect(): void {
    stopped = true;
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    cleanup();
  }

  // Reconnect on window focus (handles sleep/suspend)
  function handleVisibilityChange(): void {
    if (document.visibilityState === 'visible' && !stopped && !es) {
      retryMs = MIN_RETRY_MS;
      connect();
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange);

  return { connect, disconnect };
}
