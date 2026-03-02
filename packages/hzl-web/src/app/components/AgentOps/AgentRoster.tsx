import type { AgentRosterItem } from '../../api/types';

interface AgentRosterProps {
  agents: AgentRosterItem[];
  selectedAgent: string | null;
  onSelectAgent: (agent: string | null) => void;
}

/**
 * Format a duration in milliseconds as a human-readable relative time.
 * <1m -> "just now", minutes -> "Nm", hours -> "Nh Nm"
 */
function formatDuration(ms: number): string {
  if (ms < 0) return 'just now';
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return 'just now';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export default function AgentRoster({
  agents,
  selectedAgent,
  onSelectAgent,
}: AgentRosterProps) {
  if (agents.length === 0) {
    return (
      <div className="agent-roster-empty">
        No agents found
      </div>
    );
  }

  return (
    <div className="agent-roster">
      {agents.map((agent) => {
        const isSelected = selectedAgent === agent.agent;
        const now = Date.now();

        return (
          <button
            key={agent.agent}
            type="button"
            className={`agent-roster-row${isSelected ? ' selected' : ''}`}
            onClick={() => onSelectAgent(agent.agent)}
          >
            <span
              className="agent-roster-dot"
              style={{
                background: agent.isActive
                  ? 'var(--status-in-progress)'
                  : 'var(--status-backlog)',
              }}
            />
            <div className="agent-roster-info">
              <span className="agent-roster-id">{agent.agent}</span>
              {agent.isActive && agent.tasks.length > 0 ? (
                <span className="agent-roster-task">
                  <span className="agent-roster-task-title">
                    {agent.tasks[0].title}
                  </span>
                  {agent.tasks.length > 1 && (
                    <span className="agent-roster-more">
                      (+{agent.tasks.length - 1} more)
                    </span>
                  )}
                </span>
              ) : (
                <span className="agent-roster-idle">
                  idle since {formatDuration(now - Date.parse(agent.lastActivity))}
                </span>
              )}
            </div>
            <span className="agent-roster-duration">
              {agent.isActive && agent.tasks.length > 0
                ? formatDuration(now - Date.parse(agent.tasks[0].claimedAt))
                : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
