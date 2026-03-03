# Stale Claim Warning — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface in-progress tasks with zero checkpoints past a time threshold as "stale" — a warning indicator in `hzl task list`, `hzl task stuck --stale`, and the web dashboard.

**Architecture:** Computed at query time using existing `tasks_current` and `task_checkpoints` tables. No new events, projections, or schema changes. A `NOT EXISTS` subquery against `task_checkpoints` combined with a `claimed_at` age check determines staleness. The threshold is configurable per-query (default 10 minutes).

**Tech Stack:** TypeScript, SQLite (libsql), Commander.js (CLI), React (dashboard)

---

### Task 1: Core — Add `getStaleTaskIds` helper to TaskService

**Files:**
- Modify: `packages/hzl-core/src/services/task-service.ts`
- Test: `packages/hzl-core/src/services/task-service.test.ts`

**Step 1: Write the failing test**

Add to the existing test file a new `describe('stale task detection')` block:

```typescript
describe('stale task detection', () => {
  it('returns empty set when no in-progress tasks', () => {
    const result = services.taskService.getStaleTasks({ thresholdMinutes: 10 });
    expect(result).toEqual(new Map());
  });

  it('does not flag in-progress task with checkpoints as stale', () => {
    const task = services.taskService.createTask({ title: 'Active task', project: 'test-proj' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id, { author: 'agent-1' });
    services.taskService.addCheckpoint(task.task_id, 'started', {});

    const result = services.taskService.getStaleTasks({ thresholdMinutes: 0 });
    expect(result.has(task.task_id)).toBe(false);
  });

  it('flags in-progress task with zero checkpoints past threshold as stale', () => {
    const task = services.taskService.createTask({ title: 'Silent task', project: 'test-proj' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id, { author: 'agent-1' });

    // With threshold 0 minutes, any claimed task with no checkpoints is stale
    const result = services.taskService.getStaleTasks({ thresholdMinutes: 0 });
    expect(result.has(task.task_id)).toBe(true);
    expect(result.get(task.task_id)).toBeGreaterThanOrEqual(0);
  });

  it('does not flag task within threshold window', () => {
    const task = services.taskService.createTask({ title: 'Fresh claim', project: 'test-proj' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id, { author: 'agent-1' });

    // With 60 min threshold, a just-claimed task should not be stale
    const result = services.taskService.getStaleTasks({ thresholdMinutes: 60 });
    expect(result.has(task.task_id)).toBe(false);
  });

  it('does not flag non-in-progress tasks', () => {
    const task = services.taskService.createTask({ title: 'Ready task', project: 'test-proj' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);

    const result = services.taskService.getStaleTasks({ thresholdMinutes: 0 });
    expect(result.has(task.task_id)).toBe(false);
  });

  it('filters by project when specified', () => {
    services.projectService.createProject('proj-a');
    services.projectService.createProject('proj-b');

    const t1 = services.taskService.createTask({ title: 'Stale A', project: 'proj-a' });
    services.taskService.setStatus(t1.task_id, TaskStatus.Ready);
    services.taskService.claimTask(t1.task_id, { author: 'agent-1' });

    const t2 = services.taskService.createTask({ title: 'Stale B', project: 'proj-b' });
    services.taskService.setStatus(t2.task_id, TaskStatus.Ready);
    services.taskService.claimTask(t2.task_id, { author: 'agent-2' });

    const result = services.taskService.getStaleTasks({ thresholdMinutes: 0, project: 'proj-a' });
    expect(result.has(t1.task_id)).toBe(true);
    expect(result.has(t2.task_id)).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter hzl-core test src/services/task-service.test.ts -- --grep "stale task detection"`
Expected: FAIL — `getStaleTasks` is not a function

**Step 3: Implement `getStaleTasks`**

Add to `TaskService` class in `packages/hzl-core/src/services/task-service.ts` (after `getAgentRoster`, around line 1471):

```typescript
/**
 * Get in-progress tasks with zero checkpoints that have been claimed
 * longer than `thresholdMinutes` ago.
 * Returns a Map of task_id → stale_minutes (how long since claimed_at).
 */
getStaleTasks(opts: { thresholdMinutes: number; project?: string }): Map<string, number> {
  const { thresholdMinutes, project } = opts;
  const now = Date.now();

  const conditions: string[] = [
    "t.status = 'in_progress'",
    't.claimed_at IS NOT NULL',
    'NOT EXISTS (SELECT 1 FROM task_checkpoints c WHERE c.task_id = t.task_id)',
  ];
  const params: (string | number)[] = [];

  if (thresholdMinutes > 0) {
    const cutoff = new Date(now - thresholdMinutes * 60_000).toISOString();
    conditions.push('t.claimed_at < ?');
    params.push(cutoff);
  }

  if (project) {
    conditions.push('t.project = ?');
    params.push(project);
  }

  const sql = `
    SELECT t.task_id, t.claimed_at
    FROM tasks_current t
    WHERE ${conditions.join(' AND ')}
  `;

  const rows = this.db.prepare(sql).all(...params) as Array<{ task_id: string; claimed_at: string }>;

  const result = new Map<string, number>();
  for (const row of rows) {
    const claimedMs = new Date(row.claimed_at).getTime();
    const staleMinutes = Math.round((now - claimedMs) / 60_000);
    result.set(row.task_id, staleMinutes);
  }
  return result;
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter hzl-core test src/services/task-service.test.ts -- --grep "stale task detection"`
Expected: PASS (all 6 tests)

**Step 5: Commit**

```bash
git add packages/hzl-core/src/services/task-service.ts packages/hzl-core/src/services/task-service.test.ts
git commit -m "feat: add getStaleTasks helper to TaskService"
```

---

### Task 2: CLI — Add stale indicators to `hzl task list`

**Files:**
- Modify: `packages/hzl-cli/src/commands/task/list.ts`
- Test: `packages/hzl-cli/src/commands/task/list.test.ts`

**Step 1: Write the failing tests**

Add to `list.test.ts`:

```typescript
describe('stale indicators', () => {
  it('marks in-progress task with no checkpoints as stale when past threshold', () => {
    const task = services.taskService.createTask({ title: 'Silent claim', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id, { author: 'agent-1' });

    // threshold 0 means any claimed task with no checkpoints is stale
    const result = runList({ services, json: true, staleThreshold: 0 });
    const found = result.tasks.find(t => t.task_id === task.task_id);
    expect(found?.stale).toBe(true);
    expect(found?.stale_minutes).toBeGreaterThanOrEqual(0);
  });

  it('does not mark in-progress task with checkpoints as stale', () => {
    const task = services.taskService.createTask({ title: 'Active task', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id, { author: 'agent-1' });
    services.taskService.addCheckpoint(task.task_id, 'working', {});

    const result = runList({ services, json: true, staleThreshold: 0 });
    const found = result.tasks.find(t => t.task_id === task.task_id);
    expect(found?.stale).toBe(false);
    expect(found?.stale_minutes).toBeNull();
  });

  it('does not mark non-in-progress tasks as stale', () => {
    services.taskService.createTask({ title: 'Backlog task', project: 'inbox' });

    const result = runList({ services, json: true, staleThreshold: 0 });
    for (const task of result.tasks) {
      expect(task.stale).toBe(false);
    }
  });

  it('disables stale indicators when staleThreshold is null', () => {
    const task = services.taskService.createTask({ title: 'Silent claim', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id, { author: 'agent-1' });

    const result = runList({ services, json: true, staleThreshold: null });
    const found = result.tasks.find(t => t.task_id === task.task_id);
    expect(found?.stale).toBeUndefined();
    expect(found?.stale_minutes).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter hzl-cli test src/commands/task/list.test.ts -- --grep "stale indicators"`
Expected: FAIL — `staleThreshold` not a recognized option, `stale` not on result

**Step 3: Implement stale indicators in list**

In `packages/hzl-cli/src/commands/task/list.ts`:

1. Add `staleThreshold` to `ListOptions` interface (add `staleThreshold?: number | null;`).

2. Add `stale` and `stale_minutes` to the `TaskListItem` interface:
   ```typescript
   stale?: boolean;
   stale_minutes?: number | null;
   ```

3. In `runList()`, after fetching tasks but before output, compute stale info:
   ```typescript
   // Compute stale indicators for in-progress tasks
   let staleMap: Map<string, number> | null = null;
   if (staleThreshold !== null && staleThreshold !== undefined) {
     staleMap = services.taskService.getStaleTasks({
       thresholdMinutes: staleThreshold,
       project,
     });
   }
   ```

4. In `shapeTaskForView` (or after it), annotate each task:
   ```typescript
   const tasks = rows.map((row) => {
     const shaped = shapeTaskForView(row, view);
     if (staleMap) {
       shaped.stale = staleMap.has(row.task_id);
       shaped.stale_minutes = staleMap.get(row.task_id) ?? null;
     }
     return shaped;
   });
   ```

5. In the human-readable output (lines 329-333), change the status icon for stale tasks:
   ```typescript
   const isStale = staleMap?.has(task.task_id) ?? false;
   const staleMinutes = staleMap?.get(task.task_id);
   const statusIcon = task.status === 'done' ? '✓'
     : isStale ? '⚠'
     : task.status === 'in_progress' ? '→'
     : '○';
   const staleSuffix = isStale ? `  [stale ${staleMinutes}m]` : '';
   console.log(`  ${statusIcon} [${shortId(task.task_id)}] ${task.title} (${task.project})${staleSuffix}`);
   ```

6. Apply the same logic to the `groupByAgent` output branch (lines 297-301).

7. Add `--stale-threshold` option to `createListCommand()`:
   ```typescript
   .option('--stale-threshold <minutes>', 'Flag in-progress tasks with no checkpoints older than N minutes as stale (0 to disable)', '10')
   ```

8. In the `.action()` handler, parse and pass the option:
   ```typescript
   staleThreshold: opts.staleThreshold === '0' ? null
     : parseIntegerWithDefault(opts.staleThreshold, 'stale-threshold', 10, { min: 0 }),
   ```

   Actually, to match the design (`--stale-threshold 0` disables), parse it as: if value is 0, pass `null`; otherwise pass the parsed integer.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter hzl-cli test src/commands/task/list.test.ts -- --grep "stale indicators"`
Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/commands/task/list.ts packages/hzl-cli/src/commands/task/list.test.ts
git commit -m "feat: add stale claim indicators to task list"
```

---

### Task 3: CLI — Add `--stale` flag to `hzl task stuck`

**Files:**
- Modify: `packages/hzl-cli/src/commands/task/stuck.ts`
- Test: `packages/hzl-cli/src/commands/task/stuck.test.ts`

**Step 1: Write the failing tests**

Add to `stuck.test.ts`:

```typescript
describe('--stale flag', () => {
  it('does not include stale tasks by default', () => {
    const task = services.taskService.createTask({ title: 'Silent claim', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id, { author: 'agent-1' });

    const result = runStuck({ services, json: false });
    expect(result.tasks).toHaveLength(0);
  });

  it('includes stale tasks when --stale is set', () => {
    const task = services.taskService.createTask({ title: 'Silent claim', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id, { author: 'agent-1' });

    const result = runStuck({ services, json: false, stale: true, staleThresholdMinutes: 0 });
    expect(result.tasks.length).toBeGreaterThanOrEqual(1);
    const found = result.tasks.find(t => t.task_id === task.task_id);
    expect(found).toBeDefined();
    expect(found!.reason).toBe('stale');
  });

  it('separates stuck and stale tasks in result', () => {
    // Create a stuck task (expired lease)
    const stuckTask = services.taskService.createTask({ title: 'Stuck task', project: 'inbox' });
    services.taskService.setStatus(stuckTask.task_id, TaskStatus.Ready);
    const pastLease = new Date(Date.now() - 60000).toISOString();
    services.taskService.claimTask(stuckTask.task_id, { author: 'agent-1', lease_until: pastLease });

    // Create a stale task (no checkpoint, no lease)
    const staleTask = services.taskService.createTask({ title: 'Stale task', project: 'inbox' });
    services.taskService.setStatus(staleTask.task_id, TaskStatus.Ready);
    services.taskService.claimTask(staleTask.task_id, { author: 'agent-2' });

    const result = runStuck({ services, json: false, stale: true, staleThresholdMinutes: 0 });
    const stuck = result.tasks.find(t => t.task_id === stuckTask.task_id);
    const stale = result.tasks.find(t => t.task_id === staleTask.task_id);

    expect(stuck?.reason).toBe('lease_expired');
    expect(stale?.reason).toBe('stale');
  });

  it('does not flag stale task that has checkpoints', () => {
    const task = services.taskService.createTask({ title: 'Active task', project: 'inbox' });
    services.taskService.setStatus(task.task_id, TaskStatus.Ready);
    services.taskService.claimTask(task.task_id, { author: 'agent-1' });
    services.taskService.addCheckpoint(task.task_id, 'started', {});

    const result = runStuck({ services, json: false, stale: true, staleThresholdMinutes: 0 });
    const found = result.tasks.find(t => t.task_id === task.task_id);
    expect(found).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter hzl-cli test src/commands/task/stuck.test.ts -- --grep "stale flag"`
Expected: FAIL — `stale` not a recognized option, `reason` not on result

**Step 3: Implement --stale in stuck**

In `packages/hzl-cli/src/commands/task/stuck.ts`:

1. Add `reason` field to `StuckTask`:
   ```typescript
   export interface StuckTask {
     task_id: string;
     title: string;
     project: string;
     agent: string | null;
     claimed_at: string | null;
     lease_until: string | null;  // nullable now (stale tasks may have no lease)
     expired_for_ms: number | null;  // null for stale tasks
     reason: 'lease_expired' | 'stale';
     stale_minutes?: number;  // only present when reason === 'stale'
   }
   ```

2. Add `stale` and `staleThresholdMinutes` to the `runStuck` options:
   ```typescript
   export function runStuck(options: {
     services: Services;
     project?: string;
     olderThanMinutes?: number;
     stale?: boolean;
     staleThresholdMinutes?: number;
     json: boolean;
   }): StuckResult {
   ```

3. After the existing lease-expired query, if `stale` is true, also query for stale tasks:
   ```typescript
   if (stale) {
     const staleTasks = services.taskService.getStaleTasks({
       thresholdMinutes: staleThresholdMinutes ?? 10,
       project,
     });
     // Add stale tasks that aren't already in the stuck list
     const existingIds = new Set(tasks.map(t => t.task_id));
     for (const [taskId, staleMinutes] of staleTasks) {
       if (existingIds.has(taskId)) continue;
       // Need to fetch task details
       const taskRow = services.cacheDb.prepare(
         'SELECT task_id, title, project, agent, claimed_at FROM tasks_current WHERE task_id = ?'
       ).get(taskId) as { task_id: string; title: string; project: string; agent: string | null; claimed_at: string | null } | undefined;
       if (taskRow) {
         tasks.push({
           task_id: taskRow.task_id,
           title: taskRow.title,
           project: taskRow.project,
           agent: taskRow.agent,
           claimed_at: taskRow.claimed_at,
           lease_until: null,
           expired_for_ms: null,
           reason: 'stale',
           stale_minutes: staleMinutes,
         });
       }
     }
   }
   ```

4. Tag existing stuck tasks with `reason: 'lease_expired'` in the existing loop.

5. Update human-readable output to group by reason:
   ```typescript
   const leaseExpired = tasks.filter(t => t.reason === 'lease_expired');
   const staleTasks = tasks.filter(t => t.reason === 'stale');

   if (leaseExpired.length > 0) {
     console.log(`Stuck tasks (${leaseExpired.length}):`);
     for (const task of leaseExpired) {
       const expiredMinutes = Math.round((task.expired_for_ms ?? 0) / 60000);
       console.log(`  [${shortId(task.task_id)}] ${task.title} (${task.project})`);
       console.log(`    Agent: ${task.agent ?? 'unknown'} | Expired: ${expiredMinutes}m ago`);
     }
   }

   if (staleTasks.length > 0) {
     if (leaseExpired.length > 0) console.log('');
     console.log(`Stale tasks — no checkpoints (${staleTasks.length}):`);
     for (const task of staleTasks) {
       console.log(`  [${shortId(task.task_id)}] ${task.title} (${task.project})`);
       console.log(`    Agent: ${task.agent ?? 'unknown'} | Claimed: ${task.stale_minutes}m ago, 0 checkpoints`);
     }
   }
   ```

6. Add CLI options to `createStuckCommand()`:
   ```typescript
   .option('--stale', 'Also include stale tasks (claimed, no checkpoints)', false)
   .option('--stale-threshold <minutes>', 'Threshold for stale detection (default: 10)', '10')
   ```

7. Wire through in the `.action()` handler:
   ```typescript
   stale: opts.stale,
   staleThresholdMinutes: parseIntegerWithDefault(opts.staleThreshold, 'stale-threshold', 10, { min: 0 }),
   ```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter hzl-cli test src/commands/task/stuck.test.ts -- --grep "stale flag"`
Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/commands/task/stuck.ts packages/hzl-cli/src/commands/task/stuck.test.ts
git commit -m "feat: add --stale flag to task stuck command"
```

---

### Task 4: Web — Add stale info to dashboard API

**Files:**
- Modify: `packages/hzl-core/src/services/task-service.ts` (extend `listTasks` return type)
- Modify: `packages/hzl-web/src/server.ts`
- Modify: `packages/hzl-web/src/app/api/types.ts`

**Step 1: Add `stale` and `stale_minutes` to the web API `TaskListItem` type**

In `packages/hzl-web/src/app/api/types.ts`, add to `TaskListItem`:

```typescript
stale: boolean;
stale_minutes: number | null;
```

**Step 2: Add stale computation to `handleTasks` in server.ts**

In `packages/hzl-web/src/server.ts`, in `handleTasks()` (around line 260), after building the `tasks` array:

```typescript
// Compute stale indicators
const staleThresholdParam = params.get('staleThreshold');
const staleThreshold = staleThresholdParam !== null
  ? parseInt(staleThresholdParam, 10)
  : 10; // default 10 minutes

const staleMap = taskService.getStaleTasks({
  thresholdMinutes: staleThreshold,
  project: project ?? undefined,
});

const tasks: TaskListItemResponse[] = rows.map((row) => ({
  ...row,
  blocked_by: blockedMap.get(row.task_id) ?? null,
  subtask_count: subtaskCounts.get(row.task_id) ?? 0,
  subtask_total: subtaskTotals.get(row.task_id) ?? 0,
  stale: staleMap.has(row.task_id),
  stale_minutes: staleMap.get(row.task_id) ?? null,
}));
```

**Step 3: Update the `TaskListItemResponse` type in server.ts**

Add `stale` and `stale_minutes` to the `TaskListItemResponse` interface (around line 43):

```typescript
interface TaskListItemResponse extends CoreTaskListItem {
  blocked_by: string[] | null;
  subtask_count: number;
  subtask_total: number;
  stale: boolean;
  stale_minutes: number | null;
}
```

**Step 4: Also add stale info to agent roster tasks**

In `packages/hzl-web/src/app/api/types.ts`, add to `AgentRosterTask`:

```typescript
stale: boolean;
stale_minutes: number | null;
```

In `packages/hzl-web/src/server.ts`, in the agents endpoint handler, compute stale map and annotate roster tasks:

```typescript
// In the handleAgents function, after getting the roster:
const staleMap = taskService.getStaleTasks({ thresholdMinutes: 10 });
// Annotate each task in each agent's task list
```

**Step 5: Commit**

```bash
git add packages/hzl-web/src/server.ts packages/hzl-web/src/app/api/types.ts
git commit -m "feat: add stale info to dashboard API responses"
```

---

### Task 5: Web — Add stale visual indicators to Card and TaskModal

**Files:**
- Modify: `packages/hzl-web/src/app/components/Card/Card.tsx`
- Modify: `packages/hzl-web/src/app/App.css`
- Modify: `packages/hzl-web/src/app/components/TaskModal/TaskModal.tsx`
- Modify: `packages/hzl-web/src/app/components/TaskModal/TaskModal.css`

**Step 1: Add amber stale indicator to Card component**

In `packages/hzl-web/src/app/components/Card/Card.tsx`, add a `card-stale` CSS class when `task.stale`:

```tsx
<div
  className={`card${isParentTask ? ' card-parent' : ''}${task.stale ? ' card-stale' : ''}`}
  style={parentStyle}
  onClick={() => onClick(task.task_id)}
>
```

**Step 2: Add CSS for stale card**

In `packages/hzl-web/src/app/App.css`, after the `.card-parent` rule (line ~657):

```css
.card-stale {
  border-left: 3px solid var(--status-warning, #f59e0b);
}
```

If `--status-warning` doesn't exist as a CSS variable yet, add it to the `:root` or theme variables:

```css
--status-warning: #f59e0b;
```

**Step 3: Add stale warning to TaskModal**

In `packages/hzl-web/src/app/components/TaskModal/TaskModal.tsx`, after the status/assignee display area, add a stale warning when the task detail's checkpoint count is zero and status is `in_progress`:

The modal already fetches checkpoints. Add a stale check:

```tsx
{task.status === 'in_progress' && checkpoints.length === 0 && task.claimed_at && (
  <div className="task-modal-stale-warning">
    ⚠ Stale — claimed {formatDuration(Date.now() - new Date(task.claimed_at).getTime())} ago with no checkpoints
  </div>
)}
```

Note: `formatDuration` may already exist or need importing from `../../utils/format`.

**Step 4: Add CSS for stale warning in modal**

In `packages/hzl-web/src/app/components/TaskModal/TaskModal.css`:

```css
.task-modal-stale-warning {
  padding: 8px 12px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 4px;
  color: #f59e0b;
  font-size: 13px;
  margin-bottom: 12px;
}
```

**Step 5: Commit**

```bash
git add packages/hzl-web/src/app/components/Card/Card.tsx packages/hzl-web/src/app/App.css \
  packages/hzl-web/src/app/components/TaskModal/TaskModal.tsx packages/hzl-web/src/app/components/TaskModal/TaskModal.css
git commit -m "feat: add stale visual indicators to dashboard cards and modal"
```

---

### Task 6: Web — Add stale indicator to AgentRoster

**Files:**
- Modify: `packages/hzl-web/src/app/components/AgentOps/AgentRoster.tsx`
- Modify: `packages/hzl-web/src/app/components/AgentOps/AgentOps.css`

**Step 1: Add amber dot for stale tasks in roster**

In `packages/hzl-web/src/app/components/AgentOps/AgentRoster.tsx`, in the task display section (lines 139-149), check if the task is stale and show the amber indicator:

The `AgentRosterTask` type will now include `stale` and `stale_minutes`. Use this to conditionally style tasks:

```tsx
{agent.isActive && agent.tasks.length > 0 ? (
  <span className="agent-roster-task">
    <span className={`agent-roster-task-title${agent.tasks[0].stale ? ' stale' : ''}`}>
      {agent.tasks[0].stale && <span className="agent-roster-stale-dot" />}
      {agent.tasks[0].title}
    </span>
    {agent.tasks.length > 1 && (
      <span className="agent-roster-more">
        (+{agent.tasks.length - 1} more)
      </span>
    )}
  </span>
) : (/* ... */)}
```

**Step 2: Add CSS**

In `packages/hzl-web/src/app/components/AgentOps/AgentOps.css`:

```css
.agent-roster-stale-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--status-warning, #f59e0b);
  margin-right: 4px;
  vertical-align: middle;
}

.agent-roster-task-title.stale {
  color: var(--status-warning, #f59e0b);
}
```

**Step 3: Commit**

```bash
git add packages/hzl-web/src/app/components/AgentOps/AgentRoster.tsx packages/hzl-web/src/app/components/AgentOps/AgentOps.css
git commit -m "feat: add stale indicator to agent roster"
```

---

### Task 7: Update CLI manifest and verify parity

**Files:**
- Modify: `docs/metadata/cli-manifest.json` (regenerated)

**Step 1: Rebuild CLI**

Run: `pnpm --filter hzl-cli build`
Expected: Builds successfully

**Step 2: Regenerate CLI manifest**

Run: `pnpm generate:cli-manifest`
Expected: Manifest updated with new `--stale-threshold` on `task list` and `--stale` + `--stale-threshold` on `task stuck`

**Step 3: Verify manifest is current**

Run: `pnpm verify:cli-manifest`
Expected: PASS

**Step 4: Verify docs parity**

Run: `pnpm verify:cli-docs`
Expected: May show warnings — we'll update docs in the next task

**Step 5: Commit**

```bash
git add docs/metadata/cli-manifest.json
git commit -m "chore: regenerate CLI manifest with stale flags"
```

---

### Task 8: Update documentation

**Files:**
- Modify: `docs-site/reference/cli.md` — add `--stale-threshold` to `task list` and `--stale` + `--stale-threshold` to `task stuck`
- Modify: `docs-site/concepts/tasks.md` — add "Stale tasks" section explaining the concept
- Modify: `README.md` — add stale detection to CLI reference if task list/stuck are documented there
- Modify: `skills/hzl/SKILL.md` — add stale detection patterns for agent usage

**Step 1: Update CLI reference docs**

In `docs-site/reference/cli.md`, under the `task list` section, add:

```markdown
#### Stale detection

`--stale-threshold <minutes>` — Flag in-progress tasks with no checkpoints older than N minutes (default: 10, 0 to disable).

Stale tasks show `⚠` instead of `→` and include `[stale Nm]` suffix.
```

Under the `task stuck` section, add:

```markdown
#### Stale tasks

`--stale` — Also include stale tasks (claimed but no checkpoints).
`--stale-threshold <minutes>` — Threshold for stale detection (default: 10).
```

**Step 2: Add concept documentation**

In `docs-site/concepts/tasks.md`, add a section:

```markdown
### Stale tasks

A task is "stale" when it has been `in_progress` with zero checkpoints for longer than a configured threshold (default: 10 minutes). This indicates the claiming agent may have failed before doing any work.

Stale is distinct from stuck:
- **Stuck**: lease expired — the agent ran past its time budget
- **Stale**: no proof of life — the agent may have never started

Stale tasks are visible in `hzl task list` (⚠ indicator) and `hzl task stuck --stale`.
```

**Step 3: Verify docs parity**

Run: `pnpm verify:cli-docs`
Expected: PASS

**Step 4: Commit**

```bash
git add docs-site/reference/cli.md docs-site/concepts/tasks.md README.md skills/hzl/SKILL.md
git commit -m "docs: add stale task detection documentation"
```

---

### Task 9: Run full test suite and typecheck

**Step 1: Build all packages**

Run: `pnpm build`
Expected: PASS

**Step 2: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No type errors

**Step 4: Run lint**

Run: `pnpm lint`
Expected: No lint errors (fix any with `pnpm lint:fix` if needed)
