/**
 * HZL Core - Task coordination for AI agent swarms
 *
 * This module provides the core business logic for the HZL task management system,
 * including event sourcing, projections, and task coordination services.
 *
 * @packageDocumentation
 */

// ============================================================================
// Database
// ============================================================================

export {
  createConnection,
  getDefaultDbPath,
  withWriteTransaction,
} from './db/connection.js';

export { runMigrations, getCurrentVersion } from './db/migrations.js';

// ============================================================================
// Events
// ============================================================================

export {
  EventStore,
  type AppendEventInput,
  type PersistedEventEnvelope,
  type GetByTaskIdOptions,
} from './events/store.js';

export {
  EventType,
  TaskStatus,
  validateEventData,
  EventSchemas,
  type EventEnvelope,
  type TaskCreatedData,
  type StatusChangedData,
  type CommentAddedData,
  type CheckpointRecordedData,
} from './events/types.js';

// ============================================================================
// Projections
// ============================================================================

export { ProjectionEngine } from './projections/engine.js';

export {
  type Projector,
  type ProjectionState,
} from './projections/types.js';

export { TasksCurrentProjector } from './projections/tasks-current.js';
export { DependenciesProjector } from './projections/dependencies.js';
export { TagsProjector } from './projections/tags.js';
export { SearchProjector } from './projections/search.js';
export { CommentsCheckpointsProjector } from './projections/comments-checkpoints.js';

export { rebuildAllProjections } from './projections/rebuild.js';

// ============================================================================
// Services
// ============================================================================

export {
  TaskService,
  TaskNotFoundError,
  TaskNotClaimableError,
  DependenciesNotDoneError,
  type CreateTaskInput,
  type EventContext,
  type Task,
  type ClaimTaskOptions,
  type ClaimNextOptions,
  type StealOptions,
  type StealResult,
  type StuckTask,
  type AvailableTask,
  type Comment,
  type Checkpoint,
} from './services/task-service.js';

export {
  ValidationService,
  type CycleNode,
  type MissingDep,
  type ValidationIssue,
  type ValidationResult,
} from './services/validation-service.js';

export {
  SearchService,
  type SearchTaskResult,
  type SearchResult,
  type SearchOptions,
} from './services/search-service.js';

export {
  BackupService,
  type BackupResult,
  type RestoreResult,
  type ExportResult,
  type ImportResult,
} from './services/backup-service.js';

// ============================================================================
// Utilities
// ============================================================================

export { generateId, isValidId } from './utils/id.js';

// ============================================================================
// Fixtures
// ============================================================================

export {
  SAMPLE_TASKS,
  SAMPLE_PROJECT_NAME,
  type SampleTask,
} from './fixtures/sample-data.js';
