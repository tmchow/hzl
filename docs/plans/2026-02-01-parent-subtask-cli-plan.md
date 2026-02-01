# Parent/Subtask CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose `parent_id` through the CLI to enable hierarchical task organization with max 1 level of nesting.

**Architecture:** Add `--parent` option to `add` and `update` commands; add `--parent` and `--root` filters to `list`; update `next` to only return leaf tasks; display parent/subtasks in `show`; add archive cascade behavior. Core service already supports `parent_id` - this is primarily CLI wiring with validation logic.

**Tech Stack:** TypeScript, Commander.js, Vitest, SQLite

**Key Design Decisions:**
- Max 1 level of nesting (no grandchildren)
- Parent tasks never returned by `hzl task next` (they're organizational only)
- Project always inherited from parent (no `--project` validation needed)
- Archive requires explicit `--cascade` or `--orphan` for parents with active subtasks

---

## Task 1: Add `getSubtasks` method to TaskService

**Files:**
- Modify: `packages/hzl-core/src/services/task-service.ts`
- Test: `packages/hzl-core/src/services/task-service.test.ts`

**Why first:** Other tasks depend on this method.

**Step 1: Write failing test**

Add to `packages/hzl-core/src/services/task-service.test.ts`:

```typescript
describe('getSubtasks', () => {
  it('returns subtasks of a task', () => {
    projectService.createProject('myproject');
    const parent = taskService.createTask({ title: 'Parent', project: 'myproject' });
    const child1 = taskService.createTask({ title: 'Child 1', project: 'myproject', parent_id: parent.task_id });
    const child2 = taskService.createTask({ title: 'Child 2', project: 'myproject', parent_id: parent.task_id });
    taskService.createTask({ title: 'Other', project: 'myproject' });

    const subtasks = taskService.getSubtasks(parent.task_id);
    expect(subtasks).toHaveLength(2);
    expect(subtasks.map(t => t.task_id).sort()).toEqual([child1.task_id, child2.task_id].sort());
  });

  it('returns empty array when no subtasks', () => {
    const task = taskService.createTask({ title: 'Lonely', project: 'inbox' });
    const subtasks = taskService.getSubtasks(task.task_id);
    expect(subtasks).toHaveLength(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -w hzl-core -- src/services/task-service.test.ts`
Expected: FAIL - `getSubtasks` doesn't exist

**Step 3: Implement getSubtasks**

Add to `packages/hzl-core/src/services/task-service.ts` (in TaskService class):

```typescript
// Add prepared statement in constructor (after other statements)
private getSubtasksStmt: Database.Statement;

// In constructor body:
this.getSubtasksStmt = db.prepare(`
  SELECT task_id, title, project, status, parent_id, description,
         links, tags, priority, due_at, metadata,
         claimed_at, claimed_by_author, claimed_by_agent_id, lease_until,
         created_at, updated_at
  FROM tasks_current
  WHERE parent_id = ?
  ORDER BY priority DESC, created_at ASC
`);

// Add method (near getTaskById)
getSubtasks(taskId: string): Task[] {
  const rows = this.getSubtasksStmt.all(taskId) as TaskRow[];
  return rows.map((row) => this.rowToTask(row));
}
```

Note: Use existing `rowToTask` method - do not duplicate.

**Step 4: Run tests to verify they pass**

Run: `npm test -w hzl-core -- src/services/task-service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/services/task-service.ts packages/hzl-core/src/services/task-service.test.ts
git commit -m "feat(core): add getSubtasks method to TaskService"
```

---

## Task 2: Add `--parent` option to `hzl task add`

**Files:**
- Modify: `packages/hzl-cli/src/commands/task/add.ts`
- Test: `packages/hzl-cli/src/commands/task/add.test.ts`

**Step 1: Write failing tests for parent option**

Add to `packages/hzl-cli/src/commands/task/add.test.ts`:

```typescript
it('creates a subtask with parent', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });

  const result = runAdd({
    services,
    project: 'inbox', // ignored when parent specified
    title: 'Subtask',
    parent: parent.task_id,
    json: false,
  });

  expect(result.task_id).toBeDefined();
  const task = services.taskService.getTaskById(result.task_id);
  expect(task?.parent_id).toBe(parent.task_id);
  expect(task?.project).toBe('myproject'); // inherited from parent
});

it('inherits project from parent, ignoring --project', () => {
  services.projectService.createProject('myproject');
  services.projectService.createProject('other');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });

  const result = runAdd({
    services,
    project: 'other', // should be ignored
    title: 'Subtask',
    parent: parent.task_id,
    json: false,
  });

  const task = services.taskService.getTaskById(result.task_id);
  expect(task?.project).toBe('myproject'); // not 'other'
});

it('errors when parent does not exist', () => {
  expect(() => runAdd({
    services,
    project: 'inbox',
    title: 'Subtask',
    parent: 'nonexistent',
    json: false,
  })).toThrow(/parent.*not found/i);
});

it('errors when parent is archived', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
  services.taskService.archiveTask(parent.task_id);

  expect(() => runAdd({
    services,
    project: 'inbox',
    title: 'Subtask',
    parent: parent.task_id,
    json: false,
  })).toThrow(/parent.*archived/i);
});

it('errors when parent already has a parent (max 1 level)', () => {
  services.projectService.createProject('myproject');
  const grandparent = services.taskService.createTask({ title: 'Grandparent', project: 'myproject' });
  const parent = services.taskService.createTask({
    title: 'Parent',
    project: 'myproject',
    parent_id: grandparent.task_id
  });

  expect(() => runAdd({
    services,
    project: 'inbox',
    title: 'Grandchild',
    parent: parent.task_id,
    json: false,
  })).toThrow(/max.*level|cannot create subtask of a subtask/i);
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -w hzl-cli -- src/commands/task/add.test.ts`
Expected: FAIL - `parent` property doesn't exist on options

**Step 3: Implement `--parent` option in add command**

Modify `packages/hzl-cli/src/commands/task/add.ts`:

```typescript
// Add import at top
import { CLIError, ExitCode, handleError } from '../../errors.js';

// Add to AddOptions interface
export interface AddOptions {
  services: Services;
  project: string;
  title: string;
  description?: string;
  tags?: string[];
  priority?: number;
  dependsOn?: string[];
  parent?: string;
  json: boolean;
}

// Add to AddCommandOptions interface
interface AddCommandOptions {
  project?: string;
  description?: string;
  tags?: string;
  priority?: string;
  dependsOn?: string;
  parent?: string;
}

// Modify runAdd function
export function runAdd(options: AddOptions): AddResult {
  const { services, title, description, tags, priority, dependsOn, parent, json } = options;
  let project = options.project;

  // Validate parent and inherit project
  if (parent) {
    const parentTask = services.taskService.getTaskById(parent);
    if (!parentTask) {
      throw new CLIError(`Parent task not found: ${parent}`, ExitCode.NotFound);
    }
    if (parentTask.status === 'archived') {
      throw new CLIError(`Cannot create subtask of archived parent: ${parent}`, ExitCode.InvalidInput);
    }
    if (parentTask.parent_id) {
      throw new CLIError(
        'Cannot create subtask of a subtask (max 1 level of nesting)',
        ExitCode.InvalidInput
      );
    }
    // Always inherit project from parent
    project = parentTask.project;
  }

  const task = services.taskService.createTask({
    title,
    project,
    description,
    tags,
    priority,
    depends_on: dependsOn,
    parent_id: parent,
  });

  // ... rest unchanged (result building and output)
}

// Add to createAddCommand options
.option('--parent <taskId>', 'Parent task ID (creates subtask, inherits project)')

// Update action handler
.action(function (this: Command, title: string, opts: AddCommandOptions) {
  const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
  const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
  const services = initializeDb({ eventsDbPath, cacheDbPath });
  try {
    runAdd({
      services,
      project: opts.project ?? 'inbox',
      title,
      description: opts.description,
      tags: opts.tags?.split(','),
      priority: parseInt(opts.priority ?? '0', 10),
      dependsOn: opts.dependsOn?.split(','),
      parent: opts.parent,
      json: globalOpts.json ?? false,
    });
  } catch (e) {
    handleError(e, globalOpts.json);
  } finally {
    closeDb(services);
  }
});
```

**Step 4: Run tests to verify they pass**

Run: `npm test -w hzl-cli -- src/commands/task/add.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/commands/task/add.ts packages/hzl-cli/src/commands/task/add.test.ts
git commit -m "feat(cli): add --parent option to task add command"
```

---

## Task 3: Add `--parent` option to `hzl task update`

**Files:**
- Modify: `packages/hzl-cli/src/commands/task/update.ts`
- Test: `packages/hzl-cli/src/commands/task/update.test.ts`

**Step 1: Write failing tests for parent update**

Add to `packages/hzl-cli/src/commands/task/update.test.ts`:

```typescript
it('sets parent on task', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
  const child = services.taskService.createTask({ title: 'Child', project: 'myproject' });

  runUpdate({
    services,
    taskId: child.task_id,
    updates: { parent_id: parent.task_id },
    json: false,
  });

  const updated = services.taskService.getTaskById(child.task_id);
  expect(updated?.parent_id).toBe(parent.task_id);
});

it('moves task to parent project when setting parent', () => {
  services.projectService.createProject('project-a');
  services.projectService.createProject('project-b');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'project-a' });
  const child = services.taskService.createTask({ title: 'Child', project: 'project-b' });

  runUpdate({
    services,
    taskId: child.task_id,
    updates: { parent_id: parent.task_id },
    json: false,
  });

  const updated = services.taskService.getTaskById(child.task_id);
  expect(updated?.parent_id).toBe(parent.task_id);
  expect(updated?.project).toBe('project-a');
});

it('removes parent when set to null', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
  const child = services.taskService.createTask({
    title: 'Child',
    project: 'myproject',
    parent_id: parent.task_id,
  });

  runUpdate({
    services,
    taskId: child.task_id,
    updates: { parent_id: null },
    json: false,
  });

  const updated = services.taskService.getTaskById(child.task_id);
  expect(updated?.parent_id).toBeNull();
  expect(updated?.project).toBe('myproject'); // stays in same project
});

it('errors when parent does not exist', () => {
  const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });

  expect(() => runUpdate({
    services,
    taskId: task.task_id,
    updates: { parent_id: 'nonexistent' },
    json: false,
  })).toThrow(/parent.*not found/i);
});

it('errors when setting self as parent', () => {
  const task = services.taskService.createTask({ title: 'Test', project: 'inbox' });

  expect(() => runUpdate({
    services,
    taskId: task.task_id,
    updates: { parent_id: task.task_id },
    json: false,
  })).toThrow(/cannot be its own parent/i);
});

it('errors when parent already has a parent (max 1 level)', () => {
  services.projectService.createProject('myproject');
  const grandparent = services.taskService.createTask({ title: 'Grandparent', project: 'myproject' });
  const parent = services.taskService.createTask({
    title: 'Parent',
    project: 'myproject',
    parent_id: grandparent.task_id
  });
  const task = services.taskService.createTask({ title: 'Task', project: 'myproject' });

  expect(() => runUpdate({
    services,
    taskId: task.task_id,
    updates: { parent_id: parent.task_id },
    json: false,
  })).toThrow(/max.*level|subtask of a subtask/i);
});

it('errors when task has children (cannot make parent into subtask)', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
  services.taskService.createTask({
    title: 'Child',
    project: 'myproject',
    parent_id: parent.task_id
  });
  const newParent = services.taskService.createTask({ title: 'New Parent', project: 'myproject' });

  expect(() => runUpdate({
    services,
    taskId: parent.task_id,
    updates: { parent_id: newParent.task_id },
    json: false,
  })).toThrow(/has children|cannot make.*parent.*into.*subtask/i);
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -w hzl-cli -- src/commands/task/update.test.ts`
Expected: FAIL

**Step 3: Implement parent update logic**

Modify `packages/hzl-cli/src/commands/task/update.ts`:

```typescript
// Add to TaskUpdates interface
export interface TaskUpdates {
  title?: string;
  description?: string;
  priority?: number;
  tags?: string[];
  parent_id?: string | null;
}

// Add to UpdateCommandOptions interface
interface UpdateCommandOptions {
  title?: string;
  desc?: string;
  priority?: string;
  tags?: string;
  parent?: string;
}

// Modify runUpdate function - add parent_id handling before other field updates
export function runUpdate(options: {
  services: Services;
  taskId: string;
  updates: TaskUpdates;
  json: boolean;
}): UpdateResult {
  const { services, taskId, updates, json } = options;
  const { eventStore, projectionEngine } = services;

  const task = services.taskService.getTaskById(taskId);
  if (!task) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  }

  // Handle parent_id update with validation
  if (updates.parent_id !== undefined) {
    if (updates.parent_id === null) {
      // Remove parent
      if (task.parent_id !== null) {
        const event = eventStore.append({
          task_id: taskId,
          type: EventType.TaskUpdated,
          data: { field: 'parent_id', old_value: task.parent_id, new_value: null },
        });
        projectionEngine.applyEvent(event);
      }
    } else {
      // Set parent - validate
      if (updates.parent_id === taskId) {
        throw new CLIError('A task cannot be its own parent', ExitCode.InvalidInput);
      }

      const parentTask = services.taskService.getTaskById(updates.parent_id);
      if (!parentTask) {
        throw new CLIError(`Parent task not found: ${updates.parent_id}`, ExitCode.NotFound);
      }

      if (parentTask.status === 'archived') {
        throw new CLIError(`Cannot set archived task as parent: ${updates.parent_id}`, ExitCode.InvalidInput);
      }

      if (parentTask.parent_id) {
        throw new CLIError(
          'Cannot set parent: target is already a subtask (max 1 level of nesting)',
          ExitCode.InvalidInput
        );
      }

      // Check if task has children
      const children = services.taskService.getSubtasks(taskId);
      if (children.length > 0) {
        throw new CLIError(
          'Cannot make a parent task into a subtask (task has children)',
          ExitCode.InvalidInput
        );
      }

      // Move to parent's project if different
      if (task.project !== parentTask.project) {
        services.taskService.moveTask(taskId, parentTask.project);
      }

      if (task.parent_id !== updates.parent_id) {
        const event = eventStore.append({
          task_id: taskId,
          type: EventType.TaskUpdated,
          data: { field: 'parent_id', old_value: task.parent_id, new_value: updates.parent_id },
        });
        projectionEngine.applyEvent(event);
      }
    }
  }

  // ... rest of existing field updates (title, description, priority, tags) unchanged

// Add to createUpdateCommand options
.option('--parent <taskId>', 'Set parent task (use "" to remove)')

// Modify action handler
.action(function (this: Command, taskId: string, opts: UpdateCommandOptions) {
  const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
  const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
  const services = initializeDb({ eventsDbPath, cacheDbPath });
  try {
    const updates: TaskUpdates = {};
    if (opts.title) updates.title = opts.title;
    if (opts.desc) updates.description = opts.desc;
    if (opts.priority !== undefined) updates.priority = parseInt(opts.priority, 10);
    if (opts.tags) updates.tags = opts.tags.split(',');
    if (opts.parent !== undefined) {
      updates.parent_id = opts.parent === '' ? null : opts.parent;
    }

    runUpdate({ services, taskId, updates, json: globalOpts.json ?? false });
  } catch (e) {
    handleError(e, globalOpts.json);
  } finally {
    closeDb(services);
  }
});
```

**Step 4: Run tests to verify they pass**

Run: `npm test -w hzl-cli -- src/commands/task/update.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/commands/task/update.ts packages/hzl-cli/src/commands/task/update.test.ts
git commit -m "feat(cli): add --parent option to task update command"
```

---

## Task 4: Add `--parent` and `--root` filters to `hzl task list`

**Files:**
- Modify: `packages/hzl-cli/src/commands/task/list.ts`
- Test: `packages/hzl-cli/src/commands/task/list.test.ts`

**Step 1: Write failing tests**

Add to `packages/hzl-cli/src/commands/task/list.test.ts`:

```typescript
it('filters by parent', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
  services.taskService.createTask({ title: 'Child 1', project: 'myproject', parent_id: parent.task_id });
  services.taskService.createTask({ title: 'Child 2', project: 'myproject', parent_id: parent.task_id });
  services.taskService.createTask({ title: 'Orphan', project: 'myproject' });

  const result = runList({ services, parent: parent.task_id, json: false });
  expect(result.tasks).toHaveLength(2);
  expect(result.tasks.every(t => t.title.startsWith('Child'))).toBe(true);
});

it('filters to root tasks with --root', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
  services.taskService.createTask({ title: 'Child', project: 'myproject', parent_id: parent.task_id });
  services.taskService.createTask({ title: 'Standalone', project: 'myproject' });

  const result = runList({ services, rootOnly: true, json: false });
  expect(result.tasks).toHaveLength(2); // Parent and Standalone
  expect(result.tasks.every(t => t.parent_id === null)).toBe(true);
});

it('combines --root with --status', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
  services.taskService.setStatus(parent.task_id, 'ready');
  services.taskService.createTask({ title: 'Standalone', project: 'myproject' }); // backlog

  const result = runList({ services, rootOnly: true, status: 'ready', json: false });
  expect(result.tasks).toHaveLength(1);
  expect(result.tasks[0].title).toBe('Parent');
});

it('includes parent_id in output', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
  services.taskService.createTask({ title: 'Child', project: 'myproject', parent_id: parent.task_id });

  const result = runList({ services, json: false });
  const child = result.tasks.find(t => t.title === 'Child');
  expect(child?.parent_id).toBe(parent.task_id);
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -w hzl-cli -- src/commands/task/list.test.ts`
Expected: FAIL

**Step 3: Implement parent and root filters**

Modify `packages/hzl-cli/src/commands/task/list.ts`:

```typescript
// Update TaskListItem interface
export interface TaskListItem {
  task_id: string;
  title: string;
  project: string;
  status: string;
  priority: number;
  parent_id: string | null;
  created_at: string;
}

// Update ListOptions interface
export interface ListOptions {
  services: Services;
  project?: string;
  status?: TaskStatus;
  availableOnly?: boolean;
  parent?: string;
  rootOnly?: boolean;
  limit?: number;
  json: boolean;
}

// Update ListCommandOptions interface
interface ListCommandOptions {
  project?: string;
  status?: string;
  available?: boolean;
  parent?: string;
  root?: boolean;
  limit?: string;
}

// Modify runList function
export function runList(options: ListOptions): ListResult {
  const { services, project, status, availableOnly, parent, rootOnly, limit = 50, json } = options;
  const db = services.cacheDb;

  let query = `
    SELECT task_id, title, project, status, priority, parent_id, created_at
    FROM tasks_current
    WHERE status != 'archived'
  `;
  const params: Array<string | number> = [];

  if (project) {
    query += ' AND project = ?';
    params.push(project);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (parent) {
    query += ' AND parent_id = ?';
    params.push(parent);
  }

  if (rootOnly) {
    query += ' AND parent_id IS NULL';
  }

  if (availableOnly) {
    query += ` AND status = 'ready' AND NOT EXISTS (
      SELECT 1 FROM task_dependencies td
      JOIN tasks_current dep ON td.depends_on_id = dep.task_id
      WHERE td.task_id = tasks_current.task_id AND dep.status != 'done'
    )`;
  }

  query += ' ORDER BY priority DESC, created_at ASC, task_id ASC';
  query += ' LIMIT ?';
  params.push(limit);

  const rows = db.prepare(query).all(...params) as TaskListItem[];

  const result: ListResult = {
    tasks: rows,
    total: rows.length,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    if (rows.length === 0) {
      console.log('No tasks found');
    } else {
      console.log('Tasks:');
      for (const task of rows) {
        const statusIcon = task.status === 'done' ? '✓' : task.status === 'in_progress' ? '→' : '○';
        console.log(`  ${statusIcon} [${task.task_id.slice(0, 8)}] ${task.title} (${task.project})`);
      }
    }
  }

  return result;
}

// Add to createListCommand options
.option('--parent <taskId>', 'Filter by parent task')
.option('--root', 'Show only root tasks (no parent)', false)

// Update action handler
rootOnly: opts.root,
parent: opts.parent,
```

**Step 4: Run tests to verify they pass**

Run: `npm test -w hzl-cli -- src/commands/task/list.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/commands/task/list.ts packages/hzl-cli/src/commands/task/list.test.ts
git commit -m "feat(cli): add --parent and --root filters to task list"
```

---

## Task 5: Display parent and subtasks in `hzl task show`

**Files:**
- Modify: `packages/hzl-cli/src/commands/task/show.ts`
- Test: `packages/hzl-cli/src/commands/task/show.test.ts`

**Step 1: Write failing tests**

Add to `packages/hzl-cli/src/commands/task/show.test.ts`:

```typescript
it('shows parent task info', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
  const child = services.taskService.createTask({
    title: 'Child',
    project: 'myproject',
    parent_id: parent.task_id,
  });

  const result = runShow({ services, taskId: child.task_id, json: false });
  expect(result.task.parent_id).toBe(parent.task_id);
});

it('includes subtasks in output', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
  services.taskService.createTask({ title: 'Child 1', project: 'myproject', parent_id: parent.task_id });
  services.taskService.createTask({ title: 'Child 2', project: 'myproject', parent_id: parent.task_id });

  const result = runShow({ services, taskId: parent.task_id, json: false });
  expect(result.subtasks).toHaveLength(2);
  expect(result.subtasks?.map(s => s.title).sort()).toEqual(['Child 1', 'Child 2']);
});

it('excludes subtasks with --no-subtasks', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
  services.taskService.createTask({ title: 'Child', project: 'myproject', parent_id: parent.task_id });

  const result = runShow({ services, taskId: parent.task_id, showSubtasks: false, json: false });
  expect(result.subtasks).toBeUndefined();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -w hzl-cli -- src/commands/task/show.test.ts`
Expected: FAIL

**Step 3: Implement parent and subtasks display**

Modify `packages/hzl-cli/src/commands/task/show.ts`:

```typescript
// Update ShowResult interface
export interface ShowResult {
  task: {
    task_id: string;
    title: string;
    project: string;
    status: string;
    priority: number;
    parent_id: string | null;
    description: string | null;
    tags: string[];
    created_at: string;
    updated_at: string;
    claimed_by_author: string | null;
    claimed_by_agent_id: string | null;
  };
  comments: Array<{ text: string; author?: string; timestamp: string }>;
  checkpoints: Array<{ name: string; data: Record<string, unknown>; timestamp: string }>;
  subtasks?: Array<{ task_id: string; title: string; status: string }>;
}

// Update runShow function signature and implementation
export function runShow(options: {
  services: Services;
  taskId: string;
  showSubtasks?: boolean;
  json: boolean;
}): ShowResult {
  const { services, taskId, showSubtasks = true, json } = options;

  const task = services.taskService.getTaskById(taskId);
  if (!task) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  }

  const comments = services.taskService.getComments(taskId);
  const checkpoints = services.taskService.getCheckpoints(taskId);

  const subtasks = showSubtasks
    ? services.taskService.getSubtasks(taskId).map(t => ({
        task_id: t.task_id,
        title: t.title,
        status: t.status,
      }))
    : undefined;

  const result: ShowResult = {
    task: {
      task_id: task.task_id,
      title: task.title,
      project: task.project,
      status: task.status,
      priority: task.priority,
      parent_id: task.parent_id,
      description: task.description,
      tags: task.tags,
      created_at: task.created_at,
      updated_at: task.updated_at,
      claimed_by_author: task.claimed_by_author,
      claimed_by_agent_id: task.claimed_by_agent_id,
    },
    comments: comments.map((c: Comment) => ({
      text: c.text,
      author: c.author,
      timestamp: c.timestamp,
    })),
    checkpoints: checkpoints.map((cp: Checkpoint) => ({
      name: cp.name,
      data: cp.data,
      timestamp: cp.timestamp,
    })),
    subtasks,
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Task: ${task.task_id}`);
    console.log(`Title: ${task.title}`);
    console.log(`Project: ${task.project}`);
    console.log(`Status: ${task.status}`);
    console.log(`Priority: ${task.priority}`);
    console.log(`Parent: ${task.parent_id ?? '(none)'}`);
    if (task.description) console.log(`Description: ${task.description}`);
    if (task.tags.length > 0) console.log(`Tags: ${task.tags.join(', ')}`);
    if (task.claimed_by_author) console.log(`Claimed by: ${task.claimed_by_author}`);
    console.log(`Created: ${task.created_at}`);
    console.log(`Updated: ${task.updated_at}`);

    if (comments.length > 0) {
      console.log(`\nComments (${comments.length}):`);
      for (const c of comments) {
        console.log(`  [${c.timestamp}] ${c.author ?? 'anon'}: ${c.text}`);
      }
    }

    if (checkpoints.length > 0) {
      console.log(`\nCheckpoints (${checkpoints.length}):`);
      for (const cp of checkpoints) {
        console.log(`  [${cp.timestamp}] ${cp.name}`);
      }
    }

    if (subtasks && subtasks.length > 0) {
      console.log(`\nSubtasks (${subtasks.length}):`);
      for (const st of subtasks) {
        const icon = st.status === 'done' ? '✓' : st.status === 'in_progress' ? '→' : '○';
        console.log(`  ${icon} [${st.task_id.slice(0, 8)}] ${st.title} (${st.status})`);
      }
    }
  }

  return result;
}

// Add option to command
.option('--no-subtasks', 'Hide subtasks in output')

// Update action handler
.action(function (this: Command, taskId: string, opts: { subtasks?: boolean }) {
  const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
  const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
  const services = initializeDb({ eventsDbPath, cacheDbPath });
  try {
    runShow({
      services,
      taskId,
      showSubtasks: opts.subtasks !== false,
      json: globalOpts.json ?? false
    });
  } catch (e) {
    handleError(e, globalOpts.json);
  } finally {
    closeDb(services);
  }
});
```

**Step 4: Run tests to verify they pass**

Run: `npm test -w hzl-cli -- src/commands/task/show.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/commands/task/show.ts packages/hzl-cli/src/commands/task/show.test.ts
git commit -m "feat(cli): display parent and subtasks in task show"
```

---

## Task 6: Update `hzl task next` to only return leaf tasks

**Files:**
- Modify: `packages/hzl-cli/src/commands/task/next.ts`
- Test: `packages/hzl-cli/src/commands/task/next.test.ts`

**Step 1: Read existing next.ts to understand current implementation**

Run: Read `packages/hzl-cli/src/commands/task/next.ts`

**Step 2: Write failing tests**

Add to `packages/hzl-cli/src/commands/task/next.test.ts`:

```typescript
it('skips parent tasks (returns leaf tasks only)', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
  services.taskService.setStatus(parent.task_id, 'ready');
  const child = services.taskService.createTask({
    title: 'Child',
    project: 'myproject',
    parent_id: parent.task_id
  });
  services.taskService.setStatus(child.task_id, 'ready');

  const result = runNext({ services, project: 'myproject', json: false });
  expect(result?.task_id).toBe(child.task_id); // Returns child, not parent
});

it('returns standalone tasks (no children, no parent)', () => {
  services.projectService.createProject('myproject');
  const standalone = services.taskService.createTask({ title: 'Standalone', project: 'myproject' });
  services.taskService.setStatus(standalone.task_id, 'ready');

  const result = runNext({ services, project: 'myproject', json: false });
  expect(result?.task_id).toBe(standalone.task_id);
});

it('filters by parent with --parent flag', () => {
  services.projectService.createProject('myproject');
  const parent1 = services.taskService.createTask({ title: 'Parent 1', project: 'myproject' });
  const parent2 = services.taskService.createTask({ title: 'Parent 2', project: 'myproject' });
  const child1 = services.taskService.createTask({
    title: 'Child of P1',
    project: 'myproject',
    parent_id: parent1.task_id
  });
  services.taskService.setStatus(child1.task_id, 'ready');
  const child2 = services.taskService.createTask({
    title: 'Child of P2',
    project: 'myproject',
    parent_id: parent2.task_id
  });
  services.taskService.setStatus(child2.task_id, 'ready');

  const result = runNext({ services, parent: parent1.task_id, json: false });
  expect(result?.task_id).toBe(child1.task_id);
});

it('never returns parent even when all subtasks done', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
  services.taskService.setStatus(parent.task_id, 'ready');
  const child = services.taskService.createTask({
    title: 'Child',
    project: 'myproject',
    parent_id: parent.task_id
  });
  services.taskService.setStatus(child.task_id, 'done');

  const result = runNext({ services, project: 'myproject', json: false });
  expect(result).toBeNull(); // No available leaf tasks
});
```

**Step 3: Implement leaf-only behavior and --parent filter**

The implementation depends on the current `next.ts` structure. Key changes:
- Add SQL filter to exclude tasks that have children
- Add `--parent` option to filter by parent
- Update query to join with subtask check

```typescript
// Add to NextOptions interface
parent?: string;

// Add to NextCommandOptions interface
parent?: string;

// Modify the query in runNext to exclude parent tasks
// Add this condition:
AND NOT EXISTS (
  SELECT 1 FROM tasks_current child
  WHERE child.parent_id = tasks_current.task_id
)

// If parent filter provided:
if (parent) {
  query += ' AND parent_id = ?';
  params.push(parent);
}

// Add to createNextCommand options
.option('--parent <taskId>', 'Get next subtask of specific parent')
```

**Step 4: Run tests to verify they pass**

Run: `npm test -w hzl-cli -- src/commands/task/next.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/commands/task/next.ts packages/hzl-cli/src/commands/task/next.test.ts
git commit -m "feat(cli): task next only returns leaf tasks, add --parent filter"
```

---

## Task 7: Cascade subtasks when moving parent (transactional)

**Files:**
- Modify: `packages/hzl-cli/src/commands/task/move.ts`
- Test: `packages/hzl-cli/src/commands/task/move.test.ts`

**Step 1: Write failing test**

Add to `packages/hzl-cli/src/commands/task/move.test.ts`:

```typescript
it('cascades move to subtasks', () => {
  services.projectService.createProject('project-a');
  services.projectService.createProject('project-b');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'project-a' });
  const child1 = services.taskService.createTask({
    title: 'Child 1',
    project: 'project-a',
    parent_id: parent.task_id,
  });
  const child2 = services.taskService.createTask({
    title: 'Child 2',
    project: 'project-a',
    parent_id: parent.task_id,
  });

  const result = runMove({
    services,
    taskId: parent.task_id,
    toProject: 'project-b',
    json: false,
  });

  expect(result.to_project).toBe('project-b');

  // Verify subtasks moved too
  const movedChild1 = services.taskService.getTaskById(child1.task_id);
  const movedChild2 = services.taskService.getTaskById(child2.task_id);
  expect(movedChild1?.project).toBe('project-b');
  expect(movedChild2?.project).toBe('project-b');
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -w hzl-cli -- src/commands/task/move.test.ts`
Expected: FAIL - subtasks not moved

**Step 3: Implement cascade move**

Modify `packages/hzl-cli/src/commands/task/move.ts`:

```typescript
import { withWriteTransaction } from 'hzl-core/db/transaction.js';

// Modify runMove function
export function runMove(options: {
  services: Services;
  taskId: string;
  toProject: string;
  json: boolean;
}): MoveResult {
  const { services, taskId, toProject, json } = options;

  // Use transaction to ensure atomic cascade
  return withWriteTransaction(services.eventsDb, () => {
    const task = services.taskService.getTaskById(taskId);
    if (!task) {
      throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
    }

    const fromProject = task.project;

    // Move parent
    const moved = services.taskService.moveTask(taskId, toProject);

    // Move all subtasks (only 1 level, no recursion needed)
    if (fromProject !== toProject) {
      const subtasks = services.taskService.getSubtasks(taskId);
      for (const subtask of subtasks) {
        services.taskService.moveTask(subtask.task_id, toProject);
      }
    }

    const result: MoveResult = {
      task_id: taskId,
      from_project: fromProject,
      to_project: moved.project,
    };

    if (json) {
      console.log(JSON.stringify(result));
    } else {
      if (fromProject === toProject) {
        console.log(`Task ${taskId} already in project '${toProject}'`);
      } else {
        const subtaskCount = services.taskService.getSubtasks(taskId).length;
        if (subtaskCount > 0) {
          console.log(`✓ Moved task ${taskId} and ${subtaskCount} subtasks from '${fromProject}' to '${toProject}'`);
        } else {
          console.log(`✓ Moved task ${taskId} from '${fromProject}' to '${toProject}'`);
        }
      }
    }

    return result;
  });
}
```

Note: Since we have max 1 level of nesting, no recursion is needed.

**Step 4: Run tests to verify they pass**

Run: `npm test -w hzl-cli -- src/commands/task/move.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/commands/task/move.ts packages/hzl-cli/src/commands/task/move.test.ts
git commit -m "feat(cli): cascade project move to subtasks atomically"
```

---

## Task 8: Add `--cascade` and `--orphan` flags to `hzl task archive`

**Files:**
- Modify: `packages/hzl-cli/src/commands/task/archive.ts`
- Test: `packages/hzl-cli/src/commands/task/archive.test.ts`

**Step 1: Write failing tests**

Add to `packages/hzl-cli/src/commands/task/archive.test.ts`:

```typescript
it('errors when archiving parent with active subtasks without flag', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
  services.taskService.createTask({
    title: 'Child',
    project: 'myproject',
    parent_id: parent.task_id
  });

  expect(() => runArchive({
    services,
    taskId: parent.task_id,
    json: false,
  })).toThrow(/active subtasks|--cascade|--orphan/i);
});

it('archives parent and subtasks with --cascade', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
  const child = services.taskService.createTask({
    title: 'Child',
    project: 'myproject',
    parent_id: parent.task_id
  });

  runArchive({
    services,
    taskId: parent.task_id,
    cascade: true,
    json: false,
  });

  const archivedParent = services.taskService.getTaskById(parent.task_id);
  const archivedChild = services.taskService.getTaskById(child.task_id);
  expect(archivedParent?.status).toBe('archived');
  expect(archivedChild?.status).toBe('archived');
});

it('archives parent and promotes subtasks with --orphan', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
  const child = services.taskService.createTask({
    title: 'Child',
    project: 'myproject',
    parent_id: parent.task_id
  });

  runArchive({
    services,
    taskId: parent.task_id,
    orphan: true,
    json: false,
  });

  const archivedParent = services.taskService.getTaskById(parent.task_id);
  const promotedChild = services.taskService.getTaskById(child.task_id);
  expect(archivedParent?.status).toBe('archived');
  expect(promotedChild?.status).not.toBe('archived');
  expect(promotedChild?.parent_id).toBeNull();
});

it('archives normally when no active subtasks', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });
  const child = services.taskService.createTask({
    title: 'Child',
    project: 'myproject',
    parent_id: parent.task_id
  });
  services.taskService.setStatus(child.task_id, 'done');

  // Should work without flags since child is done
  runArchive({
    services,
    taskId: parent.task_id,
    json: false,
  });

  const archivedParent = services.taskService.getTaskById(parent.task_id);
  expect(archivedParent?.status).toBe('archived');
});
```

**Step 2-5: Implement and commit** (similar pattern as above)

```bash
git commit -m "feat(cli): add --cascade and --orphan flags to task archive"
```

---

## Task 9: Update documentation

**Files:**
- Modify: `/README.md`
- Modify: `docs/openclaw/skills/hzl/SKILL.md`
- Modify: `packages/hzl-marketplace/plugins/hzl-skills/skills/hzl-task-management/SKILL.md`

### Step 1: Update README.md

**Add new "Pattern: Breaking down work with subtasks" section after the "Pattern: Multi-agent backlog" section (~line 269):**

```markdown
### Pattern: Breaking down work with subtasks

HZL supports one level of parent/subtask hierarchy for organizing related work.

**Key behavior: Parent tasks are organizational containers, not actionable work.**

When you call `hzl task next`, only leaf tasks (tasks without children) are returned. Parent tasks are never returned because they represent the umbrella—work happens on the subtasks.

```bash
# Create parent task
hzl task add "Implement user authentication" -P myapp --priority 2
# → Created task abc123

# Create subtasks (project inherited automatically from parent)
hzl task add "Add login endpoint" --parent abc123
hzl task add "Add logout endpoint" --parent abc123
hzl task add "Add session management" --parent abc123

# View the breakdown
hzl task show abc123
# Shows task details plus list of subtasks

# Get next available subtask (parent is never returned)
hzl task next --project myapp
# → [def456] Add login endpoint

# Scope work to a specific parent's subtasks
hzl task next --parent abc123
# → [def456] Add login endpoint

# When all subtasks done, manually complete the parent
hzl task complete abc123
```

**Constraints:**
- Maximum 1 level of nesting (subtasks cannot have their own subtasks)
- Subtasks are always in the same project as parent (auto-inherited)
- Moving a parent moves all subtasks atomically

**Filtering:**
```bash
# See all subtasks of a task
hzl task list --parent abc123

# See only top-level tasks (no parent)
hzl task list --root

# Combine with other filters
hzl task list --root --status ready
```

**Archiving:**
```bash
# Archive parent with all subtasks
hzl task archive abc123 --cascade

# Archive parent only (subtasks promoted to top-level)
hzl task archive abc123 --orphan
```
```

**Update CLI reference (short) section (~line 416) to add subtask commands:**

After the existing task commands, add:

```markdown
# Subtasks (organization)
hzl task add "<title>" --parent <id>             # Create subtask (inherits project)
hzl task list --parent <id>                      # List subtasks of a task
hzl task list --root                             # List only top-level tasks
hzl task next --parent <id>                      # Next available subtask
hzl task show <id>                               # Shows subtasks inline
hzl task archive <id> --cascade                  # Archive parent and all subtasks
hzl task archive <id> --orphan                   # Archive parent, promote subtasks
```

### Step 2: Update OpenClaw skill (docs/openclaw/skills/hzl/SKILL.md)

**Add to Quick reference section (~line 68) after "Create tasks":**

```markdown
# Subtasks (organize related work)
hzl task add "<title>" --parent <parent-id>       # Create subtask
hzl task list --parent <parent-id>                # List subtasks
hzl task list --root                              # Top-level tasks only
hzl task next --parent <parent-id>                # Next subtask of parent
```

**Add new pattern section after "Coordinate sub-agents with leases" (~line 158):**

```markdown
### Break down work with subtasks

Use parent/subtask hierarchy to organize complex work:

```bash
# Create parent task
hzl task add "Implement vacation booking" -P portland-trip --priority 2
# → abc123

# Create subtasks (project inherited automatically)
hzl task add "Research flights" --parent abc123
hzl task add "Book hotel" --parent abc123 --depends-on <flights-id>
hzl task add "Plan activities" --parent abc123

# View breakdown
hzl task show abc123

# Work through subtasks
hzl task next --parent abc123
```

**Important:** `hzl task next` only returns leaf tasks (tasks without children). Parent tasks are organizational containers—they are never returned as "next available work."

When all subtasks are done, manually complete the parent:
```bash
hzl task complete abc123
```
```

### Step 3: Update hzl-task-management skill

**Update Core Concepts section (~line 20) to clarify task hierarchy:**

Replace the **Tasks** bullet with:

```markdown
**Tasks** are units of work within projects. Tasks can have:
- Priority (higher number = higher priority)
- Tags for categorization
- Dependencies on other tasks
- A parent task (creating a subtask relationship, max 1 level deep)

**Parent tasks** are organizational containers. They are never returned by `hzl task next`—only leaf tasks (tasks without children) are claimable work.
```

**Replace "Scenario: Breaking Down Work" section (~line 58) with expanded version:**

```markdown
## Scenario: Breaking Down Work

When facing a complex task or feature, use subtasks for organization and dependencies for sequencing.

### Using subtasks for organization

Subtasks group related work under a parent:

```bash
# Create the parent task (organizational container)
hzl task add "Implement user authentication" -P myapp --priority 2
# → Created task abc123

# Create subtasks (project inherited automatically)
hzl task add "Set up database schema" --parent abc123
hzl task add "Create auth endpoints" --parent abc123
hzl task add "Write auth tests" --parent abc123

# View the breakdown
hzl task show abc123
```

**Key behavior:** Parent tasks are organizational containers. When you call `hzl task next`, only leaf tasks (tasks without children) are returned. The parent is never "available work"—it represents the umbrella.

```bash
# Get next available subtask
hzl task next --project myapp
# → Returns a subtask, never the parent

# Scope to specific parent's subtasks
hzl task next --parent abc123
# → Returns next available subtask of abc123
```

When all subtasks are done, manually complete the parent:
```bash
hzl task complete abc123
```

### Using dependencies for sequencing

Dependencies express "must complete before" relationships:

```bash
# Create tasks with sequencing
hzl task add "Set up database schema" -P myapp --priority 2
hzl task add "Create auth endpoints" -P myapp --depends-on <schema-task-id>
hzl task add "Write auth tests" -P myapp --depends-on <endpoints-task-id>

# Validate no circular dependencies
hzl validate
```

### Combining subtasks and dependencies

Subtasks can have dependencies on other subtasks:

```bash
hzl task add "Auth feature" -P myapp --priority 2
# → parent123

hzl task add "Database schema" --parent parent123
# → schema456

hzl task add "Auth endpoints" --parent parent123 --depends-on schema456
hzl task add "Auth tests" --parent parent123 --depends-on <endpoints-id>
```

**Work breakdown principles:**
- Use subtasks to group related work under a logical parent
- Use dependencies to express sequencing requirements
- Break work into tasks that can be completed in a single session
- Parent tasks are never claimable—work happens on leaf tasks
```

**Update Command Quick Reference table (~line 227):**

Add these rows to the table:

```markdown
| Create subtask | `hzl task add "<title>" --parent <id>` |
| List subtasks | `hzl task list --parent <id>` |
| List root tasks | `hzl task list --root` |
| Next subtask | `hzl task next --parent <id>` |
| Archive cascade | `hzl task archive <id> --cascade` |
```

**Commit:**
```bash
git commit -m "docs: add subtask/parent documentation"
```

---

## Task 10: Run full test suite and typecheck

**Step 1:** `npm test`
**Step 2:** `npm run typecheck`
**Step 3:** `npm run lint`
**Step 4:** `npm run build`

---

## Summary

| Task | Description | Depends On |
|------|-------------|------------|
| 1 | Add `getSubtasks` to TaskService | - |
| 2 | Add `--parent` to `task add` | Task 1 |
| 3 | Add `--parent` to `task update` | Task 1 |
| 4 | Add `--parent` and `--root` to `task list` | - |
| 5 | Display subtasks in `task show` | Task 1 |
| 6 | Update `task next` (leaf-only, `--parent`) | Task 1 |
| 7 | Cascade move to subtasks | Task 1 |
| 8 | Add archive `--cascade`/`--orphan` | Task 1 |
| 9 | Update documentation | All above |
| 10 | Full test suite verification | All above |
