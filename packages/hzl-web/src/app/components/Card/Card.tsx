import type { TaskListItem } from '../../api/types';
import type { EmojiInfo } from '../../utils/emoji';
import { getTaskFamilyColor } from '../../utils/emoji';
import { getAssigneeValue, truncateCardLabel, formatTimeRemaining } from '../../utils/format';
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
  const isBlocked = task.blocked_by && task.blocked_by.length > 0;
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
        <div className="card-header-right">
          <span className="card-project" title={task.project}>{task.project}</span>
          {task.progress != null && task.progress > 0 && (
            <span className={task.progress >= 100 ? 'card-progress complete' : 'card-progress'}>
              {task.progress}%
            </span>
          )}
        </div>
      </div>
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
      <div className="card-meta">
        <span
          className={hasAssignee ? 'card-assignee assigned' : 'card-assignee unassigned'}
          title={assigneeText}
        >
          {assigneeCardText}
        </span>
      </div>
      {isBlocked && (
        <div className="card-blocked">
          Blocked by: {task.blocked_by!.map((id) => id.slice(0, 8)).join(', ')}
        </div>
      )}
      {task.status === 'in_progress' && (task as unknown as { lease_until?: string }).lease_until && (
        <div className="card-lease">
          {formatTimeRemaining((task as unknown as { lease_until: string }).lease_until)}
        </div>
      )}
    </div>
  );
}
