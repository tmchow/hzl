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
  return (
    <div className="agent-ops">
      {/* Fleet summary bar — spans full width above both panels */}
      <div className="agent-ops-fleet-summary">
        <span className="agent-ops-fleet-placeholder">Fleet summary loading...</span>
      </div>

      <div className="agent-ops-panels">
        {/* Left panel — agent roster */}
        <div className="agent-ops-roster">
          <div className="agent-ops-placeholder">
            Agent roster
            {project && <span> (project: {project})</span>}
            <br />
            <span className="agent-ops-placeholder-hint">Since: {since}</span>
          </div>
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
