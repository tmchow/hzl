import type { ActivityEvent } from '../../api/types';
import { formatTime, formatEventType, formatEventDetail, getEventActor } from '../../utils/format';
import './ActivityPanel.css';

interface ActivityPanelProps {
  open: boolean;
  events: ActivityEvent[];
  assignees: Array<{ name: string; count: number }>;
  assignee: string;
  onAssigneeChange: (value: string) => void;
  keyword: string;
  onKeywordChange: (value: string) => void;
  onClose: () => void;
  onEventClick: (taskId: string) => void;
}

export default function ActivityPanel({
  open,
  events,
  assignees,
  assignee,
  onAssigneeChange,
  keyword,
  onKeywordChange,
  onClose,
  onEventClick,
}: ActivityPanelProps) {
  return (
    <div className={`activity-panel${open ? ' open' : ''}`}>
      <div className="activity-header">
        <span className="activity-title">Activity</span>
        <button className="activity-close" onClick={onClose}>&times;</button>
      </div>
      <div className="activity-filters">
        <select
          value={assignee}
          onChange={(e) => onAssigneeChange(e.target.value)}
        >
          <option value="">Any Agent</option>
          {assignees.map((a) => (
            <option key={a.name} value={a.name}>{a.name} ({a.count})</option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search title/description (3+ chars)"
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
        />
      </div>
      <div className="activity-list">
        {events.length === 0 ? (
          <div className="empty-column">No recent activity</div>
        ) : (
          events.map((event) => {
            const actor = getEventActor(event);
            const actionDetail = formatEventDetail(event);
            const detail = actionDetail ? `${actionDetail} by ${actor}` : `by ${actor}`;

            return (
              <div
                className="activity-item"
                key={event.event_id}
                onClick={() => event.task_id && onEventClick(event.task_id)}
              >
                <div className="activity-item-header">
                  <span className={`activity-type ${event.type}`}>
                    {formatEventType(event.type)}
                  </span>
                  <span className="activity-time">{formatTime(event.timestamp)}</span>
                </div>
                <div className="activity-task">
                  {event.task_title || event.task_id.slice(0, 8)}
                </div>
                {detail && <div className="activity-detail">{detail}</div>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
