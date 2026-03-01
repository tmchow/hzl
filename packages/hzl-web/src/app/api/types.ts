/** Task item as returned by GET /api/tasks */
export interface TaskListItem {
  task_id: string;
  title: string;
  project: string;
  status: string;
  priority: number;
  parent_id: string | null;
  description: string | null;
  tags: string[];
  due_at: string | null;
  assignee: string | null;
  progress: number | null;
  created_at: string;
  updated_at: string;
  blocked_by: string[] | null;
  subtask_count: number;
  subtask_total: number;
}

export interface TaskListResponse {
  tasks: TaskListItem[];
  since?: string;
  project?: string;
  due_month?: string;
}

/** Task detail as returned by GET /api/tasks/:id */
export interface TaskDetail {
  task_id: string;
  title: string;
  project: string;
  status: string;
  priority: number;
  parent_id: string | null;
  description: string | null;
  links: string[];
  tags: string[];
  due_at: string | null;
  metadata: Record<string, unknown>;
  claimed_at: string | null;
  assignee: string | null;
  progress: number | null;
  lease_until: string | null;
  created_at: string;
  updated_at: string;
  blocked_by: string[];
}

export interface TaskDetailResponse {
  task: TaskDetail;
}

/** Event as returned by GET /api/events */
export interface ActivityEvent {
  id: number;
  event_id: string;
  task_id: string;
  type: string;
  data: Record<string, unknown>;
  author: string | null;
  agent_id: string | null;
  timestamp: string;
  task_title: string | null;
  task_assignee: string | null;
  task_description: string | null;
  task_status: string | null;
}

export interface EventListResponse {
  events: ActivityEvent[];
}

/** Task-scoped event as returned by GET /api/tasks/:id/events */
export interface TaskEvent {
  id: number;
  event_id: string;
  task_id: string;
  type: string;
  data: Record<string, unknown>;
  author: string | null;
  agent_id: string | null;
  timestamp: string;
}

export interface TaskEventListResponse {
  events: TaskEvent[];
}

/** Stats as returned by GET /api/stats */
export interface Stats {
  total: number;
  by_status: Record<string, number>;
  projects: string[];
}

/** SSE event payloads */
export interface SSEReadyPayload {
  live: true;
  latest_event_id: number;
}

export interface SSEUpdatePayload {
  latest_event_id: number;
}

/** API error response */
export interface ApiError {
  error: string;
}
