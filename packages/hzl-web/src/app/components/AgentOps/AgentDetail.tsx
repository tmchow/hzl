import type { AgentRosterItem, AgentEvent, AgentTaskSummary, AgentRosterTaskCounts } from '../../api/types';
import EventTimeline from './EventTimeline';

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
}: AgentDetailProps) {
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

      {/* Assigned tasks section */}
      {agentTasks && agentTasks.length > 0 && (
        <div className="agent-detail-tasks">
          <div className="agent-detail-section-label">Assigned Tasks</div>
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
          <div className="agent-detail-section-label">Assigned Tasks</div>
          <div className="agent-detail-tasks-empty">No active tasks</div>
        </div>
      )}

      {/* Event timeline */}
      <div className="agent-detail-timeline">
        <div className="agent-detail-section-label">Activity</div>
        <EventTimeline
          events={events}
          total={total}
          onLoadMore={onLoadMore}
          loading={loading}
          onTaskClick={onTaskClick}
        />
      </div>
    </div>
  );
}
