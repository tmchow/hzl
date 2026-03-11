import { useState, useEffect, useCallback } from 'react';
import type { CronJob, CronJobCreateParams, CronJobUpdatePatch, GatewayAgent } from '../../api/types';

interface CronJobModalProps {
  job: CronJob | null;
  agentId: string;
  gatewayAgents: GatewayAgent[];
  onSave: (params: CronJobCreateParams | CronJobUpdatePatch) => Promise<void>;
  onClose: () => void;
}

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
];

const SESSION_TARGETS = [
  { value: '', label: '(default)' },
  { value: 'main', label: 'main — reuse primary session' },
  { value: 'isolated', label: 'isolated — fresh session each run' },
  { value: 'named', label: 'named — reuse named session' },
];

const WAKE_MODES = [
  { value: '', label: '(default)' },
  { value: 'always', label: 'always — wake even if busy' },
  { value: 'idle', label: 'idle — only run when idle' },
];

export default function CronJobModal({ job, agentId, gatewayAgents, onSave, onClose }: CronJobModalProps) {
  const isEdit = job !== null;

  // Primary fields
  const [name, setName] = useState(job?.name ?? '');
  const [enabled, setEnabled] = useState(job?.enabled ?? true);
  const [scheduleExpr, setScheduleExpr] = useState(job?.schedule?.expr ?? '');
  const [timezone, setTimezone] = useState(job?.schedule?.tz ?? 'UTC');
  const [message, setMessage] = useState(job?.payload?.message ?? job?.payload?.text ?? '');
  const [model, setModel] = useState(job?.payload?.model ?? '');

  // Advanced fields
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [description, setDescription] = useState(job?.description ?? '');
  const [scheduleKind, setScheduleKind] = useState(job?.schedule?.kind ?? 'cron');
  const [sessionTarget, setSessionTarget] = useState(job?.sessionTarget ?? '');
  const [wakeMode, setWakeMode] = useState(job?.wakeMode ?? '');
  const [timeout, setTimeout_] = useState(String(job?.payload?.timeoutSeconds ?? ''));
  const [deliveryMode, setDeliveryMode] = useState(job?.delivery?.mode ?? '');
  const [deliveryChannel, setDeliveryChannel] = useState(job?.delivery?.channel ?? '');
  const [deliveryTo, setDeliveryTo] = useState(job?.delivery?.to ?? '');
  const [deliveryBestEffort, setDeliveryBestEffort] = useState(job?.delivery?.bestEffort ?? false);
  const [jobAgentId, setJobAgentId] = useState(job?.agentId ?? agentId);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basic client-side validation
  const validate = (): string | null => {
    if (!name.trim()) return 'Name is required';
    if (!scheduleExpr.trim()) return 'Schedule expression is required';
    // Basic cron format check: 5 space-separated fields
    const parts = scheduleExpr.trim().split(/\s+/);
    if (scheduleKind === 'cron' && parts.length < 5) {
      return 'Cron expression must have 5 fields (min hour dom mon dow)';
    }
    if (timeout && (isNaN(parseInt(timeout, 10)) || parseInt(timeout, 10) < 0)) {
      return 'Timeout must be a positive number';
    }
    return null;
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // For edits, preserve original payload structure and only overlay changed fields.
      // The gateway has strict schema validation (e.g. kind: "agentTurn" not "message").
      const basePayload = isEdit && job?.payload ? { ...job.payload } : { kind: 'agentTurn' as const };
      const updatedPayload = {
        ...basePayload,
        message,
        ...(model ? { model } : {}),
        ...(timeout ? { timeoutSeconds: parseInt(timeout, 10) } : {}),
      };

      const baseDelivery = isEdit && job?.delivery ? { ...job.delivery } : undefined;
      const hasDeliveryFields = deliveryMode || deliveryChannel || deliveryTo || baseDelivery;

      const params: CronJobCreateParams | CronJobUpdatePatch = {
        name,
        enabled,
        schedule: {
          kind: scheduleKind || 'cron',
          expr: scheduleExpr,
          tz: timezone,
        },
        payload: updatedPayload,
        ...(description ? { description } : {}),
        ...(sessionTarget ? { sessionTarget } : {}),
        ...(wakeMode ? { wakeMode } : {}),
        ...(jobAgentId ? { agentId: jobAgentId } : {}),
        ...(hasDeliveryFields ? {
          delivery: {
            ...(baseDelivery ?? {}),
            ...(deliveryMode ? { mode: deliveryMode } : {}),
            ...(deliveryChannel ? { channel: deliveryChannel } : {}),
            ...(deliveryTo ? { to: deliveryTo } : {}),
            bestEffort: deliveryBestEffort,
          },
        } : {}),
      };

      await onSave(params);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, enabled, scheduleKind, scheduleExpr, timezone, message, model, timeout,
      description, sessionTarget, wakeMode, jobAgentId, deliveryMode, deliveryChannel,
      deliveryTo, deliveryBestEffort, onSave]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="cron-modal-overlay" onClick={onClose}>
      <div className="cron-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cron-modal-header">
          <span className="cron-modal-title">{isEdit ? 'Edit Cron Job' : 'Create Cron Job'}</span>
          <button className="cron-modal-close" onClick={onClose}>&times;</button>
        </div>

        <form className="cron-modal-body" onSubmit={handleSubmit}>
          {error && <div className="cron-error">{error}</div>}

          {/* Name + Enabled on same row */}
          <div className="cron-modal-row">
            <div className="cron-modal-field" style={{ flex: 1 }}>
              <label className="cron-modal-label">Name</label>
              <input
                type="text"
                className="cron-modal-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Daily standup summary"
                required
              />
            </div>
            <div className="cron-modal-field cron-modal-toggle-field">
              <label className="cron-modal-label">Enabled</label>
              <label className="cron-job-toggle">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <span className="cron-job-toggle-slider" />
              </label>
            </div>
          </div>

          <div className="cron-modal-field">
            <label className="cron-modal-label">Schedule Expression</label>
            <input
              type="text"
              className="cron-modal-input"
              value={scheduleExpr}
              onChange={(e) => setScheduleExpr(e.target.value)}
              placeholder="e.g., 0 8 * * *"
              required
            />
          </div>

          <div className="cron-modal-field">
            <label className="cron-modal-label">Timezone</label>
            <select
              className="cron-modal-input"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <div className="cron-modal-field">
            <label className="cron-modal-label">Payload Message</label>
            <textarea
              className="cron-modal-textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Message to send to the agent"
              rows={5}
            />
          </div>

          <div className="cron-modal-field">
            <label className="cron-modal-label">Model (optional)</label>
            <input
              type="text"
              className="cron-modal-input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g., claude-sonnet-4-20250514"
            />
          </div>

          {/* Advanced section */}
          <button
            type="button"
            className="cron-modal-advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? '▾ Advanced' : '▸ Advanced'}
          </button>

          {showAdvanced && (
            <div className="cron-modal-advanced">
              <div className="cron-modal-field">
                <label className="cron-modal-label">Description</label>
                <input
                  type="text"
                  className="cron-modal-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Job description"
                />
              </div>

              <div className="cron-modal-row">
                <div className="cron-modal-field" style={{ flex: 1 }}>
                  <label className="cron-modal-label">Schedule Kind</label>
                  <select
                    className="cron-modal-input"
                    value={scheduleKind}
                    onChange={(e) => setScheduleKind(e.target.value)}
                  >
                    <option value="cron">cron</option>
                    <option value="interval">interval</option>
                  </select>
                </div>
                <div className="cron-modal-field" style={{ flex: 1 }}>
                  <label className="cron-modal-label">Session Target</label>
                  <select
                    className="cron-modal-input"
                    value={sessionTarget}
                    onChange={(e) => setSessionTarget(e.target.value)}
                  >
                    {SESSION_TARGETS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="cron-modal-row">
                <div className="cron-modal-field" style={{ flex: 1 }}>
                  <label className="cron-modal-label">Wake Mode</label>
                  <select
                    className="cron-modal-input"
                    value={wakeMode}
                    onChange={(e) => setWakeMode(e.target.value)}
                  >
                    {WAKE_MODES.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="cron-modal-field" style={{ flex: 1 }}>
                  <label className="cron-modal-label">Timeout (seconds)</label>
                  <input
                    type="number"
                    className="cron-modal-input"
                    value={timeout}
                    onChange={(e) => setTimeout_(e.target.value)}
                    placeholder="300"
                    min="0"
                  />
                </div>
              </div>

              <div className="cron-modal-field">
                <label className="cron-modal-label">Agent ID</label>
                <select
                  className="cron-modal-input"
                  value={jobAgentId}
                  onChange={(e) => setJobAgentId(e.target.value)}
                >
                  {gatewayAgents.map((ga) => (
                    <option key={ga.id} value={ga.id}>{ga.id}</option>
                  ))}
                </select>
              </div>

              <div className="cron-modal-field">
                <label className="cron-modal-label">Delivery</label>
                <div className="cron-modal-row">
                  <input
                    type="text"
                    className="cron-modal-input"
                    value={deliveryMode}
                    onChange={(e) => setDeliveryMode(e.target.value)}
                    placeholder="Mode"
                    style={{ flex: 1 }}
                  />
                  <input
                    type="text"
                    className="cron-modal-input"
                    value={deliveryChannel}
                    onChange={(e) => setDeliveryChannel(e.target.value)}
                    placeholder="Channel"
                    style={{ flex: 1 }}
                  />
                  <input
                    type="text"
                    className="cron-modal-input"
                    value={deliveryTo}
                    onChange={(e) => setDeliveryTo(e.target.value)}
                    placeholder="To"
                    style={{ flex: 1 }}
                  />
                </div>
                <label className="cron-modal-checkbox">
                  <input
                    type="checkbox"
                    checked={deliveryBestEffort}
                    onChange={(e) => setDeliveryBestEffort(e.target.checked)}
                  />
                  Best effort delivery
                </label>
              </div>
            </div>
          )}

          <div className="cron-modal-footer">
            <button type="button" className="cron-modal-btn cron-modal-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="cron-modal-btn cron-modal-btn-save" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
