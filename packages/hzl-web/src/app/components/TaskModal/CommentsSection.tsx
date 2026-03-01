import { formatTime } from '../../utils/format';

interface Comment {
  text: string;
  author: string | null;
  agent_id: string | null;
  timestamp: string;
}

const DISPLAY_LIMIT = 15;

interface CommentsSectionProps {
  comments: Comment[];
  showAll: boolean;
  onShowAll: () => void;
}

export default function CommentsSection({ comments, showAll, onShowAll }: CommentsSectionProps) {
  if (comments.length === 0) {
    return <div className="empty-column">No comments</div>;
  }

  const hasMore = comments.length > DISPLAY_LIMIT && !showAll;
  const visible = hasMore ? comments.slice(-DISPLAY_LIMIT) : comments;
  const hiddenCount = Math.max(0, comments.length - DISPLAY_LIMIT);

  return (
    <div className="modal-comments">
      {hasMore && (
        <button className="show-more-btn" onClick={onShowAll}>
          Show {hiddenCount} earlier comment{hiddenCount === 1 ? '' : 's'}
        </button>
      )}
      {visible.map((c, i) => (
        <div className="comment" key={i}>
          <div className="comment-header">
            <span className="comment-author">{c.agent_id || c.author || 'Unknown'}</span>
            <span>{formatTime(c.timestamp)}</span>
          </div>
          <div className="comment-text">{c.text}</div>
        </div>
      ))}
    </div>
  );
}
