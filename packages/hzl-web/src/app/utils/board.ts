import type { TaskListItem } from '../api/types';
import { getBoardStatus } from './format';

export const COLUMNS = ['backlog', 'ready', 'in_progress', 'blocked', 'done'] as const;

export const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
};

export function groupTasksByStatus(tasks: TaskListItem[]): Record<string, TaskListItem[]> {
  const groups: Record<string, TaskListItem[]> = {
    backlog: [],
    ready: [],
    in_progress: [],
    blocked: [],
    done: [],
  };
  for (const task of tasks) {
    const status = getBoardStatus(task);
    if (groups[status]) {
      groups[status].push(task);
    }
  }
  return groups;
}
