const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export function formatTime(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < MS_PER_MINUTE) return 'just now';
  if (diff < MS_PER_HOUR) return `${Math.floor(diff / MS_PER_MINUTE)}m ago`;
  if (diff < MS_PER_DAY) return `${Math.floor(diff / MS_PER_HOUR)}h ago`;
  return date.toLocaleDateString();
}

export function formatTimeRemaining(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff <= 0) return 'expired';
  if (diff < MS_PER_MINUTE) return `${Math.floor(diff / MS_PER_SECOND)}s left`;
  if (diff < MS_PER_HOUR) return `${Math.floor(diff / MS_PER_MINUTE)}m left`;
  return `${Math.floor(diff / MS_PER_HOUR)}h left`;
}

export function formatEventType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getAssigneeValue(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value.trim().length > 0 ? value : '';
}

export function truncateCardLabel(value: string, maxChars = 10): string {
  if (!value || maxChars <= 0) return '';
  const graphemes = Array.from(value);
  if (graphemes.length <= maxChars) return value;
  return `${graphemes.slice(0, maxChars).join('')}...`;
}

export function truncateText(text: string | null | undefined, max = 160): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

export function getEventActor(event: {
  author: string | null;
  agent_id: string | null;
  data: Record<string, unknown>;
}): string {
  const explicitAuthor =
    typeof event.author === 'string' && event.author.trim() ? event.author : null;
  if (explicitAuthor) return explicitAuthor;

  const explicitAgent =
    typeof event.agent_id === 'string' && event.agent_id.trim() ? event.agent_id : null;
  if (explicitAgent) return explicitAgent;

  const dataAuthor =
    event.data && typeof event.data.author === 'string' && (event.data.author as string).trim()
      ? (event.data.author as string)
      : null;
  return dataAuthor || 'system';
}

export function formatEventDetail(event: {
  type: string;
  data: Record<string, unknown>;
}): string {
  if (!event || !event.data) return '';

  if (event.type === 'task_created') {
    const assignee = typeof event.data.assignee === 'string' ? event.data.assignee : null;
    const project = typeof event.data.project === 'string' ? event.data.project : null;
    if (assignee && project) return `Assigned to ${assignee} in ${project}`;
    if (assignee) return `Assigned to ${assignee}`;
    if (project) return `Created in ${project}`;
    return '';
  }

  if (event.type === 'status_changed') {
    const from = typeof event.data.from === 'string' ? event.data.from : null;
    const to = typeof event.data.to === 'string' ? event.data.to : null;
    if (!from || !to) return '';
    return `${from} \u2192 ${to}`;
  }

  if (event.type === 'task_updated') {
    const field = typeof event.data.field === 'string' ? event.data.field : null;
    if (!field) return 'Task updated';
    return `${field} updated`;
  }

  if (event.type === 'comment_added') {
    const text = typeof event.data.text === 'string' ? event.data.text : '';
    return truncateText(text);
  }

  if (event.type === 'checkpoint_recorded') {
    const name = typeof event.data.name === 'string' ? event.data.name : null;
    return name ? `Checkpoint: ${name}` : 'Checkpoint recorded';
  }

  if (event.type === 'task_moved') {
    const fromProject = typeof event.data.from_project === 'string' ? event.data.from_project : null;
    const toProject = typeof event.data.to_project === 'string' ? event.data.to_project : null;
    if (!fromProject || !toProject) return '';
    return `${fromProject} \u2192 ${toProject}`;
  }

  if (event.type === 'dependency_added') {
    const depId = typeof event.data.depends_on_id === 'string' ? event.data.depends_on_id : null;
    return depId ? `Added dependency on ${depId}` : 'Added dependency';
  }

  if (event.type === 'dependency_removed') {
    const depId = typeof event.data.depends_on_id === 'string' ? event.data.depends_on_id : null;
    return depId ? `Removed dependency on ${depId}` : 'Removed dependency';
  }

  if (event.type === 'task_archived') {
    return 'Task archived';
  }

  return '';
}

/** Get the effective board status (ready tasks with blockers are shown as blocked) */
export function getBoardStatus(task: {
  status: string;
  blocked_by: string[] | null;
}): string {
  const isBlocked = task.blocked_by && task.blocked_by.length > 0;
  return isBlocked && task.status === 'ready' ? 'blocked' : task.status;
}

/**
 * Format a duration in milliseconds as a compact human-readable string.
 * Returns "Nm", "Nh", or "Nh Nm".
 * The `zeroLabel` controls what to show for values below one minute (default: "just now").
 */
export function formatDuration(ms: number, zeroLabel = 'just now'): string {
  if (ms < 0) return zeroLabel;
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return zeroLabel;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** Status color for graph nodes */
export function getStatusColor(status: string | undefined, type?: string): string {
  if (type === 'root') return '#f59e0b';
  if (type === 'project') return '#e5e5e5';
  const colors: Record<string, string> = {
    backlog: '#6b7280',
    ready: '#3b82f6',
    in_progress: '#f59e0b',
    blocked: '#ef4444',
    done: '#22c55e',
  };
  return colors[status ?? ''] ?? '#6b7280';
}
