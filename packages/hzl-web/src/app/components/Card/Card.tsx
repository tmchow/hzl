import type { TaskListItem } from '../../api/types';
import type { EmojiInfo } from '../../utils/emoji';
import { getTaskFamilyColor } from '../../utils/emoji';
import { getAssigneeValue, truncateCardLabel } from '../../utils/format';
import './Card.css';

interface CardProps {
  task: TaskListItem;
  emojiInfo?: EmojiInfo;
  showSubtasks: boolean;
  isCollapsed: boolean;
  onToggleCollapse: (parentId: string) => void;
  onClick: (taskId: string) => void;
}

export default function Card({
  task,
  emojiInfo,
  showSubtasks,
  isCollapsed,
  onToggleCollapse,
  onClick,
}: CardProps) {
  const isParentTask = (task.subtask_total ?? 0) > 0;
  const parentStyle = isParentTask
    ? { '--family-color': getTaskFamilyColor(task.task_id) } as React.CSSProperties
    : undefined;

  const assignee = getAssigneeValue(task.assignee);
  const hasAssignee = assignee.length > 0;
  const assigneeText = hasAssignee ? assignee : 'Unassigned';
  const assigneeCardText = truncateCardLabel(assigneeText, 10);

  const visibleCount = task.subtask_count ?? 0;
  const totalCount = task.subtask_total ?? visibleCount;

  return (
    <div
      className={`card${isParentTask ? ' card-parent' : ''}`}
      style={parentStyle}
      onClick={() => onClick(task.task_id)}
    >
      <div className="card-header">
        <div className="card-header-left">
          {emojiInfo && (
            <span className="card-emoji">
              {emojiInfo.suffix
                ? `${emojiInfo.emoji}-${emojiInfo.suffix}`
                : emojiInfo.emoji}
            </span>
          )}
          <span className="card-id">{task.task_id.slice(0, 8)}</span>
        </div>
        <span className="card-project" title={task.project}>{task.project}</span>
      </div>
      {task.progress != null && task.progress > 0 && (
        <div className="card-progress-row">
          <div className="card-progress-track">
            <div
              className={`card-progress-fill${task.progress >= 100 ? ' complete' : ''}`}
              style={{ width: `${Math.min(task.progress, 100)}%` }}
            />
          </div>
          <span className={`card-progress-label${task.progress >= 100 ? ' complete' : ''}`}>
            {task.progress}%
          </span>
        </div>
      )}
      <div className="card-title">{task.title}</div>
      {totalCount > 0 && (
        showSubtasks ? (
          <button
            type="button"
            className="card-subtask-toggle"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleCollapse(task.task_id);
            }}
            aria-expanded={!isCollapsed}
            title={isCollapsed ? 'Expand subtasks' : 'Collapse subtasks'}
          >
            {isCollapsed ? '\u25B6' : '\u25BC'}{' '}
            [{visibleCount === totalCount
              ? `${visibleCount} ${totalCount === 1 ? 'subtask' : 'subtasks'}`
              : `${visibleCount}/${totalCount} ${totalCount === 1 ? 'subtask' : 'subtasks'}`
            }]
          </button>
        ) : (
          <div className="card-subtask-count">
            [{visibleCount === totalCount
              ? `${visibleCount} ${totalCount === 1 ? 'subtask' : 'subtasks'}`
              : `${visibleCount}/${totalCount} ${totalCount === 1 ? 'subtask' : 'subtasks'}`
            }]
          </div>
        )
      )}
      {hasAssignee && (
        <div className="card-meta">
          <span
            className="card-assignee assigned"
            title={assigneeText}
          >
            {assigneeCardText}
          </span>
        </div>
      )}
    </div>
  );
}
