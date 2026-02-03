export const MIGRATION_V2 = `
-- Add terminal_at column to track when tasks enter terminal states (done, archived)
-- Used for age-based pruning eligibility
ALTER TABLE tasks_current ADD COLUMN terminal_at TEXT;

-- Create index for fast age-based queries during pruning
CREATE INDEX IF NOT EXISTS idx_tasks_current_terminal_at ON tasks_current(terminal_at);
`;
