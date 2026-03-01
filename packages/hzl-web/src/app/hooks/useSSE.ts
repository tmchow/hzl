import { useEffect, useRef } from 'react';
import { createSSEClient, type SSEClient } from '../api/sse';

/**
 * Hook that connects to the SSE stream and calls the provided callback on each update.
 * Manages the SSE client lifecycle (connect on mount, disconnect on unmount).
 */
export function useSSE(onUpdate: () => void): void {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    const client: SSEClient = createSSEClient(() => {
      callbackRef.current();
    });
    client.connect();
    return () => {
      client.disconnect();
    };
  }, []);
}
