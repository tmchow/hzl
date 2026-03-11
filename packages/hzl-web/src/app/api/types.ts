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
  stale: boolean;
  stale_minutes: number | null;
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
  stale_after_minutes: number | null;
  claimed_at: string | null;
  assignee: string | null;
  progress: number | null;
  lease_until: string | null;
  created_at: string;
  updated_at: string;
  blocked_by: Array<{ task_id: string; title: string }>;
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
  window: string;
  generated_at: string;
  projects: string[];
  queue: {
    backlog: number;
    ready: number;
    in_progress: number;
    blocked: number;
    done: number;
    archived: number;
    available: number;
    stale: number;
    expired_leases: number;
  };
  completions: {
    total: number;
    by_agent: Record<string, number>;
  };
  execution_time_ms: {
    count: number;
    min: number | null;
    max: number | null;
    mean: number | null;
    excluded_without_start: number;
  };
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

/** Agent roster item as returned by GET /api/agents */
export interface AgentRosterTask {
  taskId: string;
  title: string;
  claimedAt: string;
  status: string;
  progress: number | null;
  stale: boolean;
  stale_minutes: number | null;
}

export interface AgentRosterTaskCounts {
  backlog: number;
  ready: number;
  in_progress: number;
  blocked: number;
  done: number;
}

export interface AgentRosterItem {
  agent: string;
  isActive: boolean;
  tasks: AgentRosterTask[];
  lastActivity: string;
  taskCounts: AgentRosterTaskCounts;
}

export interface AgentRosterResponse {
  agents: AgentRosterItem[];
}

/** Agent event as returned by GET /api/agents/:id/events */
export interface AgentEvent {
  id: number;
  eventId: string;
  taskId: string;
  type: string;
  data: Record<string, unknown>;
  author?: string;
  agentId?: string;
  timestamp: string;
  taskTitle: string;
  taskStatus: string;
}

export interface AgentEventsResponse {
  events: AgentEvent[];
  total: number;
}

/** Agent task as returned by GET /api/agents/:id/tasks */
export interface AgentTaskSummary {
  taskId: string;
  title: string;
  project: string;
  status: string;
  priority: number;
  progress: number | null;
  claimedAt: string | null;
  stale: boolean;
  staleMinutes: number | null;
}

export interface AgentTasksResponse {
  tasks: AgentTaskSummary[];
  counts: AgentRosterTaskCounts;
}

/** Gateway status */
export type GatewayStatus = 'connected' | 'connecting' | 'disconnected' | 'unconfigured';

/** Agent as returned by the gateway's agents.list RPC */
export interface GatewayAgent {
  id: string;
  name?: string;
  model?: string;
  status?: string;
  [key: string]: unknown;
}

/** Cron job schedule */
export interface CronSchedule {
  kind: string;
  expr: string;
  tz?: string;
  staggerMs?: number;
}

/** Cron job payload */
export interface CronPayload {
  kind: string;
  message?: string;
  text?: string;
  model?: string;
  thinking?: boolean;
  timeoutSeconds?: number;
  lightContext?: boolean;
}

/** Cron job delivery */
export interface CronDelivery {
  mode?: string;
  channel?: string;
  to?: string;
  bestEffort?: boolean;
}

/** Cron job state (runtime info) */
export interface CronJobState {
  nextRunAtMs?: number | null;
  lastRunAtMs?: number | null;
  lastStatus?: string | null;
  lastDurationMs?: number | null;
  consecutiveErrors?: number;
  lastError?: string | null;
  lastDelivered?: boolean | null;
  lastDeliveryStatus?: string | null;
}

/** Cron job as returned by the gateway */
export interface CronJob {
  id: string;
  agentId?: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: CronSchedule;
  sessionTarget?: string;
  wakeMode?: string;
  payload: CronPayload;
  delivery?: CronDelivery;
  state?: CronJobState;
  createdAtMs?: number;
  updatedAtMs?: number;
}

/** Params for creating a cron job */
export interface CronJobCreateParams {
  name: string;
  enabled?: boolean;
  schedule: CronSchedule;
  payload: CronPayload;
  description?: string;
  sessionTarget?: string;
  wakeMode?: string;
  agentId?: string;
  delivery?: CronDelivery;
}

/** Params for updating a cron job */
export interface CronJobUpdatePatch {
  name?: string;
  enabled?: boolean;
  schedule?: CronSchedule;
  payload?: CronPayload;
  description?: string;
  sessionTarget?: string;
  wakeMode?: string;
  agentId?: string;
  delivery?: CronDelivery;
}

/** Cron scheduler status */
export interface CronStatus {
  enabled: boolean;
  running?: boolean;
  jobCount?: number;
}

/** Search result item as returned by GET /api/search */
export interface SearchTaskResult {
  task_id: string;
  title: string;
  project: string;
  status: string;
  description: string | null;
  priority: number;
  rank: number;
}

export interface SearchResponse {
  tasks: SearchTaskResult[];
  total: number;
  limit: number;
  offset: number;
}
