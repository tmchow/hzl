import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../api/client';
import type { AgentTaskSummary, AgentTasksResponse, AgentRosterTaskCounts } from '../api/types';

export interface UseAgentTasksResult {
  tasks: AgentTaskSummary[] | null;
  counts: AgentRosterTaskCounts | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAgentTasks(agentId: string | null): UseAgentTasksResult {
  const [tasks, setTasks] = useState<AgentTaskSummary[] | null>(null);
  const [counts, setCounts] = useState<AgentRosterTaskCounts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!agentId) return;

    setLoading(true);
    fetchJson<AgentTasksResponse>(
      `/api/agents/${encodeURIComponent(agentId)}/tasks`,
    )
      .then((data) => {
        setTasks(data.tasks);
        setCounts(data.counts);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [agentId]);

  useEffect(() => {
    if (!agentId) {
      setTasks(null);
      setCounts(null);
      setError(null);
      return;
    }
    refresh();
  }, [agentId, refresh]);

  return { tasks, counts, loading, error, refresh };
}
