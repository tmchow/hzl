import { useAgents } from '../../hooks/useAgents';
import AgentRoster from './AgentRoster';
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

  return (
    <div className="agent-ops">
      {/* Fleet summary bar — spans full width above both panels */}
      <div className="agent-ops-fleet-summary">
        <span className="agent-ops-fleet-placeholder">Fleet summary loading...</span>
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
          <div className="agent-ops-placeholder">
            {selectedAgent ? (
              <>Agent detail: {selectedAgent}</>
            ) : (
              <>Select an agent to view details</>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
