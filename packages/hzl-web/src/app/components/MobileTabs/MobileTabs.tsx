import type { TaskListItem } from '../../api/types';
import type { EmojiInfo } from '../../utils/emoji';
import { COLUMNS, STATUS_LABELS, groupTasksByStatus } from '../../utils/board';
import Card from '../Card/Card';
import './MobileTabs.css';

interface MobileTabsProps {
  tasks: TaskListItem[];
  emojiMap: Map<string, EmojiInfo>;
  showSubtasks: boolean;
  collapsedParents: Set<string>;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onToggleCollapse: (parentId: string) => void;
  onCardClick: (taskId: string) => void;
  searchQuery: string;
}

export default function MobileTabs({
  tasks,
  emojiMap,
  showSubtasks,
  collapsedParents,
  activeTab,
  onTabChange,
  onToggleCollapse,
  onCardClick,
  searchQuery,
}: MobileTabsProps) {
  const grouped = groupTasksByStatus(tasks);
  const emptyMessage = searchQuery ? 'No matching tasks' : 'No tasks';

  return (
    <>
      <div className="mobile-tabs">
        {COLUMNS.map((status) => (
          <div
            key={status}
            className={`mobile-tab${activeTab === status ? ' active' : ''}`}
            onClick={() => onTabChange(status)}
          >
            {STATUS_LABELS[status]}
            <span className="mobile-tab-badge">{(grouped[status] || []).length}</span>
          </div>
        ))}
      </div>
      <div className="mobile-cards-container">
        {COLUMNS.map((status) => {
          const statusTasks = grouped[status] || [];
          return (
            <div
              key={status}
              className={`mobile-cards${activeTab === status ? ' active' : ''}`}
              data-status={status}
            >
              {statusTasks.length === 0 ? (
                <div className="empty-column">{emptyMessage}</div>
              ) : (
                statusTasks.map((task) => (
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
          );
        })}
      </div>
    </>
  );
}
