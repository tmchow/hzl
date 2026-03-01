import type { TaskListItem } from '../../api/types';
import type { EmojiInfo } from '../../utils/emoji';
import { STATUS_LABELS } from '../../utils/board';
import Card from '../Card/Card';

interface ColumnProps {
  status: string;
  tasks: TaskListItem[];
  emojiMap: Map<string, EmojiInfo>;
  showSubtasks: boolean;
  collapsedParents: Set<string>;
  onToggleCollapse: (parentId: string) => void;
  onCardClick: (taskId: string) => void;
  emptyMessage: string;
}

export default function Column({
  status,
  tasks,
  emojiMap,
  showSubtasks,
  collapsedParents,
  onToggleCollapse,
  onCardClick,
  emptyMessage,
}: ColumnProps) {
  return (
    <div className="column" data-status={status}>
      <div className="column-header">
        <span className="column-title">{STATUS_LABELS[status] || status}</span>
        <span className="column-count">{tasks.length}</span>
      </div>
      <div className="column-cards">
        {tasks.length === 0 ? (
          <div className="empty-column">{emptyMessage}</div>
        ) : (
          tasks.map((task) => (
            <Card
              key={task.task_id}
              task={task}
              emojiInfo={emojiMap.get(task.task_id)}
              showSubtasks={showSubtasks}
              isCollapsed={collapsedParents.has(task.task_id)}
              onToggleCollapse={onToggleCollapse}
              onClick={onCardClick}
            />
          ))
        )}
      </div>
    </div>
  );
}
