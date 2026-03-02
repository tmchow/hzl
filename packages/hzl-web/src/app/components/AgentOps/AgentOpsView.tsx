import { useMemo } from 'react';
import type { AgentRosterItem, AgentEvent } from '../../api/types';
import AgentRoster from './AgentRoster';
import AgentDetail from './AgentDetail';
import FleetSummary from './FleetSummary';
import './AgentOps.css';

interface AgentOpsViewProps {
  selectedAgent: string | null;
  onSelectAgent: (agent: string | null) => void;
  agents: AgentRosterItem[];
  agentsLoading: boolean;
  agentsError: string | null;
  agentEvents: AgentEvent[] | null;
  agentEventsTotal: number;
  agentEventsLoading: boolean;
  onLoadMoreAgentEvents: () => void;
}

export default function AgentOpsView({
  selectedAgent,
  onSelectAgent,
  agents,
  agentsLoading,
  agentsError,
  agentEvents,
  agentEventsTotal,
  agentEventsLoading,
  onLoadMoreAgentEvents,
}: AgentOpsViewProps) {
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
          {agentsError ? (
            <div className="agent-ops-placeholder">
              <span>Failed to load agents</span>
              <span className="agent-ops-placeholder-hint">{agentsError}</span>
            </div>
          ) : agentsLoading && agents.length === 0 ? (
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
            events={agentEvents}
            total={agentEventsTotal}
            onLoadMore={onLoadMoreAgentEvents}
            loading={agentEventsLoading}
          />
        </div>
      </div>
    </div>
  );
}
