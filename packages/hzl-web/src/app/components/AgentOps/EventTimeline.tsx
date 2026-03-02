import { useState } from 'react';
import type { AgentEvent } from '../../api/types';
import { formatTime } from '../../utils/format';

interface EventTimelineProps {
  events: AgentEvent[] | null;
  total: number;
  onLoadMore: () => void;
  loading: boolean;
}

/** Map event type to a short human-readable badge label */
function getBadgeLabel(type: string): string {
  const labels: Record<string, string> = {
    task_created: 'created',
    status_changed: 'status',
    task_updated: 'updated',
    comment_added: 'commented',
    checkpoint_recorded: 'checkpoint',
    task_moved: 'moved',
    dependency_added: 'dep added',
    dependency_removed: 'dep removed',
    task_archived: 'archived',
    project_created: 'project',
    project_renamed: 'renamed',
    project_deleted: 'deleted',
  };
  return labels[type] ?? type.replace(/_/g, ' ');
}

/** Get CSS class for event type badge coloring */
function getBadgeClass(type: string, data: Record<string, unknown>): string {
  if (type === 'status_changed') {
    const to = typeof data.to === 'string' ? data.to : '';
    if (to) return `event-badge-${to.replace(/_/g, '-')}`;
  }
  const classMap: Record<string, string> = {
    task_created: 'event-badge-created',
    comment_added: 'event-badge-comment',
    checkpoint_recorded: 'event-badge-checkpoint',
    task_updated: 'event-badge-updated',
    task_moved: 'event-badge-moved',
    task_archived: 'event-badge-archived',
    dependency_added: 'event-badge-dep',
    dependency_removed: 'event-badge-dep',
  };
  return classMap[type] ?? 'event-badge-default';
}

/** Build a human-readable description from event data */
function getEventDescription(type: string, data: Record<string, unknown>): string {
  if (type === 'status_changed') {
    const from = typeof data.from === 'string' ? data.from : null;
    const to = typeof data.to === 'string' ? data.to : null;
    if (from && to) return `${from} \u2192 ${to}`;
    return '';
  }
  if (type === 'task_created') {
    const project = typeof data.project === 'string' ? data.project : null;
    return project ? `created in ${project}` : 'task created';
  }
  if (type === 'comment_added') {
    const text = typeof data.text === 'string' ? data.text : '';
    if (text.length > 80) return `${text.slice(0, 80)}...`;
    return text;
  }
  if (type === 'task_updated') {
    const field = typeof data.field === 'string' ? data.field : null;
    const oldVal = data.old != null ? String(data.old) : null;
    const newVal = data.new != null ? String(data.new) : null;
    if (field && oldVal != null && newVal != null) {
      return `${field}: ${oldVal} \u2192 ${newVal}`;
    }
    if (field) return `${field} updated`;
    return 'task updated';
  }
  if (type === 'checkpoint_recorded') {
    const name = typeof data.name === 'string' ? data.name : null;
    return name ? `checkpoint: ${name}` : 'checkpoint recorded';
  }
  if (type === 'task_moved') {
    const from = typeof data.from_project === 'string' ? data.from_project : null;
    const to = typeof data.to_project === 'string' ? data.to_project : null;
    if (from && to) return `${from} \u2192 ${to}`;
    return 'task moved';
  }
  if (type === 'dependency_added') {
    const depId = typeof data.depends_on_id === 'string' ? data.depends_on_id : null;
    return depId ? `depends on ${depId.slice(0, 8)}` : 'dependency added';
  }
  if (type === 'dependency_removed') {
    const depId = typeof data.depends_on_id === 'string' ? data.depends_on_id : null;
    return depId ? `removed dep on ${depId.slice(0, 8)}` : 'dependency removed';
  }
  if (type === 'task_archived') {
    return 'task archived';
  }
  return '';
}

/** Check if an event is expandable (task-related events that may show details) */
function isExpandable(type: string, data: Record<string, unknown>): boolean {
  if (type === 'task_created') return true;
  if (type === 'status_changed') {
    const to = typeof data.to === 'string' ? data.to : '';
    return to === 'in_progress';
  }
  return false;
}

export default function EventTimeline({
  events,
  total,
  onLoadMore,
  loading,
}: EventTimelineProps) {
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  if (events === null) {
    return (
      <div className="event-timeline-empty">
        Select an agent to view their event timeline
      </div>
    );
  }

  if (events.length === 0 && !loading) {
    return (
      <div className="event-timeline-empty">
        No events found for this agent
      </div>
    );
  }

  const toggleExpand = (eventId: number) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const remaining = total - events.length;

  return (
    <div className="event-timeline">
      <div className="event-timeline-list">
        {events.map((event) => {
          const expandable = isExpandable(event.type, event.data);
          const expanded = expandedEvents.has(event.id);

          return (
            <div
              key={event.id}
              className={`event-timeline-row${expandable ? ' expandable' : ''}${expanded ? ' expanded' : ''}`}
              onClick={expandable ? () => toggleExpand(event.id) : undefined}
            >
              <div className="event-timeline-row-main">
                <span className="event-timeline-time">
                  {formatTime(event.timestamp)}
                </span>
                <span className={`event-timeline-badge ${getBadgeClass(event.type, event.data)}`}>
                  {getBadgeLabel(event.type)}
                </span>
                <span className="event-timeline-desc">
                  {getEventDescription(event.type, event.data)}
                </span>
                <span className="event-timeline-task-ctx">
                  {event.taskTitle}
                </span>
              </div>
              {expanded && (
                <div className="event-timeline-expanded">
                  <div className="event-timeline-expanded-row">
                    <span className="event-timeline-expanded-label">Task</span>
                    <span className="event-timeline-expanded-value">{event.taskTitle}</span>
                  </div>
                  <div className="event-timeline-expanded-row">
                    <span className="event-timeline-expanded-label">Status</span>
                    <span className="event-timeline-expanded-value">{event.taskStatus}</span>
                  </div>
                  <div className="event-timeline-expanded-row">
                    <span className="event-timeline-expanded-label">Task ID</span>
                    <span className="event-timeline-expanded-value event-timeline-mono">
                      {event.taskId.slice(0, 12)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {remaining > 0 && (
        <button
          className="event-timeline-load-more"
          onClick={onLoadMore}
          disabled={loading}
        >
          {loading ? 'Loading...' : `Load more (${remaining} remaining)`}
        </button>
      )}
    </div>
  );
}
