import { useState } from 'react';
import type { AgentEvent } from '../../api/types';
import { formatTime } from '../../utils/format';

interface EventTimelineProps {
  events: AgentEvent[] | null;
  total: number;
  onLoadMore: () => void;
  loading: boolean;
}

const KNOWN_STATUSES = new Set(['backlog', 'ready', 'in-progress', 'done', 'archived']);

interface EventTypeConfig {
  label: string;
  badgeClass: string;
  description: (data: Record<string, unknown>) => string;
}

const EVENT_CONFIG: Record<string, EventTypeConfig> = {
  task_created: {
    label: 'created',
    badgeClass: 'event-badge-created',
    description: (data) => {
      const project = typeof data.project === 'string' ? data.project : null;
      return project ? `created in ${project}` : 'task created';
    },
  },
  status_changed: {
    label: 'status',
    badgeClass: 'event-badge-default',
    description: (data) => {
      const from = typeof data.from === 'string' ? data.from : null;
      const to = typeof data.to === 'string' ? data.to : null;
      if (from && to) return `${from} \u2192 ${to}`;
      return '';
    },
  },
  task_updated: {
    label: 'updated',
    badgeClass: 'event-badge-updated',
    description: (data) => {
      const field = typeof data.field === 'string' ? data.field : null;
      const oldVal = data.old_value != null ? String(data.old_value) : null;
      const newVal = data.new_value != null ? String(data.new_value) : null;
      if (field && oldVal != null && newVal != null) {
        return `${field}: ${oldVal} \u2192 ${newVal}`;
      }
      if (field) return `${field} updated`;
      return 'task updated';
    },
  },
  comment_added: {
    label: 'commented',
    badgeClass: 'event-badge-comment',
    description: (data) => {
      const text = typeof data.text === 'string' ? data.text : '';
      if (text.length > 80) return `${text.slice(0, 80)}...`;
      return text;
    },
  },
  checkpoint_recorded: {
    label: 'checkpoint',
    badgeClass: 'event-badge-checkpoint',
    description: (data) => {
      const name = typeof data.name === 'string' ? data.name : null;
      return name ? `checkpoint: ${name}` : 'checkpoint recorded';
    },
  },
  task_moved: {
    label: 'moved',
    badgeClass: 'event-badge-moved',
    description: (data) => {
      const from = typeof data.from_project === 'string' ? data.from_project : null;
      const to = typeof data.to_project === 'string' ? data.to_project : null;
      if (from && to) return `${from} \u2192 ${to}`;
      return 'task moved';
    },
  },
  dependency_added: {
    label: 'dep added',
    badgeClass: 'event-badge-dep',
    description: (data) => {
      const depId = typeof data.depends_on_id === 'string' ? data.depends_on_id : null;
      return depId ? `depends on ${depId.slice(0, 8)}` : 'dependency added';
    },
  },
  dependency_removed: {
    label: 'dep removed',
    badgeClass: 'event-badge-dep',
    description: (data) => {
      const depId = typeof data.depends_on_id === 'string' ? data.depends_on_id : null;
      return depId ? `removed dep on ${depId.slice(0, 8)}` : 'dependency removed';
    },
  },
  task_archived: {
    label: 'archived',
    badgeClass: 'event-badge-archived',
    description: () => 'task archived',
  },
};

function getConfig(type: string): EventTypeConfig {
  return EVENT_CONFIG[type] ?? {
    label: type.replace(/_/g, ' '),
    badgeClass: 'event-badge-default',
    description: () => '',
  };
}

function getBadgeClass(type: string, data: Record<string, unknown>): string {
  if (type === 'status_changed') {
    const to = typeof data.to === 'string' ? data.to : '';
    const sanitized = to.replace(/[^a-zA-Z0-9-]/g, '');
    if (sanitized && KNOWN_STATUSES.has(sanitized)) {
      return `event-badge-${sanitized}`;
    }
    return 'event-badge-default';
  }
  return getConfig(type).badgeClass;
}

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
          const config = getConfig(event.type);
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
                  {config.label}
                </span>
                <span className="event-timeline-desc">
                  {config.description(event.data)}
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
