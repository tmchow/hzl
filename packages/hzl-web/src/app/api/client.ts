import type { ApiError } from './types';

export class FetchError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

/**
 * Typed JSON fetch wrapper for the HZL API.
 * Uses relative URLs so it works with both Vite dev proxy and production same-origin.
 */
export async function fetchJson<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as ApiError;
      if (body.error) {
        message = body.error;
      }
    } catch {
      // ignore parse errors
    }
    throw new FetchError(response.status, message);
  }

  return response.json() as Promise<T>;
}
