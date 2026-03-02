import { useState, useEffect, useMemo } from 'react';
import { useAgents } from '../../hooks/useAgents';
import { useAgentEvents } from '../../hooks/useAgentEvents';
import AgentRoster from './AgentRoster';
import AgentDetail from './AgentDetail';
import './AgentOps.css';

interface AgentOpsViewProps {
  selectedAgent: string | null;
  onSelectAgent: (agent: string | null) => void;
  since: string;
  project: string;
  refreshKey: number;
  onAgentCounts?: (active: number, idle: number) => void;
  onTaskClick?: (taskId: string) => void;
}

export default function AgentOpsView({
  selectedAgent,
  onSelectAgent,
  since,
  project,
  refreshKey,
  onAgentCounts,
  onTaskClick,
}: AgentOpsViewProps) {
  // Data fetching — only runs when this component is mounted (agents view active)
  const { agents, loading: agentsLoading, error: agentsError, refresh: refreshAgents } = useAgents({
    since,
    project: project || undefined,
  });
  const {
    events: agentEvents,
    total: agentEventsTotal,
    loading: agentEventsLoading,
    loadMore: loadMoreAgentEvents,
    refresh: refreshAgentEvents,
  } = useAgentEvents(selectedAgent);

  // SSE-triggered refresh via refreshKey from parent
  useEffect(() => {
    if (refreshKey > 0) {
      refreshAgents();
      refreshAgentEvents();
    }
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 60-second tick to update duration displays
  const [, setDurationTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setDurationTick(n => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Report agent counts to parent for top-bar display
  useEffect(() => {
    if (!onAgentCounts) return;
    const active = agents.filter((a) => a.isActive).length;
    onAgentCounts(active, agents.length - active);
  }, [agents, onAgentCounts]);

  const selectedAgentData = useMemo(() => {
    if (!selectedAgent) return null;
    return agents.find((a) => a.agent === selectedAgent) ?? null;
  }, [agents, selectedAgent]);

  return (
    <div className="agent-ops">
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
            onLoadMore={loadMoreAgentEvents}
            loading={agentEventsLoading}
            onTaskClick={onTaskClick}
          />
        </div>
      </div>
    </div>
  );
}
