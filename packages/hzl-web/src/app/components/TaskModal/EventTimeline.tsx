import type { TaskEvent } from '../../api/types';
import { formatTime, formatEventType, formatEventDetail, getEventActor } from '../../utils/format';

const DISPLAY_LIMIT = 20;

interface EventTimelineProps {
  events: TaskEvent[];
  showAll: boolean;
  onShowAll: () => void;
}

export default function EventTimeline({ events, showAll, onShowAll }: EventTimelineProps) {
  if (events.length === 0) {
    return <div className="empty-column">No activity</div>;
  }

  const hasMore = events.length > DISPLAY_LIMIT && !showAll;
  const visible = hasMore ? events.slice(-DISPLAY_LIMIT) : events;
  const display = [...visible].reverse();
  const hiddenCount = Math.max(0, events.length - DISPLAY_LIMIT);

  return (
    <div className="modal-task-activity-list">
      {hasMore && (
        <button className="show-more-btn" onClick={onShowAll}>
          Show {hiddenCount} earlier event{hiddenCount === 1 ? '' : 's'}
        </button>
      )}
      {display.map((event) => {
        const actor = getEventActor(event);
        const hasActor = actor !== 'system';
        const detail = formatEventDetail(event);

        return (
          <div className="modal-task-activity-entry" key={event.event_id}>
            <div className="modal-task-activity-header">
              <span className="modal-task-activity-type">{formatEventType(event.type)}</span>
              <span className="modal-entry-time">{formatTime(event.timestamp)}</span>
            </div>
            {hasActor && (
              <div className="modal-task-activity-author">By {actor}</div>
            )}
            {detail && (
              <div className="modal-task-activity-detail">{detail}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
