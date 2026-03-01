import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../api/client';
import type { TaskDetail, TaskDetailResponse } from '../api/types';

export interface UseTaskDetailResult {
  task: TaskDetail | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useTaskDetail(taskId: string | null): UseTaskDetailResult {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!taskId) {
      setTask(null);
      return;
    }

    setLoading(true);
    fetchJson<TaskDetailResponse>(`/api/tasks/${encodeURIComponent(taskId)}`)
      .then((data) => {
        setTask(data.task);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [taskId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { task, loading, error, refresh };
}
