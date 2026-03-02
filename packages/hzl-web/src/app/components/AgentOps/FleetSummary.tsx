import type { AgentRosterItem } from '../../api/types';

interface FleetSummaryProps {
  agents: AgentRosterItem[];
}

export default function FleetSummary({ agents }: FleetSummaryProps) {
  if (agents.length === 0) {
    return (
      <span className="agent-ops-fleet-label">No agents found</span>
    );
  }

  const active = agents.filter((a) => a.isActive).length;
  const idle = agents.length - active;

  return (
    <span className="agent-ops-fleet-label">
      <span
        className="agent-ops-fleet-dot"
        style={{ background: 'var(--status-in-progress)' }}
      />
      {active} active
      <span className="agent-ops-fleet-separator">&middot;</span>
      <span
        className="agent-ops-fleet-dot"
        style={{ background: 'var(--status-backlog)' }}
      />
      {idle} idle
    </span>
  );
}
