export const ADD_STALE_AFTER_MINUTES_COLUMN = `
ALTER TABLE tasks_current ADD COLUMN stale_after_minutes INTEGER CHECK (stale_after_minutes >= 0)
`;
