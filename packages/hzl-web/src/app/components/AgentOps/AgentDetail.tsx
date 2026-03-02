import type { AgentRosterItem, AgentEvent } from '../../api/types';
import { formatDuration } from '../../utils/format';
import EventTimeline from './EventTimeline';

interface AgentDetailProps {
  agent: AgentRosterItem | null;
  events: AgentEvent[] | null;
  total: number;
  onLoadMore: () => void;
  loading: boolean;
}

export default function AgentDetail({
  agent,
  events,
  total,
  onLoadMore,
  loading,
}: AgentDetailProps) {
  if (!agent) {
    return (
      <div className="agent-detail-empty">
        <span className="agent-detail-empty-arrow">&larr;</span>
        <span>Select an agent to view details</span>
      </div>
    );
  }

  const now = Date.now();
  const primaryTask = agent.tasks.length > 0 ? agent.tasks[0] : null;
  const taskDurationMs = primaryTask ? now - Date.parse(primaryTask.claimedAt) : null;
  const progress = primaryTask?.progress ?? null;
  const tasksOwned = agent.tasks.length;

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

      {/* Event timeline */}
      <div className="agent-detail-timeline">
        <div className="agent-detail-section-label">Activity</div>
        <EventTimeline
          events={events}
          total={total}
          onLoadMore={onLoadMore}
          loading={loading}
        />
      </div>

      {/* Metrics section */}
      <div className="agent-detail-metrics">
        <div className="agent-detail-section-label">Metrics</div>
        <div className="agent-detail-metrics-grid">
          {agent.isActive && taskDurationMs !== null && (
            <div className="agent-detail-metric-card">
              <span className="agent-detail-metric-label">Task duration</span>
              <span className="agent-detail-metric-value">
                {formatDuration(taskDurationMs, '<1m')}
              </span>
            </div>
          )}
          <div className="agent-detail-metric-card">
            <span className="agent-detail-metric-label">Events</span>
            <span className="agent-detail-metric-value">{total}</span>
          </div>
          {progress !== null && (
            <div className="agent-detail-metric-card">
              <span className="agent-detail-metric-label">Progress</span>
              <span className="agent-detail-metric-value">{progress}%</span>
            </div>
          )}
          {tasksOwned > 0 && (
            <div className="agent-detail-metric-card">
              <span className="agent-detail-metric-label">Tasks owned</span>
              <span className="agent-detail-metric-value">{tasksOwned}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
