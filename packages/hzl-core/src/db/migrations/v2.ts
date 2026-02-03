/**
 * Migration V2: Add terminal_at column for tracking when tasks enter terminal states.
 *
 * The column is used for age-based pruning eligibility (done/archived tasks
 * older than a threshold can be pruned).
 */

/**
 * SQL to add the terminal_at column.
 * IMPORTANT: Only run this if the column doesn't exist (check via pragma_table_info).
 */
export const ADD_TERMINAL_AT_COLUMN = `
ALTER TABLE tasks_current ADD COLUMN terminal_at TEXT
`;

/**
 * SQL to create the index on terminal_at. Safe to run multiple times (uses IF NOT EXISTS).
 */
export const CREATE_TERMINAL_AT_INDEX = `
CREATE INDEX IF NOT EXISTS idx_tasks_current_terminal_at ON tasks_current(terminal_at)
`;
