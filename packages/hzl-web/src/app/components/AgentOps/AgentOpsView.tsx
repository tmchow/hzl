import { useMemo } from 'react';
import { useAgents } from '../../hooks/useAgents';
import { useAgentEvents } from '../../hooks/useAgentEvents';
import AgentRoster from './AgentRoster';
import AgentDetail from './AgentDetail';
import FleetSummary from './FleetSummary';
import './AgentOps.css';

interface AgentOpsViewProps {
  selectedAgent: string | null;
  onSelectAgent: (agent: string | null) => void;
  project: string;
  since: string;
}

export default function AgentOpsView({
  selectedAgent,
  onSelectAgent,
  project,
  since,
}: AgentOpsViewProps) {
  const { agents, loading, error } = useAgents({
    since,
    project: project || undefined,
  });

  const { events, total, loading: eventsLoading, loadMore } = useAgentEvents(selectedAgent);

  const selectedAgentData = useMemo(() => {
    if (!selectedAgent) return null;
    return agents.find((a) => a.agent === selectedAgent) ?? null;
  }, [agents, selectedAgent]);

  return (
    <div className="agent-ops">
      {/* Fleet summary bar — spans full width above both panels */}
      <div className="agent-ops-fleet-summary">
        <FleetSummary agents={agents} />
      </div>

      <div className="agent-ops-panels">
        {/* Left panel — agent roster */}
        <div className="agent-ops-roster">
          {error ? (
            <div className="agent-ops-placeholder">
              <span>Failed to load agents</span>
              <span className="agent-ops-placeholder-hint">{error}</span>
            </div>
          ) : loading && agents.length === 0 ? (
            <div className="agent-ops-placeholder">
              <span>Loading agents...</span>
            </div>
          ) : (
            <AgentRoster
              agents={agents}
              selectedAgent={selectedAgent}
              onSelectAgent={onSelectAgent}
            />
          )}
        </div>

        {/* Right panel — agent detail */}
        <div className="agent-ops-detail">
          <AgentDetail
            agent={selectedAgentData}
            events={events}
            total={total}
            onLoadMore={loadMore}
            loading={eventsLoading}
          />
        </div>
      </div>
    </div>
  );
}
