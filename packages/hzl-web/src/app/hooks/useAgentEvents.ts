import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '../api/client';
import type { AgentEvent, AgentEventsResponse } from '../api/types';

const DEFAULT_LIMIT = 50;

export interface UseAgentEventsResult {
  events: AgentEvent[] | null;
  total: number;
  loading: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => void;
}

export function useAgentEvents(agentId: string | null): UseAgentEventsResult {
  const [events, setEvents] = useState<AgentEvent[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);

  const fetchEvents = useCallback(
    (offset: number, append: boolean) => {
      if (!agentId) return;

      const params: Record<string, string> = {
        limit: String(DEFAULT_LIMIT),
        offset: String(offset),
      };

      setLoading(true);
      fetchJson<AgentEventsResponse>(
        `/api/agents/${encodeURIComponent(agentId)}/events`,
        params,
      )
        .then((data) => {
          if (append) {
            setEvents((prev) => (prev ? [...prev, ...data.events] : data.events));
          } else {
            setEvents(data.events);
          }
          setTotal(data.total);
          setError(null);
        })
        .catch((err: Error) => {
          setError(err.message);
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [agentId],
  );

  // Reset and fetch when agentId changes
  useEffect(() => {
    if (!agentId) {
      setEvents(null);
      setTotal(0);
      setError(null);
      offsetRef.current = 0;
      return;
    }

    offsetRef.current = 0;
    fetchEvents(0, false);
  }, [agentId, fetchEvents]);

  const loadMore = useCallback(() => {
    if (!agentId || loading) return;
    const newOffset = offsetRef.current + DEFAULT_LIMIT;
    offsetRef.current = newOffset;
    fetchEvents(newOffset, true);
  }, [agentId, loading, fetchEvents]);

  const refresh = useCallback(() => {
    if (!agentId) return;
    offsetRef.current = 0;
    fetchEvents(0, false);
  }, [agentId, fetchEvents]);

  return { events, total, loading, error, loadMore, refresh };
}
