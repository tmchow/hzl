# Permissive Status Transitions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the rigid VALID_TRANSITIONS matrix with a minimal guard (archived is terminal), loosen claimTask to accept any non-terminal status, and remove dependency enforcement from claimTask.

**Architecture:** Remove the transition matrix constant. `setStatus()` gets two simple guards: block transitions out of archived, no-op self-transitions. `claimTask()` drops its dependency check and widens its status precondition. All other methods unchanged.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Simplify `setStatus()` — remove matrix, add minimal guards

**Files:**
- Modify: `packages/hzl-core/src/services/task-service.ts:279-297` (delete VALID_TRANSITIONS)
- Modify: `packages/hzl-core/src/services/task-service.ts:647-657` (replace matrix lookup with archived guard + self-transition no-op)

**Step 1: Write the failing tests**

In `packages/hzl-core/src/services/task-service.test.ts`, replace the `describe('setStatus transition matrix')` block (lines 358-411) with:

```typescript
  describe('setStatus transition rules', () => {
    const allStatuses = Object.values(TaskStatus) as TaskStatus[];

    const createTaskInStatus = (status: TaskStatus) => {
      const task = taskService.createTask({ title: `Status ${status}`, project: 'inbox' });

      switch (status) {
        case TaskStatus.Backlog:
          return task;
        case TaskStatus.Ready:
          return taskService.setStatus(task.task_id, TaskStatus.Ready);
        case TaskStatus.InProgress:
          taskService.setStatus(task.task_id, TaskStatus.Ready);
          return taskService.claimTask(task.task_id, { author: 'agent-1' });
        case TaskStatus.Blocked:
          taskService.setStatus(task.task_id, TaskStatus.Ready);
          taskService.claimTask(task.task_id, { author: 'agent-1' });
          return taskService.blockTask(task.task_id);
        case TaskStatus.Done:
          taskService.setStatus(task.task_id, TaskStatus.Ready);
          taskService.claimTask(task.task_id, { author: 'agent-1' });
          return taskService.completeTask(task.task_id);
        case TaskStatus.Archived:
          return taskService.archiveTask(task.task_id);
      }
    };

    it('allows any transition except from archived', () => {
      const nonArchived = allStatuses.filter(s => s !== TaskStatus.Archived);
      for (const fromStatus of nonArchived) {
        for (const toStatus of allStatuses) {
          if (fromStatus === toStatus) continue; // skip self-transitions (tested separately)
          const task = createTaskInStatus(fromStatus);
          const updated = taskService.setStatus(task.task_id, toStatus);
          expect(updated.status).toBe(toStatus);
        }
      }
    });

    it('throws InvalidStatusTransitionError when transitioning from archived', () => {
      const nonArchived = allStatuses.filter(s => s !== TaskStatus.Archived);
      for (const toStatus of nonArchived) {
        const task = createTaskInStatus(TaskStatus.Archived);
        expect(() => taskService.setStatus(task.task_id, toStatus)).toThrow(
          InvalidStatusTransitionError
        );
      }
    });

    it('no-ops on self-transition (returns task, no new event)', () => {
      const nonArchived = allStatuses.filter(s => s !== TaskStatus.Archived);
      for (const status of nonArchived) {
        const task = createTaskInStatus(status);
        const eventsBefore = eventStore.getByTaskId(task.task_id);
        const result = taskService.setStatus(task.task_id, status);
        const eventsAfter = eventStore.getByTaskId(task.task_id);
        expect(result.status).toBe(status);
        expect(eventsAfter.length).toBe(eventsBefore.length);
      }
    });
  });
```

Also remove the `VALID_TRANSITIONS` import from the test file's import block (line 13).

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter hzl-core test src/services/task-service.test.ts -- --grep "setStatus transition"`
Expected: FAIL — tests expect permissive transitions but matrix blocks them

**Step 3: Implement the changes in task-service.ts**

Delete the `VALID_TRANSITIONS` constant (lines 279-297).

Replace the `setStatus()` body (lines 647-670) with:

```typescript
  setStatus(taskId: string, toStatus: TaskStatus, ctx?: EventContext): Task {
    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) throw new TaskNotFoundError(taskId);

      if (task.status === TaskStatus.Archived) {
        throw new InvalidStatusTransitionError(
          `Cannot change status: task is archived`
        );
      }

      // No-op on self-transition
      if (task.status === toStatus) {
        return task;
      }

      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.StatusChanged,
        data: { from: task.status, to: toStatus },
        author: ctx?.author,
        agent_id: ctx?.agent_id,
      });

      this.projectionEngine.applyEvent(event);
      this.enqueueOnDoneHook(taskId, task.status, toStatus, ctx);
      return this.getTaskById(taskId)!;
    });
  }
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter hzl-core test src/services/task-service.test.ts -- --grep "setStatus transition"`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/services/task-service.ts packages/hzl-core/src/services/task-service.test.ts
git commit -m "refactor(core): replace transition matrix with minimal archived guard"
```

---

### Task 2: Loosen `claimTask()` — drop dependency check, widen status precondition

**Files:**
- Modify: `packages/hzl-core/src/services/task-service.ts:614-644` (claimTask method)
- Modify: `packages/hzl-core/src/services/task-service.test.ts` (claimTask describe block)

**Step 1: Update claimTask tests**

In the `describe('claimTask')` block:

Replace the test `'throws if task is not in ready status'` (line 460-462) with tests for the new behavior:

```typescript
    it('claims a task from backlog status', () => {
      const task = taskService.createTask({ title: 'Backlog task', project: 'inbox' });
      const claimed = taskService.claimTask(task.task_id, { author: 'agent-1' });
      expect(claimed.status).toBe(TaskStatus.InProgress);
    });

    it('claims a task from in_progress status (re-claim)', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });
      const reclaimed = taskService.claimTask(task.task_id, { author: 'agent-2' });
      expect(reclaimed.status).toBe(TaskStatus.InProgress);
    });

    it('claims a task from blocked status', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id, { author: 'agent-1' });
      taskService.blockTask(task.task_id);
      const claimed = taskService.claimTask(task.task_id, { author: 'agent-2' });
      expect(claimed.status).toBe(TaskStatus.InProgress);
    });

    it('throws when claiming a done task', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.setStatus(task.task_id, TaskStatus.Ready);
      taskService.claimTask(task.task_id);
      taskService.completeTask(task.task_id);
      expect(() => taskService.claimTask(task.task_id)).toThrow(/not claimable/i);
    });

    it('throws when claiming an archived task', () => {
      const task = taskService.createTask({ title: 'Test', project: 'inbox' });
      taskService.archiveTask(task.task_id);
      expect(() => taskService.claimTask(task.task_id)).toThrow(/not claimable/i);
    });
```

Replace the test `'throws if task has incomplete dependencies'` (lines 465-475) with:

```typescript
    it('allows claiming a task with incomplete dependencies', () => {
      const dep = taskService.createTask({ title: 'Incomplete dep', project: 'inbox' });
      const task = taskService.createTask({
        title: 'Dependent task',
        project: 'inbox',
        depends_on: [dep.task_id],
      });
      taskService.setStatus(task.task_id, TaskStatus.Ready);

      const claimed = taskService.claimTask(task.task_id, { author: 'agent-1' });
      expect(claimed.status).toBe(TaskStatus.InProgress);
    });
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter hzl-core test src/services/task-service.test.ts -- --grep "claimTask"`
Expected: FAIL — old code rejects non-ready status and incomplete deps

**Step 3: Update claimTask implementation**

Replace `claimTask()` body (lines 614-644) with:

```typescript
  claimTask(taskId: string, opts?: ClaimTaskOptions): Task {
    return withWriteTransaction(this.db, () => {
      const task = this.getTaskById(taskId);
      if (!task) throw new TaskNotFoundError(taskId);

      if (task.status === TaskStatus.Done || task.status === TaskStatus.Archived) {
        throw new TaskNotClaimableError(taskId, `status is ${task.status}, must not be done or archived`);
      }

      const eventData: StatusChangedData = {
        from: task.status,
        to: TaskStatus.InProgress,
      };
      if (opts?.lease_until) eventData.lease_until = opts.lease_until;

      const event = this.eventStore.append({
        task_id: taskId,
        type: EventType.StatusChanged,
        data: eventData,
        author: opts?.author,
        agent_id: opts?.agent_id,
      });

      this.projectionEngine.applyEvent(event);
      return this.getTaskById(taskId)!;
    });
  }
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter hzl-core test src/services/task-service.test.ts -- --grep "claimTask"`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/hzl-core/src/services/task-service.ts packages/hzl-core/src/services/task-service.test.ts
git commit -m "refactor(core): loosen claimTask to accept any non-terminal status"
```

---

### Task 3: Clean up exports and downstream references

**Files:**
- Modify: `packages/hzl-core/src/index.ts:111,117` (remove DependenciesNotDoneError and VALID_TRANSITIONS exports)
- Modify: `packages/hzl-core/src/index.test.ts:90,97-99` (remove assertions)
- Modify: `packages/hzl-cli/src/commands/task/claim.ts:13,359` (remove DependenciesNotDoneError import and catch)
- Modify: `packages/hzl-core/src/services/task-service.ts` (remove DependenciesNotDoneError class, remove getIncompleteDepsStmt)

**Step 1: Remove `DependenciesNotDoneError` class and prepared statement from task-service.ts**

Delete the `DependenciesNotDoneError` class (lines 236-240).

Delete the `getIncompleteDepsStmt` field declaration (line 320) and its initialization in the constructor (line 338, the `this.getIncompleteDepsStmt = db.prepare(...)` block — read the surrounding lines to find exact extent).

**Step 2: Remove exports from index.ts**

Remove `DependenciesNotDoneError` (line 111) and `VALID_TRANSITIONS` (line 117) from the export block.

**Step 3: Remove assertions from index.test.ts**

Delete the `expect(hzlCore.DependenciesNotDoneError).toBeDefined()` line (line 90).
Delete the `it('exports VALID_TRANSITIONS', ...)` test block (lines 97-99).

**Step 4: Update CLI claim.ts**

Remove `DependenciesNotDoneError` from the import (line 13).
In the catch block (line 359), remove `|| error instanceof DependenciesNotDoneError` so it only catches `TaskNotClaimableError`.

**Step 5: Run full test suite**

Run: `pnpm --filter hzl-core test && pnpm --filter hzl-cli test`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/hzl-core/src/services/task-service.ts packages/hzl-core/src/index.ts packages/hzl-core/src/index.test.ts packages/hzl-cli/src/commands/task/claim.ts
git commit -m "refactor(core): remove DependenciesNotDoneError and VALID_TRANSITIONS exports"
```

---

### Task 4: Update property-based invariant tests

**Files:**
- Modify: `packages/hzl-core/src/__tests__/properties/invariants.test.ts:292-392`

**Step 1: Update the invariant test**

The property-based test `'status transitions follow state machine rules'` currently validates against the old matrix by only attempting transitions from expected states. Update it to exercise the permissive model — actions should succeed from any non-terminal status:

Replace the `describe('invariant: valid status transitions')` block with:

```typescript
  describe('invariant: valid status transitions', () => {
    it('status transitions follow permissive rules (only archived is terminal)', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              fc.constant('create'),
              fc.constant('setReady'),
              fc.constant('setDone'),
              fc.constant('setBacklog'),
              fc.constant('claim'),
              fc.constant('complete'),
              fc.constant('release'),
              fc.constant('archive')
            ),
            { minLength: 1, maxLength: 30 }
          ),
          (actions) =>
            withIsolatedServices(({ taskService }) => {
              const taskIds: string[] = [];
              const taskStates: Map<string, TaskStatus> = new Map();

              for (const action of actions) {
                try {
                  switch (action) {
                    case 'create': {
                      const task = taskService.createTask({ title: 'Task', project: 'inbox' });
                      taskIds.push(task.task_id);
                      taskStates.set(task.task_id, TaskStatus.Backlog);
                      break;
                    }
                    case 'setReady': {
                      if (taskIds.length === 0) break;
                      const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                      const currentStatus = taskStates.get(taskId);
                      if (currentStatus !== TaskStatus.Archived) {
                        taskService.setStatus(taskId, TaskStatus.Ready);
                        taskStates.set(taskId, TaskStatus.Ready);
                      }
                      break;
                    }
                    case 'setDone': {
                      if (taskIds.length === 0) break;
                      const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                      const currentStatus = taskStates.get(taskId);
                      if (currentStatus !== TaskStatus.Archived) {
                        taskService.setStatus(taskId, TaskStatus.Done);
                        taskStates.set(taskId, TaskStatus.Done);
                      }
                      break;
                    }
                    case 'setBacklog': {
                      if (taskIds.length === 0) break;
                      const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                      const currentStatus = taskStates.get(taskId);
                      if (currentStatus !== TaskStatus.Archived) {
                        taskService.setStatus(taskId, TaskStatus.Backlog);
                        taskStates.set(taskId, TaskStatus.Backlog);
                      }
                      break;
                    }
                    case 'claim': {
                      if (taskIds.length === 0) break;
                      const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                      const currentStatus = taskStates.get(taskId);
                      if (currentStatus !== TaskStatus.Done && currentStatus !== TaskStatus.Archived) {
                        taskService.claimTask(taskId, { author: 'agent' });
                        taskStates.set(taskId, TaskStatus.InProgress);
                      }
                      break;
                    }
                    case 'complete': {
                      if (taskIds.length === 0) break;
                      const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                      const currentStatus = taskStates.get(taskId);
                      if (currentStatus === TaskStatus.InProgress || currentStatus === TaskStatus.Blocked) {
                        taskService.completeTask(taskId);
                        taskStates.set(taskId, TaskStatus.Done);
                      }
                      break;
                    }
                    case 'release': {
                      if (taskIds.length === 0) break;
                      const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                      const currentStatus = taskStates.get(taskId);
                      if (currentStatus === TaskStatus.InProgress) {
                        taskService.releaseTask(taskId);
                        taskStates.set(taskId, TaskStatus.Ready);
                      }
                      break;
                    }
                    case 'archive': {
                      if (taskIds.length === 0) break;
                      const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
                      const currentStatus = taskStates.get(taskId);
                      if (currentStatus !== TaskStatus.Archived) {
                        taskService.archiveTask(taskId);
                        taskStates.set(taskId, TaskStatus.Archived);
                      }
                      break;
                    }
                  }
                } catch {
                  continue;
                }
              }

              for (const taskId of taskIds) {
                const task = taskService.getTaskById(taskId);
                if (task) {
                  const validStatuses = Object.values(TaskStatus);
                  if (!validStatuses.includes(task.status)) {
                    return false;
                  }
                }
              }
              return true;
            })
        ),
        { numRuns: 100 }
      );
    });
  });
```

**Step 2: Run the property-based tests**

Run: `pnpm --filter hzl-core test src/__tests__/properties/invariants.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/hzl-core/src/__tests__/properties/invariants.test.ts
git commit -m "test(core): update property-based tests for permissive transitions"
```

---

### Task 5: Run full suite and typecheck

**Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — no dangling references to removed exports

**Step 2: Full test suite**

Run: `pnpm test`
Expected: PASS

**Step 3: Lint**

Run: `pnpm lint`
Expected: PASS
