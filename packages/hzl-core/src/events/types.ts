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

// ISO-8601 datetime validation
const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
  message: 'Must be an ISO-8601 datetime string',
});

// Non-empty string
const nonEmptyString = z.string().min(1);

// Project name validation: alphanumeric start, followed by alphanumeric/hyphens/underscores
const projectName = z
  .string()
  .min(1, 'Project name cannot be empty')
  .max(255, 'Project name cannot exceed 255 characters')
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
    'Project name must start with alphanumeric and contain only alphanumeric, hyphens, and underscores'
  );

// Event data schemas
const TaskCreatedSchema = z.object({
  title: nonEmptyString,
  project: nonEmptyString,
  parent_id: nonEmptyString.optional(),
  description: z.string().max(2000).optional(),
  links: z.array(nonEmptyString).optional(),
  depends_on: z.array(nonEmptyString).optional(),
  tags: z.array(nonEmptyString).optional(),
  priority: z.number().int().min(0).max(3).optional(),
  due_at: isoDateTime.optional(),
  metadata: z.record(z.unknown()).optional(),
});

const StatusChangedSchema = z.object({
  from: z.nativeEnum(TaskStatus),
  to: z.nativeEnum(TaskStatus),
  reason: z.string().optional(),
  lease_until: isoDateTime.optional(),
});

const TaskMovedSchema = z.object({
  from_project: nonEmptyString,
  to_project: nonEmptyString,
});

const DependencySchema = z.object({
  depends_on_id: nonEmptyString,
});

const TaskUpdatedSchema = z.object({
  field: nonEmptyString,
  old_value: z.unknown().optional(),
  new_value: z.unknown(),
});

const TaskArchivedSchema = z.object({
  reason: z.string().optional(),
});

const CommentAddedSchema = z.object({
  text: nonEmptyString,
});

const CheckpointRecordedSchema = z.object({
  name: nonEmptyString,
  data: z.record(z.unknown()).optional(),
});

const ProjectCreatedSchema = z.object({
  name: projectName,
  description: z.string().optional(),
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

// Inferred types for convenience
export type TaskCreatedData = z.infer<typeof TaskCreatedSchema>;
export type StatusChangedData = z.infer<typeof StatusChangedSchema>;
export type CommentAddedData = z.infer<typeof CommentAddedSchema>;
export type CheckpointRecordedData = z.infer<typeof CheckpointRecordedSchema>;
export type ProjectCreatedData = z.infer<typeof ProjectCreatedSchema>;
export type ProjectRenamedData = z.infer<typeof ProjectRenamedSchema>;
export type ProjectDeletedData = z.infer<typeof ProjectDeletedSchema>;

export const PROJECT_EVENT_TASK_ID = '__project__';
