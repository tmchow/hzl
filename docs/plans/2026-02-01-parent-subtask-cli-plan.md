# Parent/Subtask CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose `parent_id` through the CLI to enable hierarchical task organization.

**Architecture:** Add `--parent` option to `add` and `update` commands; add `--parent` filter to `list`; display parent/subtasks in `show`. Core service already supports `parent_id` - this is primarily CLI wiring with validation logic.

**Tech Stack:** TypeScript, Commander.js, Vitest, SQLite

---

## Task 1: Add `--parent` option to `hzl task add`

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
    project: 'myproject',
    title: 'Subtask',
    parent: parent.task_id,
    json: false,
  });

  expect(result.task_id).toBeDefined();
  const task = services.taskService.getTaskById(result.task_id);
  expect(task?.parent_id).toBe(parent.task_id);
});

it('inherits project from parent when not specified', () => {
  services.projectService.createProject('myproject');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'myproject' });

  const result = runAdd({
    services,
    project: 'inbox', // default, should be overridden
    title: 'Subtask',
    parent: parent.task_id,
    inheritProject: true,
    json: false,
  });

  const task = services.taskService.getTaskById(result.task_id);
  expect(task?.project).toBe('myproject');
});

it('errors when parent project differs from specified project', () => {
  services.projectService.createProject('project-a');
  services.projectService.createProject('project-b');
  const parent = services.taskService.createTask({ title: 'Parent', project: 'project-a' });

  expect(() => runAdd({
    services,
    project: 'project-b',
    title: 'Subtask',
    parent: parent.task_id,
    json: false,
  })).toThrow(/project mismatch/i);
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
```

**Step 2: Run tests to verify they fail**

Run: `npm test -w hzl-cli -- src/commands/task/add.test.ts`
Expected: FAIL - `parent` property doesn't exist on options

**Step 3: Implement `--parent` option in add command**

Modify `packages/hzl-cli/src/commands/task/add.ts`:

```typescript
// Add to AddOptions interface (around line 17)
export interface AddOptions {
  services: Services;
  project: string;
  title: string;
  description?: string;
  tags?: string[];
  priority?: number;
  dependsOn?: string[];
  parent?: string;
  inheritProject?: boolean; // true when --project not explicitly set
  json: boolean;
}

// Add to AddCommandOptions interface (around line 28)
interface AddCommandOptions {
  project?: string;
  description?: string;
  tags?: string;
  priority?: string;
  dependsOn?: string;
  parent?: string;
}

// Modify runAdd function (around line 36)
export function runAdd(options: AddOptions): AddResult {
  const { services, title, description, tags, priority, dependsOn, parent, json } = options;
  let { project } = options;
  const inheritProject = options.inheritProject ?? false;

  // Validate parent and resolve project
  if (parent) {
    const parentTask = services.taskService.getTaskById(parent);
    if (!parentTask) {
      throw new CLIError(`Parent task not found: ${parent}`, ExitCode.NotFound);
    }

    if (inheritProject) {
      // --project not specified, inherit from parent
      project = parentTask.project;
    } else if (project !== parentTask.project) {
      // --project explicitly specified but differs
      throw new CLIError(
        `Project mismatch: subtask project '${project}' differs from parent project '${parentTask.project}'`,
        ExitCode.InvalidArgument
      );
    }
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

  // ... rest unchanged
}

// Add to createAddCommand (around line 74)
.option('--parent <taskId>', 'Parent task ID (creates subtask)')

// Modify action handler to track if --project was explicitly set
.action(function (this: Command, title: string, opts: AddCommandOptions) {
  const globalOpts = GlobalOptionsSchema.parse(this.optsWithGlobals());
  const { eventsDbPath, cacheDbPath } = resolveDbPaths(globalOpts.db);
  const services = initializeDb({ eventsDbPath, cacheDbPath });
  try {
    const projectExplicitlySet = opts.project !== undefined;
    runAdd({
      services,
      project: opts.project ?? 'inbox',
      title,
      description: opts.description,
      tags: opts.tags?.split(','),
      priority: parseInt(opts.priority ?? '0', 10),
      dependsOn: opts.dependsOn?.split(','),
      parent: opts.parent,
      inheritProject: !projectExplicitlySet,
      json: globalOpts.json ?? false,
    });
  } catch (e) {
    handleError(e, globalOpts.json);
  } finally {
    closeDb(services);
  }
});
```

Also add imports at top:
```typescript
import { CLIError, ExitCode, handleError } from '../../errors.js';
```

**Step 4: Run tests to verify they pass**

Run: `npm test -w hzl-cli -- src/commands/task/add.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm test -w hzl-cli`
Expected: All tests pass

**Step 6: Commit**

```bash
git add packages/hzl-cli/src/commands/task/add.ts packages/hzl-cli/src/commands/task/add.test.ts
git commit -m "feat(cli): add --parent option to task add command"
```

---

## Task 2: Add `--parent` option to `hzl task update`

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

it('removes parent when set to empty string', () => {
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
});

it('moves task to parent project when setting parent in different project', () => {
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

it('errors on circular reference', () => {
  services.projectService.createProject('myproject');
  const taskA = services.taskService.createTask({ title: 'A', project: 'myproject' });
  const taskB = services.taskService.createTask({
    title: 'B',
    project: 'myproject',
    parent_id: taskA.task_id,
  });

  expect(() => runUpdate({
    services,
    taskId: taskA.task_id,
    updates: { parent_id: taskB.task_id },
    json: false,
  })).toThrow(/circular/i);
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -w hzl-cli -- src/commands/task/update.test.ts`
Expected: FAIL

**Step 3: Implement parent update logic**

Modify `packages/hzl-cli/src/commands/task/update.ts`:

```typescript
// Add to TaskUpdates interface (around line 17)
export interface TaskUpdates {
  title?: string;
  description?: string;
  priority?: number;
  tags?: string[];
  parent_id?: string | null;
}

// Add to UpdateCommandOptions interface (around line 24)
interface UpdateCommandOptions {
  title?: string;
  desc?: string;
  priority?: string;
  tags?: string;
  parent?: string;
}

// Add helper function before runUpdate
function wouldCreateCycle(
  services: Services,
  taskId: string,
  newParentId: string
): boolean {
  let current = newParentId;
  const visited = new Set<string>();

  while (current) {
    if (current === taskId) return true;
    if (visited.has(current)) return false; // existing cycle, not our problem
    visited.add(current);

    const parent = services.taskService.getTaskById(current);
    current = parent?.parent_id ?? '';
  }

  return false;
}

// Modify runUpdate function (around line 31)
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
      // Set parent
      if (updates.parent_id === taskId) {
        throw new CLIError('A task cannot be its own parent', ExitCode.InvalidArgument);
      }

      const parentTask = services.taskService.getTaskById(updates.parent_id);
      if (!parentTask) {
        throw new CLIError(`Parent task not found: ${updates.parent_id}`, ExitCode.NotFound);
      }

      if (wouldCreateCycle(services, taskId, updates.parent_id)) {
        throw new CLIError('Cannot set parent: would create circular reference', ExitCode.InvalidArgument);
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

  // ... rest of existing field updates unchanged (title, description, priority, tags)

// Add to createUpdateCommand options (around line 114)
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

## Task 3: Add `--parent` filter and `parent_id` output to `hzl task list`

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

**Step 3: Implement parent filter and output**

Modify `packages/hzl-cli/src/commands/task/list.ts`:

```typescript
// Add parent_id to TaskListItem interface (around line 11)
export interface TaskListItem {
  task_id: string;
  title: string;
  project: string;
  status: string;
  priority: number;
  parent_id: string | null;
  created_at: string;
}

// Add parent to ListOptions interface (around line 25)
export interface ListOptions {
  services: Services;
  project?: string;
  status?: TaskStatus;
  availableOnly?: boolean;
  parent?: string;
  limit?: number;
  json: boolean;
}

// Add parent to ListCommandOptions interface (around line 34)
interface ListCommandOptions {
  project?: string;
  status?: string;
  available?: boolean;
  parent?: string;
  limit?: string;
}

// Modify runList function query (around line 41)
export function runList(options: ListOptions): ListResult {
  const { services, project, status, availableOnly, parent, limit = 50, json } = options;
  const db = services.cacheDb;

  // Build query with filters
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

  // ... rest mostly unchanged, but update output format
  if (json) {
    console.log(JSON.stringify(result));
  } else {
    if (rows.length === 0) {
      console.log('No tasks found');
    } else {
      console.log('Tasks:');
      for (const task of rows) {
        const statusIcon = task.status === 'done' ? '✓' : task.status === 'in_progress' ? '→' : '○';
        const parentSuffix = task.parent_id ? ` [parent: ${task.parent_id.slice(0, 8)}]` : '';
        console.log(`  ${statusIcon} [${task.task_id.slice(0, 8)}] ${task.title} (${task.project})${parentSuffix}`);
      }
    }
  }

// Add to createListCommand options (around line 104)
.option('--parent <taskId>', 'Filter by parent task')

// Update action handler
parent: opts.parent,
```

**Step 4: Run tests to verify they pass**

Run: `npm test -w hzl-cli -- src/commands/task/list.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/commands/task/list.ts packages/hzl-cli/src/commands/task/list.test.ts
git commit -m "feat(cli): add --parent filter and parent_id output to task list"
```

---

## Task 4: Add `getSubtasks` method to TaskService

**Files:**
- Modify: `packages/hzl-core/src/services/task-service.ts`
- Test: `packages/hzl-core/src/services/task-service.test.ts`

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
// Add near other prepared statements in constructor (around line 190)
private getSubtasksStmt: Database.Statement;

// In constructor, add:
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
  return rows.map(this.rowToTask.bind(this));
}
```

Note: You'll need to extract the row-to-task mapping logic. If there's already a helper, use it. Otherwise add:

```typescript
private rowToTask(row: TaskRow): Task {
  return {
    task_id: row.task_id,
    title: row.title,
    project: row.project,
    status: row.status,
    parent_id: row.parent_id,
    description: row.description,
    links: JSON.parse(row.links),
    tags: JSON.parse(row.tags),
    priority: row.priority,
    due_at: row.due_at,
    metadata: JSON.parse(row.metadata),
    claimed_at: row.claimed_at,
    claimed_by_author: row.claimed_by_author,
    claimed_by_agent_id: row.claimed_by_agent_id,
    lease_until: row.lease_until,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -w hzl-core -- src/services/task-service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/services/task-service.ts packages/hzl-core/src/services/task-service.test.ts
git commit -m "feat(core): add getSubtasks method to TaskService"
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
  expect(result.subtasks.map(s => s.title).sort()).toEqual(['Child 1', 'Child 2']);
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
// Update ShowResult interface (around line 9)
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

// Update runShow function signature
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

// Add option to command (around line 96)
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

## Task 6: Cascade subtasks when moving parent to new project

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
// Add helper function to recursively move subtasks
function moveSubtasksRecursively(
  services: Services,
  parentId: string,
  toProject: string
): void {
  const subtasks = services.taskService.getSubtasks(parentId);
  for (const subtask of subtasks) {
    if (subtask.project !== toProject) {
      services.taskService.moveTask(subtask.task_id, toProject);
    }
    // Recursively move grandchildren
    moveSubtasksRecursively(services, subtask.task_id, toProject);
  }
}

// Modify runMove function (around line 14)
export function runMove(options: {
  services: Services;
  taskId: string;
  toProject: string;
  json: boolean;
}): MoveResult {
  const { services, taskId, toProject, json } = options;
  const task = services.taskService.getTaskById(taskId);
  if (!task) {
    throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound);
  }

  const fromProject = task.project;

  const moved = services.taskService.moveTask(taskId, toProject);

  // Cascade to subtasks
  if (fromProject !== toProject) {
    moveSubtasksRecursively(services, taskId, toProject);
  }

  // ... rest unchanged
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -w hzl-cli -- src/commands/task/move.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/commands/task/move.ts packages/hzl-cli/src/commands/task/move.test.ts
git commit -m "feat(cli): cascade project move to subtasks"
```

---

## Task 7: Update documentation

**Files:**
- Modify: `/README.md`
- Modify: `docs/openclaw/skills/hzl/SKILL.md`
- Modify: `packages/hzl-marketplace/plugins/hzl-skills/skills/hzl-task-management/SKILL.md`

**Step 1: Update README.md**

Add subtask examples to the CLI usage section:

```markdown
### Subtasks

Create hierarchical task structures:

```bash
# Create a parent task
hzl task add "Implement authentication" -P myapp

# Create subtasks (project inherited from parent)
hzl task add "Add login endpoint" --parent <parent-id>
hzl task add "Add logout endpoint" --parent <parent-id>

# View subtasks
hzl task show <parent-id>
hzl task list --parent <parent-id>

# Move subtask to different parent (moves to that parent's project)
hzl task update <task-id> --parent <new-parent-id>

# Remove parent relationship
hzl task update <task-id> --parent ""
```

Subtasks must be in the same project as their parent. Moving a parent task cascades to all subtasks.
```

**Step 2: Update OpenClaw skill**

Add to `docs/openclaw/skills/hzl/SKILL.md` quick reference:

```markdown
# Subtasks
hzl task add "<title>" --parent <parent-id>  # Create subtask (inherits project)
hzl task list --parent <parent-id>           # List subtasks
hzl task update <id> --parent <new-parent>   # Move to new parent
hzl task update <id> --parent ""             # Remove parent
```

Add subtask pattern section:

```markdown
### Break down with subtasks

Use subtasks to decompose large tasks:

```bash
# Create parent task
hzl task add "Implement user authentication" -P myapp --priority 3
# Note the task_id from output

# Create subtasks (project inherited automatically)
hzl task add "Design auth data model" --parent <auth-id>
hzl task add "Implement login endpoint" --parent <auth-id>
hzl task add "Implement logout endpoint" --parent <auth-id>
hzl task add "Write auth tests" --parent <auth-id>

# View the breakdown
hzl task show <auth-id>
```

Subtasks are independently claimable. Complete them in any order based on priority and dependencies.
```

**Step 3: Update marketplace skill**

Update `packages/hzl-marketplace/plugins/hzl-skills/skills/hzl-task-management/SKILL.md`:

In Core Concepts, update Tasks section:
```markdown
**Tasks** are units of work within projects. Tasks can have:
- Priority (higher number = higher priority)
- Tags for categorization
- Dependencies on other tasks
- Subtasks via `--parent` for hierarchical decomposition
```

Add to Command Quick Reference:
```markdown
| Create subtask | `hzl task add "<title>" --parent <id>` |
| List subtasks | `hzl task list --parent <id>` |
| Change parent | `hzl task update <id> --parent <new-id>` |
| Remove parent | `hzl task update <id> --parent ""` |
```

Update "Scenario: Breaking Down Work" section with subtask example.

**Step 4: Commit documentation**

```bash
git add README.md docs/openclaw/skills/hzl/SKILL.md packages/hzl-marketplace/plugins/hzl-skills/skills/hzl-task-management/SKILL.md
git commit -m "docs: add subtask/parent documentation to README and skills"
```

---

## Task 8: Run full test suite and typecheck

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors

**Step 3: Run lint**

Run: `npm run lint`
Expected: No lint errors (or fix any that appear)

**Step 4: Build**

Run: `npm run build`
Expected: Build succeeds

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add `--parent` to `task add` | add.ts, add.test.ts |
| 2 | Add `--parent` to `task update` | update.ts, update.test.ts |
| 3 | Add `--parent` filter to `task list` | list.ts, list.test.ts |
| 4 | Add `getSubtasks` to TaskService | task-service.ts, task-service.test.ts |
| 5 | Display subtasks in `task show` | show.ts, show.test.ts |
| 6 | Cascade move to subtasks | move.ts, move.test.ts |
| 7 | Update documentation | README.md, SKILL.md files |
| 8 | Full test suite verification | - |
