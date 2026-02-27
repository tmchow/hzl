/**
 * Migration V3: rename task ownership projection column from assignee -> agent.
 *
 * We keep this as an additive/backfill migration for SQLite compatibility:
 * 1) add agent column if missing
 * 2) copy values from legacy assignee column when present
 */

export const ADD_AGENT_COLUMN = `
ALTER TABLE tasks_current ADD COLUMN agent TEXT
`;

export const BACKFILL_AGENT_FROM_ASSIGNEE = `
UPDATE tasks_current
SET agent = assignee
WHERE agent IS NULL AND assignee IS NOT NULL
`;

export const CREATE_AGENT_INDEX = `
CREATE INDEX IF NOT EXISTS idx_tasks_current_agent ON tasks_current(agent)
`;
