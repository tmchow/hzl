import { useState, useEffect } from 'react';
import type { AgentRosterItem, AgentEvent, AgentTaskSummary, AgentRosterTaskCounts, CronJob, CronStatus, GatewayStatus, GatewayAgent, CronJobCreateParams, CronJobUpdatePatch } from '../../api/types';
import EventTimeline from './EventTimeline';
import CronJobsSection from './CronJobsSection';

type DetailTab = 'tasks' | 'activity' | 'cron';

const STATUS_ORDER = ['in_progress', 'blocked', 'ready', 'backlog'] as const;
const STATUS_LABELS: Record<string, string> = {
  in_progress: 'In Progress',
  blocked: 'Blocked',
  ready: 'Ready',
  backlog: 'Backlog',
};

interface AgentDetailProps {
  agent: AgentRosterItem | null;
  events: AgentEvent[] | null;
  total: number;
  onLoadMore: () => void;
  loading: boolean;
  agentTasks: AgentTaskSummary[] | null;
  agentTaskCounts: AgentRosterTaskCounts | null;
  onTaskClick?: (taskId: string) => void;
  // Gateway / cron props
  gatewayStatus: GatewayStatus;
  gatewayLoading: boolean;
  gatewayError: string | null;
  onConfigureGateway: (url: string, token?: string) => Promise<void>;
  cronJobs: CronJob[];
  cronJobsLoading: boolean;
  cronJobsError: string | null;
  cronStatus: CronStatus | null;
  onToggleCronJob: (jobId: string, enabled: boolean) => Promise<void>;
  onDeleteCronJob: (jobId: string) => Promise<void>;
  onRunCronJob: (jobId: string) => Promise<unknown>;
  onCreateCronJob: (params: CronJobCreateParams) => Promise<CronJob>;
  onUpdateCronJob: (jobId: string, patch: CronJobUpdatePatch) => Promise<CronJob>;
  onRefreshCronJobs: () => void;
  isGatewayAgent: boolean;
  gatewayAgents: GatewayAgent[];
}

export default function AgentDetail({
  agent,
  events,
  total,
  onLoadMore,
  loading,
  agentTasks,
  agentTaskCounts,
  onTaskClick,
  gatewayStatus,
  gatewayLoading,
  gatewayError,
  onConfigureGateway,
  cronJobs,
  cronJobsLoading,
  cronJobsError,
  cronStatus,
  onToggleCronJob,
  onDeleteCronJob,
  onRunCronJob,
  onCreateCronJob,
  onUpdateCronJob,
  onRefreshCronJobs,
  isGatewayAgent,
  gatewayAgents,
}: AgentDetailProps) {
  const availableTabs: DetailTab[] = isGatewayAgent
    ? ['tasks', 'activity', 'cron']
    : ['tasks', 'activity'];
  const [activeTab, setActiveTab] = useState<DetailTab>('tasks');

  // Reset tab when switching agents (or if cron tab active but agent is not a gateway agent)
  useEffect(() => {
    if (!isGatewayAgent && activeTab === 'cron') {
      setActiveTab('tasks');
    }
  }, [isGatewayAgent, activeTab]);

  if (!agent) {
    return (
      <div className="agent-detail-empty">
        <span className="agent-detail-empty-arrow">&larr;</span>
        <span>Select an agent to view details</span>
      </div>
    );
  }

  const primaryTask = agent.tasks.length > 0 ? agent.tasks[0] : null;
  const counts = agentTaskCounts ?? agent.taskCounts;

  // Group tasks by status for display
  const tasksByStatus = new Map<string, AgentTaskSummary[]>();
  if (agentTasks) {
    for (const task of agentTasks) {
      const list = tasksByStatus.get(task.status) ?? [];
      list.push(task);
      tasksByStatus.set(task.status, list);
    }
  }

  const tabLabels: Record<DetailTab, string> = {
    tasks: 'Tasks',
    activity: 'Activity',
    cron: 'Cron Jobs',
  };

  const tabBadges: Record<DetailTab, string | null> = {
    tasks: agentTasks ? String(agentTasks.length) : null,
    activity: total > 0 ? String(total) : null,
    cron: cronJobs.length > 0 ? String(cronJobs.length) : null,
  };

  return (
    <div className="agent-detail">
      {/* Agent header */}
      <div className="agent-detail-header">
        <div className="agent-detail-header-top">
          <span className="agent-detail-id">{agent.agent}</span>
          <span
            className={`agent-detail-status-badge ${agent.isActive ? 'active' : 'idle'}`}
          >
            {agent.isActive ? 'active' : 'idle'}
          </span>
        </div>
        {primaryTask && (
          <div className="agent-detail-current-task">
            {primaryTask.title}
            {agent.tasks.length > 1 && (
              <span className="agent-detail-task-count">
                +{agent.tasks.length - 1} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Metrics — compact status bar */}
      <div className="agent-detail-metrics">
        <div className="agent-detail-metrics-grid">
          <div className="agent-detail-metric-card">
            <span className="agent-detail-metric-label">In Progress</span>
            <span className="agent-detail-metric-value status-in-progress">{counts.in_progress}</span>
          </div>
          <div className="agent-detail-metric-card">
            <span className="agent-detail-metric-label">Ready</span>
            <span className="agent-detail-metric-value status-ready">{counts.ready}</span>
          </div>
          <div className="agent-detail-metric-card">
            <span className="agent-detail-metric-label">Blocked</span>
            <span className="agent-detail-metric-value status-blocked">{counts.blocked}</span>
          </div>
          <div className="agent-detail-metric-card">
            <span className="agent-detail-metric-label">Backlog</span>
            <span className="agent-detail-metric-value status-backlog">{counts.backlog}</span>
          </div>
          <div className="agent-detail-metric-card">
            <span className="agent-detail-metric-label">Done</span>
            <span className="agent-detail-metric-value status-done">{counts.done}</span>
          </div>
          <div className="agent-detail-metric-card">
            <span className="agent-detail-metric-label">Events</span>
            <span className="agent-detail-metric-value">{total}</span>
          </div>
        </div>
      </div>

      {/* Segmented control */}
      <div className="agent-detail-tabs">
        {availableTabs.map(tab => (
          <button
            key={tab}
            className={`agent-detail-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tabLabels[tab]}
            {tabBadges[tab] && (
              <span className="agent-detail-tab-badge">{tabBadges[tab]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="agent-detail-tab-content">
        {activeTab === 'tasks' && (
          <>
            {agentTasks && agentTasks.length > 0 && (
              <div className="agent-detail-tasks">
                <div className="agent-detail-tasks-list">
                  {STATUS_ORDER.map(status => {
                    const tasks = tasksByStatus.get(status);
                    if (!tasks || tasks.length === 0) return null;
                    return (
                      <div key={status} className="agent-detail-task-group">
                        <div className="agent-detail-task-group-label">
                          <span className={`agent-detail-task-status-dot status-dot-${status}`} />
                          {STATUS_LABELS[status]}
                          <span className="agent-detail-task-group-count">{tasks.length}</span>
                        </div>
                        {tasks.map(task => (
                          <div
                            key={task.taskId}
                            className={`agent-detail-task-row${onTaskClick ? ' clickable' : ''}`}
                            onClick={() => onTaskClick?.(task.taskId)}
                          >
                            <span className="agent-detail-task-title">{task.title}</span>
                            <span className="agent-detail-task-project">{task.project}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {agentTasks && agentTasks.length === 0 && (
              <div className="agent-detail-tasks">
                <div className="agent-detail-tasks-empty">No active tasks</div>
              </div>
            )}
          </>
        )}

        {activeTab === 'activity' && (
          <div className="agent-detail-timeline">
            <EventTimeline
              events={events}
              total={total}
              onLoadMore={onLoadMore}
              loading={loading}
              onTaskClick={onTaskClick}
            />
          </div>
        )}

        {activeTab === 'cron' && isGatewayAgent && (
          <CronJobsSection
            gatewayStatus={gatewayStatus}
            gatewayLoading={gatewayLoading}
            gatewayError={gatewayError}
            onConfigureGateway={onConfigureGateway}
            jobs={cronJobs}
            jobsLoading={cronJobsLoading}
            jobsError={cronJobsError}
            cronStatus={cronStatus}
            onToggleJob={onToggleCronJob}
            onDeleteJob={onDeleteCronJob}
            onRunJob={onRunCronJob}
            onCreateJob={onCreateCronJob}
            onUpdateJob={onUpdateCronJob}
            onRefresh={onRefreshCronJobs}
            agentId={agent.agent}
            gatewayAgents={gatewayAgents}
          />
        )}
      </div>
    </div>
  );
}
