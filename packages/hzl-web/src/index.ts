import type { Database } from 'libsql';

export interface ServerOptions {
  port: number;
  cacheDb: Database;
  eventsDb: Database;
}

export interface ServerHandle {
  close: () => Promise<void>;
  port: number;
  url: string;
}

/**
 * Start the hzl web dashboard server.
 * Returns a handle to stop the server.
 */
export async function startServer(options: ServerOptions): Promise<ServerHandle> {
  // TODO: Implement in Phase 2
  const { port } = options;

  return {
    close: async () => {},
    port,
    url: `http://localhost:${port}`,
  };
}
