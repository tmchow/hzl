/**
 * HZL Core - A shared task ledger for OpenClaw and poly-agent workflows.
 *
 * This module provides the core business logic for the HZL task management system,
 * including event sourcing, projections, and task coordination services.
 *
 * @packageDocumentation
 */

// ============================================================================
// Database
// ============================================================================

export { withWriteTransaction } from './db/transaction.js';

export {
  DatabaseLock,
  type LockMetadata
} from './db/lock.js';

export {
  runMigrationsWithRollback,
  MigrationError,
  type Migration,
  type MigrationResult,
} from './db/migrations.js';

export {
  createDatastore,
  type Datastore,
  type ConnectionMode,
} from './db/datastore.js';

export {
  type DbConfig,
  type SyncConfig,
  type SyncResult,
  type SyncStats,
  type ConflictStrategy,
} from './db/types.js';

export {
  createSyncPolicy,
  type SyncPolicy,
} from './db/sync-policy.js';

export {
  getInstanceId,
  getDeviceId,
  getDirtySince,
  clearDirtySince,
  getLastSyncAt,
  getLastSyncError,
  getLastSyncFrameNo,
  getLastSyncAttemptAt,
} from './db/meta.js';

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
  PROJECT_EVENT_TASK_ID,
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
export { ProjectsProjector } from './projections/projects.js';

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
  type TaskListItem,
  type TaskStats,
} from './services/task-service.js';

export {
  ProjectService,
  ProjectNotFoundError,
  ProtectedProjectError,
  ProjectHasTasksError,
  ProjectAlreadyExistsError,
  type Project,
  type CreateProjectOptions,
} from './services/project-service.js';

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
