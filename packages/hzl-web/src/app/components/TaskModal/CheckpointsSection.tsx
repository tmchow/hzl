import { formatTime } from '../../utils/format';

interface Checkpoint {
  name: string;
  data: Record<string, unknown>;
  timestamp: string;
}

const DISPLAY_LIMIT = 15;

interface CheckpointsSectionProps {
  checkpoints: Checkpoint[];
  showAll: boolean;
  onShowAll: () => void;
}

export default function CheckpointsSection({ checkpoints, showAll, onShowAll }: CheckpointsSectionProps) {
  if (checkpoints.length === 0) {
    return <div className="empty-column">No checkpoints</div>;
  }

  const hasMore = checkpoints.length > DISPLAY_LIMIT && !showAll;
  const visible = hasMore ? checkpoints.slice(-DISPLAY_LIMIT) : checkpoints;
  const hiddenCount = Math.max(0, checkpoints.length - DISPLAY_LIMIT);

  return (
    <div className="modal-checkpoint-list">
      {hasMore && (
        <button className="show-more-btn" onClick={onShowAll}>
          Show {hiddenCount} earlier checkpoint{hiddenCount === 1 ? '' : 's'}
        </button>
      )}
      {visible.map((cp, i) => {
        const hasData = cp.data && Object.keys(cp.data).length > 0;
        return (
          <div className="modal-checkpoint-entry" key={i}>
            <div className="modal-checkpoint-header">
              <span className="modal-checkpoint-name">{cp.name}</span>
              <span className="modal-entry-time">{formatTime(cp.timestamp)}</span>
            </div>
            {hasData && (
              <pre className="modal-checkpoint-data">
                {JSON.stringify(cp.data, null, 2)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
