import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../api/client';
import type { TaskListItem, TaskListResponse } from '../api/types';

export interface UseTasksOptions {
  since?: string;
  project?: string;
  dueMonth?: string;
}

export interface UseTasksResult {
  tasks: TaskListItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useTasks(options: UseTasksOptions = {}): UseTasksResult {
  const { since, project, dueMonth } = options;
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const params: Record<string, string> = {};
    if (dueMonth) params.due_month = dueMonth;
    else if (since) params.since = since;
    if (project) params.project = project;

    setLoading(true);
    fetchJson<TaskListResponse>('/api/tasks', params)
      .then((data) => {
        setTasks(data.tasks);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [since, project, dueMonth]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tasks, loading, error, refresh };
}
