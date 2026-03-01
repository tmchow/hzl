import { useState, useEffect, useCallback } from 'react';
import { fetchJson } from '../../api/client';
import type { TaskDetail, TaskDetailResponse, TaskEvent, TaskEventListResponse } from '../../api/types';
import { formatTime, getAssigneeValue } from '../../utils/format';
import MarkdownContent from './MarkdownContent';
import CommentsSection from './CommentsSection';
import CheckpointsSection from './CheckpointsSection';
import EventTimeline from './EventTimeline';
import { getTagColor } from '../../utils/tag-color';
import './TaskModal.css';

interface Comment {
  text: string;
  author: string | null;
  agent_id: string | null;
  timestamp: string;
}

interface Checkpoint {
  name: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface TaskModalProps {
  taskId: string | null;
  onClose: () => void;
}

type ModalTab = 'comments' | 'checkpoints' | 'activity';

export default function TaskModal({ taskId, onClose }: TaskModalProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [taskEvents, setTaskEvents] = useState<TaskEvent[]>([]);
  const [activeTab, setActiveTab] = useState<ModalTab>('comments');
  const [showAllComments, setShowAllComments] = useState(false);
  const [showAllCheckpoints, setShowAllCheckpoints] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [loading, setLoading] = useState(false);

  const loadTask = useCallback(async (id: string) => {
    setLoading(true);
    setShowAllComments(false);
    setShowAllCheckpoints(false);
    setShowAllActivity(false);
    try {
      const [taskRes, commentsRes, checkpointsRes, eventsRes] = await Promise.all([
        fetchJson<TaskDetailResponse>(`/api/tasks/${encodeURIComponent(id)}`),
        fetchJson<{ comments: Comment[] }>(`/api/tasks/${encodeURIComponent(id)}/comments`),
        fetchJson<{ checkpoints: Checkpoint[] }>(`/api/tasks/${encodeURIComponent(id)}/checkpoints`),
        fetchJson<TaskEventListResponse>(`/api/tasks/${encodeURIComponent(id)}/events`),
      ]);
      setTask(taskRes.task);
      setComments(commentsRes.comments);
      setCheckpoints(checkpointsRes.checkpoints);
      setTaskEvents(eventsRes.events);

      // Select first available tab
      if (commentsRes.comments.length > 0) setActiveTab('comments');
      else if (checkpointsRes.checkpoints.length > 0) setActiveTab('checkpoints');
      else setActiveTab('activity');
    } catch {
      // ignore errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (taskId) {
      loadTask(taskId);
    } else {
      setTask(null);
    }
  }, [taskId, loadTask]);

  const handleCopy = useCallback(async () => {
    if (!task) return;
    try {
      await navigator.clipboard.writeText(task.task_id);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    setTimeout(() => setCopyState('idle'), 1500);
  }, [task]);

  if (!taskId) return null;

  const progressValue = task?.progress ?? 0;
  const assignee = getAssigneeValue(task?.assignee);
  const hasAssignee = assignee.length > 0;

  const hasTabs = comments.length > 0 || checkpoints.length > 0 || taskEvents.length > 0;

  return (
    <div
      className="modal-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-title">{task?.title || 'Loading...'}</span>
            <div className="modal-task-id-row">
              <span>Task ID</span>
              <span className="modal-task-id-value">{task?.task_id || '-'}</span>
              <button
                type="button"
                className={`modal-task-id-copy${copyState === 'copied' ? ' copied' : copyState === 'failed' ? ' failed' : ''}`}
                disabled={!task}
                onClick={handleCopy}
              >
                {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'}
              </button>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {loading && !task ? (
            <div className="empty-column">Loading...</div>
          ) : task ? (
            <>
              <div className="modal-section">
                <div className="modal-meta">
                  <div className="modal-meta-item">
                    <div className="modal-meta-label">Status</div>
                    <div className="modal-meta-value">{task.status}</div>
                  </div>
                  <div className="modal-meta-item">
                    <div className="modal-meta-label">Progress</div>
                    <div className="modal-meta-value">
                      <span className={progressValue >= 100 ? 'modal-progress complete' : 'modal-progress'}>
                        {progressValue}%
                      </span>
                    </div>
                  </div>
                  <div className="modal-meta-item">
                    <div className="modal-meta-label">Project</div>
                    <div className="modal-meta-value">{task.project}</div>
                  </div>
                  <div className="modal-meta-item">
                    <div className="modal-meta-label">Assignee</div>
                    <div className="modal-meta-value">
                      {hasAssignee ? assignee : <span className="modal-meta-fallback">Unassigned</span>}
                    </div>
                  </div>
                  <div className="modal-meta-item">
                    <div className="modal-meta-label">Priority</div>
                    <div className="modal-meta-value">{task.priority}</div>
                  </div>
                  <div className="modal-meta-item">
                    <div className="modal-meta-label">Created</div>
                    <div className="modal-meta-value">{formatTime(task.created_at)}</div>
                  </div>
                  {task.lease_until && (
                    <div className="modal-meta-item">
                      <div className="modal-meta-label">Lease Until</div>
                      <div className="modal-meta-value">{formatTime(task.lease_until)}</div>
                    </div>
                  )}
                  {task.due_at && (
                    <div className="modal-meta-item">
                      <div className="modal-meta-label">Due Date</div>
                      <div className="modal-meta-value">{new Date(task.due_at).toLocaleDateString()}</div>
                    </div>
                  )}
                </div>
              </div>

              {task.blocked_by && task.blocked_by.length > 0 && (
                <div className="modal-section">
                  <div className="modal-section-title">Blocked By</div>
                  <div className="modal-blocked-list">
                    {task.blocked_by.map((dep) => (
                      <button
                        key={dep.task_id}
                        type="button"
                        className="modal-blocked-item"
                        onClick={() => loadTask(dep.task_id)}
                      >
                        {dep.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {task.description && (
                <div className="modal-section">
                  <div className="modal-section-title">Description</div>
                  <MarkdownContent content={task.description} />
                </div>
              )}

              {task.links && task.links.length > 0 && (
                <div className="modal-section">
                  <div className="modal-section-title">Links</div>
                  <div className="modal-description">
                    {task.links.map((link, i) => (
                      <div key={i}>
                        <a href={link} target="_blank" rel="noopener noreferrer">{link}</a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {task.tags && task.tags.length > 0 && (
                <div className="modal-section">
                  <div className="modal-section-title">Tags</div>
                  <div className="modal-tags">
                    {task.tags.map((tag) => (
                      <span key={tag} className="card-tag" style={{ '--tag-color': getTagColor(tag) } as React.CSSProperties}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {hasTabs && (
                <div className="modal-section">
                  <div className="modal-tabs">
                    <button
                      className={`modal-tab${activeTab === 'comments' ? ' active' : ''}`}
                      disabled={comments.length === 0}
                      onClick={() => setActiveTab('comments')}
                    >
                      Comments<span className="modal-tab-count">{comments.length}</span>
                    </button>
                    <button
                      className={`modal-tab${activeTab === 'checkpoints' ? ' active' : ''}`}
                      disabled={checkpoints.length === 0}
                      onClick={() => setActiveTab('checkpoints')}
                    >
                      Checkpoints<span className="modal-tab-count">{checkpoints.length}</span>
                    </button>
                    <button
                      className={`modal-tab${activeTab === 'activity' ? ' active' : ''}`}
                      disabled={taskEvents.length === 0}
                      onClick={() => setActiveTab('activity')}
                    >
                      Activity<span className="modal-tab-count">{taskEvents.length}</span>
                    </button>
                  </div>

                  {activeTab === 'comments' && (
                    <CommentsSection
                      comments={comments}
                      showAll={showAllComments}
                      onShowAll={() => setShowAllComments(true)}
                    />
                  )}
                  {activeTab === 'checkpoints' && (
                    <CheckpointsSection
                      checkpoints={checkpoints}
                      showAll={showAllCheckpoints}
                      onShowAll={() => setShowAllCheckpoints(true)}
                    />
                  )}
                  {activeTab === 'activity' && (
                    <EventTimeline
                      events={taskEvents}
                      showAll={showAllActivity}
                      onShowAll={() => setShowAllActivity(true)}
                    />
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
