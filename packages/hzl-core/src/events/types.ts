import { z } from 'zod';

export enum EventType {
  TaskCreated = 'task_created',
  StatusChanged = 'status_changed',
  TaskMoved = 'task_moved',
  DependencyAdded = 'dependency_added',
  DependencyRemoved = 'dependency_removed',
  TaskUpdated = 'task_updated',
  TaskArchived = 'task_archived',
  CommentAdded = 'comment_added',
  CheckpointRecorded = 'checkpoint_recorded',
  ProjectCreated = 'project_created',
  ProjectRenamed = 'project_renamed',
  ProjectDeleted = 'project_deleted',
}

export enum TaskStatus {
  Backlog = 'backlog',
  Ready = 'ready',
  InProgress = 'in_progress',
  Blocked = 'blocked',
  Done = 'done',
  Archived = 'archived',
}

export interface EventEnvelope {
  event_id: string;
  task_id: string;
  type: EventType;
  data: Record<string, unknown>;
  author?: string;
  agent_id?: string;
  session_id?: string;
  correlation_id?: string;
  causation_id?: string;
  timestamp: string;
}

// =============================================================================
// Field Size Limits (exported for client-side validation and documentation)
// =============================================================================
export const FIELD_LIMITS = {
  TITLE: 128,
  DESCRIPTION: 16384,
  LINK: 2048,
  TAG: 64,
  REASON: 1024,
  COMMENT: 16384,
  CHECKPOINT_NAME: 256,
  PROJECT_NAME: 255,
  IDENTIFIER: 255,
  ARRAY_MAX_ITEMS: 100,
  METADATA_MAX_KEYS: 50,
  METADATA_MAX_BYTES: 65536, // 64KB
  CHECKPOINT_DATA_MAX_BYTES: 16384, // 16KB
} as const;

// =============================================================================
// Base Validators
// =============================================================================

// ISO-8601 datetime validation
const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
  message: 'Must be an ISO-8601 datetime string',
});

// Non-empty string with reasonable max length for identifiers
const nonEmptyString = z.string().min(1).max(FIELD_LIMITS.IDENTIFIER);

// Project name validation: alphanumeric start, followed by alphanumeric/hyphens/underscores
const projectName = z
  .string()
  .min(1, 'Project name cannot be empty')
  .max(FIELD_LIMITS.PROJECT_NAME, `Project name cannot exceed ${FIELD_LIMITS.PROJECT_NAME} characters`)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
    'Project name must start with alphanumeric and contain only alphanumeric, hyphens, and underscores'
  );

// =============================================================================
// Field-Specific Validators (reusable across schemas)
// =============================================================================
const titleString = z.string().min(1).max(FIELD_LIMITS.TITLE);
const descriptionString = z.string().max(FIELD_LIMITS.DESCRIPTION);
const linkString = z.string().min(1).max(FIELD_LIMITS.LINK);
const tagString = z.string().min(1).max(FIELD_LIMITS.TAG);
const reasonString = z.string().max(FIELD_LIMITS.REASON);
const commentString = z.string().min(1).max(FIELD_LIMITS.COMMENT);
const checkpointNameString = z.string().min(1).max(FIELD_LIMITS.CHECKPOINT_NAME);
const priorityNumber = z.number().int().min(0).max(3);

// Arrays with item limits
const linksArray = z.array(linkString).max(FIELD_LIMITS.ARRAY_MAX_ITEMS);
const tagsArray = z.array(tagString).max(FIELD_LIMITS.ARRAY_MAX_ITEMS);
const dependsOnArray = z.array(nonEmptyString).max(FIELD_LIMITS.ARRAY_MAX_ITEMS);

// Metadata with size constraints
const metadataRecord = z
  .record(z.unknown())
  .refine(
    (obj) => Object.keys(obj).length <= FIELD_LIMITS.METADATA_MAX_KEYS,
    { message: `Metadata cannot have more than ${FIELD_LIMITS.METADATA_MAX_KEYS} keys` }
  )
  .refine(
    (obj) => JSON.stringify(obj).length <= FIELD_LIMITS.METADATA_MAX_BYTES,
    { message: `Metadata cannot exceed ${FIELD_LIMITS.METADATA_MAX_BYTES} bytes` }
  );

// Checkpoint data with size constraints
const checkpointDataRecord = z
  .record(z.unknown())
  .refine(
    (obj) => JSON.stringify(obj).length <= FIELD_LIMITS.CHECKPOINT_DATA_MAX_BYTES,
    { message: `Checkpoint data cannot exceed ${FIELD_LIMITS.CHECKPOINT_DATA_MAX_BYTES} bytes` }
  );

// =============================================================================
// Event Data Schemas
// =============================================================================

const TaskCreatedSchema = z.object({
  title: titleString,
  project: projectName,
  parent_id: nonEmptyString.optional(),
  description: descriptionString.optional(),
  links: linksArray.optional(),
  depends_on: dependsOnArray.optional(),
  tags: tagsArray.optional(),
  priority: priorityNumber.optional(),
  due_at: isoDateTime.optional(),
  metadata: metadataRecord.optional(),
  assignee: z.string().max(FIELD_LIMITS.IDENTIFIER).optional(),
});

const StatusChangedSchema = z.object({
  from: z.nativeEnum(TaskStatus),
  to: z.nativeEnum(TaskStatus),
  // Deprecated: kept for backward compatibility with existing events.
  // New code emits CommentAdded events instead of embedding reason here.
  reason: reasonString.optional(),
  lease_until: isoDateTime.optional(),
});

const TaskMovedSchema = z.object({
  from_project: projectName,
  to_project: projectName,
});

const DependencySchema = z.object({
  depends_on_id: nonEmptyString,
});

// =============================================================================
// TaskUpdated Schema with explicit field whitelist (prevents SQL injection)
// =============================================================================

// Explicit list of updatable fields - MUST match tasks_current table columns
export const UPDATABLE_TASK_FIELDS = [
  'title',
  'description',
  'links',
  'tags',
  'priority',
  'due_at',
  'metadata',
  'parent_id',
  'assignee',
] as const;

export type UpdatableTaskField = (typeof UPDATABLE_TASK_FIELDS)[number];

// Type-safe validator map
const updatableFieldValidators: Record<UpdatableTaskField, z.ZodSchema<unknown>> = {
  title: titleString,
  description: descriptionString.nullable(),
  links: linksArray,
  tags: tagsArray,
  priority: priorityNumber,
  due_at: isoDateTime.nullable(),
  metadata: metadataRecord,
  parent_id: nonEmptyString.nullable(),
  assignee: z.string().max(FIELD_LIMITS.IDENTIFIER).nullable(),
};

const TaskUpdatedSchema = z
  .object({
    field: z.enum(UPDATABLE_TASK_FIELDS),
    old_value: z.unknown().optional(),
    new_value: z.unknown(),
  })
  .superRefine((data, ctx) => {
    const validator = updatableFieldValidators[data.field];
    const result = validator.safeParse(data.new_value);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ['new_value', ...issue.path],
        });
      }
    }
  });

const TaskArchivedSchema = z.object({
  reason: reasonString.optional(),
});

const CommentAddedSchema = z.object({
  text: commentString,
});

const CheckpointRecordedSchema = z.object({
  name: checkpointNameString,
  data: checkpointDataRecord.optional(),
  progress: z.number().int().min(0).max(100).optional(),
});

const ProjectCreatedSchema = z.object({
  name: projectName,
  description: descriptionString.optional(),
  is_protected: z.boolean().optional(),
});

const ProjectRenamedSchema = z.object({
  old_name: projectName,
  new_name: projectName,
});

const ProjectDeletedSchema = z.object({
  name: nonEmptyString,
  task_count: z.number().int().min(0),
  archived_task_count: z.number().int().min(0),
});

// =============================================================================
// Schema Registry and Validation
// =============================================================================

export const EventSchemas: Record<EventType, z.ZodSchema<unknown>> = {
  [EventType.TaskCreated]: TaskCreatedSchema,
  [EventType.StatusChanged]: StatusChangedSchema,
  [EventType.TaskMoved]: TaskMovedSchema,
  [EventType.DependencyAdded]: DependencySchema,
  [EventType.DependencyRemoved]: DependencySchema,
  [EventType.TaskUpdated]: TaskUpdatedSchema,
  [EventType.TaskArchived]: TaskArchivedSchema,
  [EventType.CommentAdded]: CommentAddedSchema,
  [EventType.CheckpointRecorded]: CheckpointRecordedSchema,
  [EventType.ProjectCreated]: ProjectCreatedSchema,
  [EventType.ProjectRenamed]: ProjectRenamedSchema,
  [EventType.ProjectDeleted]: ProjectDeletedSchema,
};

export function validateEventData(type: EventType, data: unknown): void {
  const schema = EventSchemas[type];
  if (!schema) {
    throw new Error(`No schema for event type: ${type}`);
  }
  schema.parse(data);
}

// =============================================================================
// Inferred Types
// =============================================================================

export type TaskCreatedData = z.infer<typeof TaskCreatedSchema>;
export type StatusChangedData = z.infer<typeof StatusChangedSchema>;
export type TaskMovedData = z.infer<typeof TaskMovedSchema>;
export type DependencyData = z.infer<typeof DependencySchema>;
export type TaskUpdatedData = z.infer<typeof TaskUpdatedSchema>;
export type TaskArchivedData = z.infer<typeof TaskArchivedSchema>;
export type CommentAddedData = z.infer<typeof CommentAddedSchema>;
export type CheckpointRecordedData = z.infer<typeof CheckpointRecordedSchema>;
export type ProjectCreatedData = z.infer<typeof ProjectCreatedSchema>;
export type ProjectRenamedData = z.infer<typeof ProjectRenamedSchema>;
export type ProjectDeletedData = z.infer<typeof ProjectDeletedSchema>;

export const PROJECT_EVENT_TASK_ID = '__project__';
