import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../api/client';
import type { Stats } from '../api/types';

export interface UseStatsResult {
  stats: Stats | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useStats(): UseStatsResult {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchJson<Stats>('/api/stats')
      .then((data) => {
        setStats(data);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, loading, error, refresh };
}
