import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../api/client';
import type { ActivityEvent, EventListResponse } from '../api/types';

export interface UseEventsResult {
  events: ActivityEvent[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useEvents(sinceId = 0): UseEventsResult {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const params: Record<string, string> = {};
    if (sinceId > 0) params.since = String(sinceId);

    setLoading(true);
    fetchJson<EventListResponse>('/api/events', params)
      .then((data) => {
        setEvents(data.events);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [sinceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { events, loading, error, refresh };
}
