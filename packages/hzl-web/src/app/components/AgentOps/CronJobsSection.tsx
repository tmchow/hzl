import { useState } from 'react';
import cronstrue from 'cronstrue';
import type { CronJob, CronStatus, GatewayStatus, GatewayAgent, CronJobCreateParams, CronJobUpdatePatch } from '../../api/types';
import CronJobModal from './CronJobModal';

interface CronJobsSectionProps {
  gatewayStatus: GatewayStatus;
  gatewayLoading: boolean;
  gatewayError: string | null;
  onConfigureGateway: (url: string, token?: string) => Promise<void>;
  jobs: CronJob[];
  jobsLoading: boolean;
  jobsError: string | null;
  cronStatus: CronStatus | null;
  onToggleJob: (jobId: string, enabled: boolean) => Promise<void>;
  onDeleteJob: (jobId: string) => Promise<void>;
  onRunJob: (jobId: string) => Promise<unknown>;
  onCreateJob: (params: CronJobCreateParams) => Promise<CronJob>;
  onUpdateJob: (jobId: string, patch: CronJobUpdatePatch) => Promise<CronJob>;
  onRefresh: () => void;
  agentId: string;
  gatewayAgents: GatewayAgent[];
}

const STATUS_DOT: Record<string, string> = {
  connected: 'cron-status-dot-connected',
  connecting: 'cron-status-dot-connecting',
  disconnected: 'cron-status-dot-disconnected',
  unconfigured: 'cron-status-dot-disconnected',
};

function formatRelativeTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  const now = Date.now();
  const diff = ms - now;
  const absDiff = Math.abs(diff);

  if (absDiff < 60_000) return diff > 0 ? 'in <1m' : '<1m ago';
  if (absDiff < 3_600_000) {
    const mins = Math.round(absDiff / 60_000);
    return diff > 0 ? `in ${mins}m` : `${mins}m ago`;
  }
  if (absDiff < 86_400_000) {
    const hours = Math.round(absDiff / 3_600_000);
    return diff > 0 ? `in ${hours}h` : `${hours}h ago`;
  }
  const days = Math.round(absDiff / 86_400_000);
  return diff > 0 ? `in ${days}d` : `${days}d ago`;
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

/** Convert a cron expression to a human-readable description */
function describeCron(expr: string): string {
  try {
    return cronstrue.toString(expr, { use24HourTimeFormat: false });
  } catch {
    return expr;
  }
}

export default function CronJobsSection({
  gatewayStatus,
  gatewayLoading,
  gatewayError,
  onConfigureGateway,
  jobs,
  jobsLoading,
  jobsError,
  cronStatus,
  onToggleJob,
  onDeleteJob,
  onRunJob,
  onCreateJob,
  onUpdateJob,
  onRefresh,
  agentId,
  gatewayAgents,
}: CronJobsSectionProps) {
  const [configUrl, setConfigUrl] = useState('ws://127.0.0.1:18789');
  const [configToken, setConfigToken] = useState('');
  const [configuring, setConfiguring] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Optimistic toggle state: jobId → toggled enabled value
  const [optimisticToggles, setOptimisticToggles] = useState<Map<string, boolean>>(new Map());

  const handleConfigure = async () => {
    setConfiguring(true);
    setConfigError(null);
    try {
      await onConfigureGateway(configUrl, configToken || undefined);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setConfiguring(false);
    }
  };

  const handleToggle = async (jobId: string, enabled: boolean) => {
    setActionError(null);
    // Optimistically update the toggle
    setOptimisticToggles(prev => new Map(prev).set(jobId, enabled));
    try {
      await onToggleJob(jobId, enabled);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Toggle failed');
    } finally {
      // Clear optimistic state — real data from refresh takes over
      setOptimisticToggles(prev => {
        const next = new Map(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  // Resolve job enabled state: use optimistic value if pending, else server value
  const getJobEnabled = (job: CronJob): boolean => {
    return optimisticToggles.has(job.id) ? optimisticToggles.get(job.id)! : job.enabled;
  };

  const handleRunNow = async (jobId: string) => {
    setActionError(null);
    try {
      await onRunJob(jobId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Run failed');
    }
  };

  const handleDelete = async (jobId: string) => {
    setActionError(null);
    try {
      await onDeleteJob(jobId);
      setDeleteConfirm(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleCreateOrEdit = () => {
    setEditingJob(null);
    setModalOpen(true);
  };

  const handleEdit = (job: CronJob) => {
    setEditingJob(job);
    setModalOpen(true);
  };

  const handleModalSave = async (params: CronJobCreateParams | CronJobUpdatePatch) => {
    if (editingJob) {
      await onUpdateJob(editingJob.id, params as CronJobUpdatePatch);
    } else {
      await onCreateJob(params as CronJobCreateParams);
    }
    setModalOpen(false);
    setEditingJob(null);
  };

  // Unconfigured state
  if (gatewayStatus === 'unconfigured' || gatewayStatus === 'disconnected') {
    return (
      <div className="cron-section">
        <div className="cron-section-header">
          <span className="agent-detail-section-label">Cron Jobs</span>
          <span className={`cron-status-dot ${STATUS_DOT[gatewayStatus]}`} />
        </div>
        <div className="cron-setup-ui">
          <div className="cron-setup-message">
            {gatewayStatus === 'unconfigured'
              ? 'Connect to the OpenClaw gateway to manage cron jobs.'
              : 'Gateway is not reachable. Check the URL and try again.'}
          </div>
          <div className="cron-setup-form">
            <input
              type="text"
              className="cron-setup-input"
              placeholder="Gateway URL"
              value={configUrl}
              onChange={(e) => setConfigUrl(e.target.value)}
            />
            <input
              type="password"
              className="cron-setup-input"
              placeholder="Gateway token"
              value={configToken}
              onChange={(e) => setConfigToken(e.target.value)}
            />
            <button
              className="cron-setup-button"
              onClick={handleConfigure}
              disabled={configuring || !configUrl}
            >
              {configuring ? 'Connecting...' : 'Connect'}
            </button>
          </div>
          {(configError || gatewayError) && (
            <div className="cron-error">{configError || gatewayError}</div>
          )}
        </div>
      </div>
    );
  }

  // Connected state
  return (
    <div className="cron-section">
      <div className="cron-section-header">
        <div className="cron-section-header-left">
          <span className="agent-detail-section-label">Cron Jobs</span>
          {jobs.length > 0 && (
            <span className="cron-job-count">{jobs.length}</span>
          )}
          <span className={`cron-status-dot ${STATUS_DOT[gatewayStatus]}`} />
        </div>
        <div className="cron-section-header-actions">
          <button className="cron-action-btn" onClick={onRefresh} title="Refresh">
            &#x21bb;
          </button>
          <button className="cron-action-btn cron-create-btn" onClick={handleCreateOrEdit}>
            + New
          </button>
        </div>
      </div>

      {actionError && <div className="cron-error">{actionError}</div>}
      {jobsError && <div className="cron-error">{jobsError}</div>}

      {jobsLoading && jobs.length === 0 ? (
        <div className="cron-loading">Loading cron jobs...</div>
      ) : jobs.length === 0 ? (
        <div className="cron-empty">
          <span>No cron jobs for this agent.</span>
          <button className="cron-action-btn cron-create-btn" onClick={handleCreateOrEdit}>
            Create Job
          </button>
        </div>
      ) : (
        <div className="cron-job-list">
          {jobs.map((job) => (
            <div key={job.id} className={`cron-job-row${!getJobEnabled(job) ? ' disabled' : ''}`}>
              <div className="cron-job-row-main">
                <label className="cron-job-toggle" title={getJobEnabled(job) ? 'Disable' : 'Enable'}>
                  <input
                    type="checkbox"
                    checked={getJobEnabled(job)}
                    onChange={() => handleToggle(job.id, !getJobEnabled(job))}
                  />
                  <span className="cron-job-toggle-slider" />
                </label>
                <div className="cron-job-info">
                  <span className="cron-job-name">{job.name || job.id}</span>
                  <span className="cron-job-schedule" title={job.schedule?.expr ?? ''}>
                    {describeCron(job.schedule?.expr ?? '')}
                    {job.state?.nextRunAtMs && (
                      <span className="cron-job-next-inline"> ({formatRelativeTime(job.state.nextRunAtMs)})</span>
                    )}
                  </span>
                </div>
                {(job.state?.lastStatus === 'error' || (job.state?.consecutiveErrors ?? 0) > 0) && (
                  <div className="cron-job-state">
                    <span className="cron-job-status-indicator status-error">
                      error
                      {(job.state?.consecutiveErrors ?? 0) > 0 && (
                        <span className="cron-job-error-count">({job.state!.consecutiveErrors})</span>
                      )}
                    </span>
                  </div>
                )}
                <div className="cron-job-timing">
                  <span className="cron-job-duration" title="Last duration">
                    {formatDuration(job.state?.lastDurationMs)}
                  </span>
                </div>
                <div className="cron-job-actions">
                  <button
                    className="cron-action-btn"
                    onClick={() => handleRunNow(job.id)}
                    title="Run now"
                  >
                    &#x25B6;
                  </button>
                  <button
                    className="cron-action-btn"
                    onClick={() => handleEdit(job)}
                    title="Edit"
                  >
                    &#x270E;
                  </button>
                  <button
                    className="cron-action-btn cron-delete-btn"
                    onClick={() => setDeleteConfirm(job.id)}
                    title="Delete"
                  >
                    &#x2715;
                  </button>
                </div>
              </div>

              {/* Delete confirmation */}
              {deleteConfirm === job.id && (
                <div className="cron-delete-confirm">
                  <span>Delete "{job.name || job.id}"?</span>
                  <button className="cron-action-btn cron-delete-btn" onClick={() => handleDelete(job.id)}>
                    Delete
                  </button>
                  <button className="cron-action-btn" onClick={() => setDeleteConfirm(null)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {cronStatus && !cronStatus.enabled && (
        <div className="cron-scheduler-warning">Scheduler is disabled</div>
      )}

      {modalOpen && (
        <CronJobModal
          job={editingJob}
          agentId={agentId}
          gatewayAgents={gatewayAgents}
          onSave={handleModalSave}
          onClose={() => { setModalOpen(false); setEditingJob(null); }}
        />
      )}
    </div>
  );
}
