// packages/hzl-cli/src/commands/task.ts
import { TaskStatus } from 'hzl-core/events/types.js';
import type { Services } from '../db.js';
import type { OutputFormatter } from '../output.js';
import { CLIError, ExitCode } from '../errors.js';

export interface CreateTaskInput {
  title: string;
  project?: string;
  description?: string;
  tags?: string[];
  priority?: number;
  depends_on?: string[];
}

export function createTask(services: Services, input: CreateTaskInput, author?: string, out?: OutputFormatter): string {
  const task = services.taskService.createTask(
    {
      title: input.title,
      project: input.project ?? 'inbox',
      description: input.description,
      tags: input.tags,
      priority: input.priority,
      depends_on: input.depends_on,
    },
    { author }
  );
  out?.success(`Created task ${task.task_id}`);
  return task.task_id;
}

export function claimTask(services: Services, taskId: string, author?: string, leaseMinutes?: number, out?: OutputFormatter): void {
  const leaseUntil = leaseMinutes ? new Date(Date.now() + leaseMinutes * 60000).toISOString() : undefined;
  const task = services.taskService.claimTask(taskId, { author, lease_until: leaseUntil });
  out?.success(`Claimed task ${task.task_id}`);
}

export function claimNext(services: Services, opts: { project?: string; tags?: string[]; author?: string; leaseMinutes?: number }, out?: OutputFormatter): string | null {
  const leaseUntil = opts.leaseMinutes ? new Date(Date.now() + opts.leaseMinutes * 60000).toISOString() : undefined;
  const task = services.taskService.claimNext({
    project: opts.project,
    tags: opts.tags,
    author: opts.author,
    lease_until: leaseUntil,
  });
  if (task) {
    out?.success(`Claimed task ${task.task_id}: ${task.title}`);
    return task.task_id;
  } else {
    out?.text('No tasks available to claim');
    return null;
  }
}

export function setStatus(services: Services, taskId: string, status: TaskStatus, author?: string, out?: OutputFormatter): void {
  services.taskService.setStatus(taskId, status, { author });
  out?.success(`Set task ${taskId} status to ${status}`);
}

export function completeTask(services: Services, taskId: string, author?: string, out?: OutputFormatter): void {
  services.taskService.completeTask(taskId, { author });
  out?.success(`Completed task ${taskId}`);
}

export function releaseTask(services: Services, taskId: string, reason?: string, author?: string, out?: OutputFormatter): void {
  services.taskService.releaseTask(taskId, { reason, author });
  out?.success(`Released task ${taskId}`);
}

export function archiveTask(services: Services, taskId: string, reason?: string, author?: string, out?: OutputFormatter): void {
  services.taskService.archiveTask(taskId, { reason, author });
  out?.success(`Archived task ${taskId}`);
}

export function getTask(services: Services, taskId: string, out: OutputFormatter): void {
  const task = services.taskService.getTaskById(taskId);
  if (!task) throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  out.json(task);
}

export function listTasks(services: Services, opts: { project?: string; status?: TaskStatus; limit?: number }, out: OutputFormatter): void {
  const tasks = services.taskService.getAvailableTasks({ project: opts.project, limit: opts.limit ?? 50 })
    .filter(t => !opts.status || t.status === opts.status);
  out.table(tasks as unknown as Record<string, unknown>[], ['task_id', 'title', 'project', 'status', 'priority']);
}

export function addComment(services: Services, taskId: string, text: string, author?: string, out?: OutputFormatter): void {
  services.taskService.addComment(taskId, text, { author });
  out?.success(`Added comment to task ${taskId}`);
}

export function addCheckpoint(services: Services, taskId: string, name: string, data?: Record<string, unknown>, author?: string, out?: OutputFormatter): void {
  services.taskService.addCheckpoint(taskId, name, data, { author });
  out?.success(`Added checkpoint "${name}" to task ${taskId}`);
}
