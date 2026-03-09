import {
  getStringProperty,
  isRecord,
} from 'hzl-core/utils/json.js';

export class FetchError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

function getApiErrorMessage(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  return getStringProperty(value, 'error');
}

/**
 * Typed JSON fetch wrapper for the HZL API.
 * Uses relative URLs so it works with both Vite dev proxy and production same-origin.
 */
export async function fetchJson<T>(
  path: string,
  params?: Record<string, string>,
  options?: { signal?: AbortSignal },
): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), { signal: options?.signal });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body: unknown = await response.json();
      const apiErrorMessage = getApiErrorMessage(body);
      if (apiErrorMessage !== null) {
        message = apiErrorMessage;
      }
    } catch {
      // ignore parse errors
    }
    throw new FetchError(response.status, message);
  }

  return response.json() as Promise<T>;
}
