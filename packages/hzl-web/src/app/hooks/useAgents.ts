import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../api/client';
import type { AgentRosterItem, AgentRosterResponse } from '../api/types';

export interface UseAgentsOptions {
  since?: string;
  project?: string;
}

export interface UseAgentsResult {
  agents: AgentRosterItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAgents(options: UseAgentsOptions = {}): UseAgentsResult {
  const { since, project } = options;
  const [agents, setAgents] = useState<AgentRosterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const params: Record<string, string> = {};
    if (since) params.since = since;
    if (project) params.project = project;

    setLoading(true);
    fetchJson<AgentRosterResponse>('/api/agents', params)
      .then((data) => {
        setAgents(data.agents);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [since, project]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { agents, loading, error, refresh };
}
