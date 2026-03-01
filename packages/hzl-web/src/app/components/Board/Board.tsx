import type { TaskListItem } from '../../api/types';
import type { EmojiInfo } from '../../utils/emoji';
import { COLUMNS, groupTasksByStatus } from '../../utils/board';
import Column from './Column';
import './Board.css';

interface BoardProps {
  tasks: TaskListItem[];
  emojiMap: Map<string, EmojiInfo>;
  showSubtasks: boolean;
  collapsedParents: Set<string>;
  columnVisibility: string[];
  searchQuery: string;
  onToggleCollapse: (parentId: string) => void;
  onCardClick: (taskId: string) => void;
}

export default function Board({
  tasks,
  emojiMap,
  showSubtasks,
  collapsedParents,
  columnVisibility,
  searchQuery,
  onToggleCollapse,
  onCardClick,
}: BoardProps) {
  const grouped = groupTasksByStatus(tasks);
  const emptyMessage = searchQuery ? 'No matching tasks' : 'No tasks';

  return (
    <main className="board">
      {COLUMNS.filter((col) => columnVisibility.includes(col)).map((status) => (
        <Column
          key={status}
          status={status}
          tasks={grouped[status] || []}
          emojiMap={emojiMap}
          showSubtasks={showSubtasks}
          collapsedParents={collapsedParents}
          onToggleCollapse={onToggleCollapse}
          onCardClick={onCardClick}
          emptyMessage={emptyMessage}
        />
      ))}
    </main>
  );
}
