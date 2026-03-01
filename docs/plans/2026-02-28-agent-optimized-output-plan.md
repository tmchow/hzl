# Agent-Optimized CLI Output Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make HZL CLI output more agent-optimized: structured error suggestions, compact JSON, view tiers on show, and stripped empty collections.

**Architecture:** Four independent changes to the CLI layer. Error suggestions extend CLIError/ErrorEnvelope. Compact JSON is a find-replace. View on show follows the existing claim/list pattern. Empty collection stripping is a shared utility applied at serialization boundaries.

**Tech Stack:** TypeScript, Vitest, Commander.js

---

### Task 1: Add `suggestions` to CLIError and ErrorEnvelope

**Files:**
- Modify: `packages/hzl-cli/src/errors.ts`
- Modify: `packages/hzl-cli/src/output.ts`
- Modify: `packages/hzl-cli/src/errors.test.ts`
- Modify: `packages/hzl-cli/src/output.test.ts`

**Step 1: Write the failing test for CLIError suggestions**

In `packages/hzl-cli/src/errors.test.ts`, add a test:

```typescript
it('creates error with suggestions', () => {
  const error = new CLIError('Task not found: abc', ExitCode.NotFound, undefined, undefined, [
    'hzl task list -P demo',
  ]);
  expect(error.suggestions).toEqual(['hzl task list -P demo']);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter hzl-cli test src/errors.test.ts`
Expected: FAIL — CLIError constructor doesn't accept 5th argument

**Step 3: Add `suggestions` to CLIError**

In `packages/hzl-cli/src/errors.ts`, update the class:

```typescript
export class CLIError extends Error {
  public readonly exitCode: ExitCode;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly suggestions?: string[];

  constructor(
    message: string,
    exitCode: ExitCode = ExitCode.GeneralError,
    code?: string,
    details?: unknown,
    suggestions?: string[],
  ) {
    super(message);
    this.exitCode = exitCode;
    this.code = code ?? codeForExitCode(exitCode);
    this.details = details;
    this.suggestions = suggestions;
    this.name = 'CLIError';
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter hzl-cli test src/errors.test.ts`
Expected: PASS

**Step 5: Write the failing test for ErrorEnvelope suggestions**

In `packages/hzl-cli/src/output.test.ts`, add:

```typescript
it('creates error envelope with suggestions', () => {
  const envelope = createErrorEnvelope('not_found', 'Task not found', undefined, [
    'hzl task list -P demo',
  ]);
  expect(envelope).toEqual({
    schema_version: SCHEMA_VERSION,
    ok: false,
    error: {
      code: 'not_found',
      message: 'Task not found',
      suggestions: ['hzl task list -P demo'],
    },
  });
});

it('omits suggestions from error envelope when empty', () => {
  const envelope = createErrorEnvelope('not_found', 'Task not found');
  expect(envelope.error).not.toHaveProperty('suggestions');
});
```

**Step 6: Run test to verify it fails**

Run: `pnpm --filter hzl-cli test src/output.test.ts`
Expected: FAIL — createErrorEnvelope doesn't accept 4th argument

**Step 7: Update `createErrorEnvelope` and `ErrorEnvelope`**

In `packages/hzl-cli/src/output.ts`:

Update the `ErrorEnvelope` interface:
```typescript
export interface ErrorEnvelope {
  schema_version: typeof SCHEMA_VERSION;
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    suggestions?: string[];
  };
}
```

Update `createErrorEnvelope`:
```typescript
export function createErrorEnvelope(code: string, message: string, details?: unknown, suggestions?: string[]): ErrorEnvelope {
  return {
    schema_version: SCHEMA_VERSION,
    ok: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      ...(suggestions && suggestions.length > 0 ? { suggestions } : {}),
    },
  };
}
```

**Step 8: Run test to verify it passes**

Run: `pnpm --filter hzl-cli test src/output.test.ts`
Expected: PASS

**Step 9: Write the failing test for handleError passing suggestions through**

In `packages/hzl-cli/src/errors.test.ts`, add:

```typescript
it('includes suggestions in error envelope JSON output', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
    throw new Error(`exit:${code}`);
  });

  const error = new CLIError('Task not found: abc', ExitCode.NotFound, undefined, undefined, [
    'hzl task list -P demo',
  ]);
  expect(() => handleError(error, true)).toThrow('exit:4');

  const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
  expect(payload.error.suggestions).toEqual(['hzl task list -P demo']);
});
```

**Step 10: Run test to verify it fails**

Run: `pnpm --filter hzl-cli test src/errors.test.ts`
Expected: FAIL — suggestions not in output

**Step 11: Update `handleError` to pass suggestions through**

In `packages/hzl-cli/src/errors.ts`, update the CLIError branch in `handleError`:

```typescript
if (error instanceof CLIError) {
  if (json) {
    console.log(JSON.stringify(createErrorEnvelope(error.code, error.message, error.details, error.suggestions)));
  } else {
    console.error(`Error: ${error.message}`);
    if (error.suggestions && error.suggestions.length > 0) {
      for (const suggestion of error.suggestions) {
        console.error(`Hint: ${suggestion}`);
      }
    }
  }
  process.exit(error.exitCode);
}
```

**Step 12: Run tests to verify all pass**

Run: `pnpm --filter hzl-cli test src/errors.test.ts src/output.test.ts`
Expected: ALL PASS

**Step 13: Commit**

```bash
git add packages/hzl-cli/src/errors.ts packages/hzl-cli/src/output.ts packages/hzl-cli/src/errors.test.ts packages/hzl-cli/src/output.test.ts
git commit -m "feat: add suggestions field to CLIError and ErrorEnvelope"
```

---

### Task 2: Add suggestions to existing error paths

**Files:**
- Modify: `packages/hzl-cli/src/commands/task/claim.ts`
- Modify: `packages/hzl-cli/src/commands/task/complete.ts`
- Modify: `packages/hzl-cli/src/commands/task/block.ts`
- Modify: `packages/hzl-cli/src/resolve-id.ts`
- Modify: `packages/hzl-cli/src/commands/task/add.ts`
- Modify: `packages/hzl-cli/src/commands/task/show.ts`
- Modify: `packages/hzl-cli/src/commands/task/claim.test.ts`
- Modify: `packages/hzl-cli/src/commands/task/complete.test.ts`
- Modify: `packages/hzl-cli/src/commands/task/block.test.ts`
- Modify: `packages/hzl-cli/src/resolve-id.test.ts`

**Step 1: Update claim.ts — not claimable (wrong status)**

In `packages/hzl-cli/src/commands/task/claim.ts:306-312`, change the CLIError to extract the hint from message and move it to suggestions:

```typescript
throw new CLIError(
  `Task ${taskId} is not claimable (status: ${existingTask.status})`,
  ExitCode.InvalidInput,
  undefined,
  { decision_trace: trace },
  [`hzl task set-status ${taskId} ready`],
);
```

Remove the `\nHint:` from the message string. The suggestions field now carries it.

**Step 2: Update claim.ts — dependencies not done (line ~334)**

```typescript
throw new CLIError(
  `Task ${taskId} has dependencies not done: ${blockers.join(', ')}`,
  ExitCode.InvalidInput,
  undefined,
  { decision_trace: trace },
  blockers.slice(0, 3).map(id => `hzl task show ${id}`),
);
```

**Step 3: Update claim.ts — task not found (line ~291)**

```typescript
throw new CLIError(
  `Task not found: ${taskId}`,
  ExitCode.NotFound,
  undefined,
  { decision_trace: trace },
  [`hzl task list`],
);
```

**Step 4: Update complete.ts — cannot complete (line ~33-36)**

```typescript
throw new CLIError(
  `Cannot complete task ${taskId} (status: ${existingTask.status})`,
  ExitCode.InvalidInput,
  undefined,
  undefined,
  [`hzl task claim ${taskId} --agent <name>`],
);
```

Remove the `\nHint:` from the message.

**Step 5: Update block.ts — cannot block (line ~34-37)**

```typescript
throw new CLIError(
  `Cannot block task ${taskId} (status: ${existingTask.status})`,
  ExitCode.InvalidInput,
  undefined,
  undefined,
  [`hzl task claim ${taskId} --agent <name>`],
);
```

Remove the `\nHint:` from the message.

**Step 6: Update resolve-id.ts — task not found**

```typescript
throw new CLIError(`Task not found: ${idOrPrefix}`, ExitCode.NotFound, undefined, undefined, [
  `hzl task list`,
]);
```

**Step 7: Update resolve-id.ts — ambiguous prefix**

```typescript
if (e instanceof AmbiguousPrefixError) {
  throw new CLIError(
    e.message,
    ExitCode.InvalidInput,
    undefined,
    undefined,
    e.matches.slice(0, 5).map(m => `hzl task show ${m.task_id}`),
  );
}
```

**Step 8: Update add.ts — parent not found (line ~73-75)**

```typescript
throw new CLIError(`Parent task not found: ${parent}`, ExitCode.NotFound, undefined, undefined, [
  `hzl task list`,
]);
```

**Step 9: Update show.ts — task not found (line ~33)**

```typescript
throw new CLIError(`Task not found: ${taskId}`, ExitCode.NotFound, undefined, undefined, [
  `hzl task list`,
]);
```

**Step 10: Update existing tests that match on Hint: in message**

In `packages/hzl-cli/src/commands/task/claim.test.ts:68`, the test checks `.toThrow(/Hint:.*set-status/)`. Update it to check for the suggestions field instead:

```typescript
try {
  runClaim({ ... });
} catch (e) {
  expect(e).toBeInstanceOf(CLIError);
  expect((e as CLIError).suggestions).toContainEqual(expect.stringMatching(/set-status/));
}
```

Similarly update any other tests that match on `\nHint:` in error messages.

**Step 11: Run all affected tests**

Run: `pnpm --filter hzl-cli test`
Expected: ALL PASS

**Step 12: Commit**

```bash
git add packages/hzl-cli/src/commands/task/claim.ts packages/hzl-cli/src/commands/task/complete.ts packages/hzl-cli/src/commands/task/block.ts packages/hzl-cli/src/resolve-id.ts packages/hzl-cli/src/commands/task/add.ts packages/hzl-cli/src/commands/task/show.ts packages/hzl-cli/src/commands/task/claim.test.ts packages/hzl-cli/src/commands/task/complete.test.ts packages/hzl-cli/src/commands/task/block.test.ts packages/hzl-cli/src/resolve-id.test.ts
git commit -m "feat: add actionable suggestions to CLI error responses"
```

---

### Task 3: Compact JSON output (remove pretty-printing)

**Files:**
- Modify: `packages/hzl-cli/src/commands/sync.ts:308`
- Modify: `packages/hzl-cli/src/commands/doctor.ts:288`
- Modify: `packages/hzl-cli/src/commands/init.ts:237`
- Modify: `packages/hzl-cli/src/commands/status.ts:124`
- Modify: `packages/hzl-cli/src/commands/hook.ts:31`
- Modify: `packages/hzl-cli/src/commands/lock.ts:180,203`
- Modify: `packages/hzl-cli/src/commands/task/prune.ts:91`
- Modify: `packages/hzl-cli/src/commands/task/history.ts:59`

**Step 1: Replace all `JSON.stringify(result, null, 2)` with `JSON.stringify(result)` in JSON output paths**

In each file listed above, change:
```typescript
console.log(JSON.stringify(result, null, 2));
```
to:
```typescript
console.log(JSON.stringify(result));
```

**Important:** Do NOT change `init.ts:211` — that writes a config file to disk (`fs.writeFileSync`), not CLI output. Pretty-printing is correct for human-readable config files. Only change the `console.log` output paths.

Also for `prune.ts:91`:
```typescript
console.log(JSON.stringify({ wouldPrune: eligible, count: eligible.length }, null, 2));
```
becomes:
```typescript
console.log(JSON.stringify({ wouldPrune: eligible, count: eligible.length }));
```

**Step 2: Run tests for affected commands**

Run: `pnpm --filter hzl-cli test`
Expected: ALL PASS (tests should not depend on whitespace in JSON output; if any do, update them)

**Step 3: Commit**

```bash
git add packages/hzl-cli/src/commands/sync.ts packages/hzl-cli/src/commands/doctor.ts packages/hzl-cli/src/commands/init.ts packages/hzl-cli/src/commands/status.ts packages/hzl-cli/src/commands/hook.ts packages/hzl-cli/src/commands/lock.ts packages/hzl-cli/src/commands/task/prune.ts packages/hzl-cli/src/commands/task/history.ts
git commit -m "fix: use compact JSON for all CLI output (no pretty-printing)"
```

---

### Task 4: Add `--view` to `show` command

**Files:**
- Modify: `packages/hzl-cli/src/commands/task/show.ts`
- Modify: `packages/hzl-cli/src/commands/task/show.test.ts`

**Step 1: Write the failing test for --view summary on show**

In `packages/hzl-cli/src/commands/task/show.test.ts`, add:

```typescript
describe('--view', () => {
  it('summary view returns minimal task fields and omits comments/checkpoints/subtasks', () => {
    const task = services.taskService.createTask({
      title: 'Test',
      project: 'inbox',
      description: 'Full description',
      tags: ['urgent'],
    });
    services.taskService.addComment(task.task_id, 'A comment');

    const result = runShow({ services, taskId: task.task_id, view: 'summary', json: false });
    // Summary: task has only core fields
    expect(result.task).toHaveProperty('task_id');
    expect(result.task).toHaveProperty('title');
    expect(result.task).toHaveProperty('status');
    expect(result.task).toHaveProperty('project');
    expect(result.task).toHaveProperty('priority');
    expect(result.task).toHaveProperty('parent_id');
    expect(result.task).toHaveProperty('agent');
    expect(result.task).not.toHaveProperty('description');
    expect(result.task).not.toHaveProperty('links');
    expect(result.task).not.toHaveProperty('metadata');
    // Summary omits comments and checkpoints
    expect(result.comments).toEqual([]);
    expect(result.checkpoints).toEqual([]);
  });

  it('standard view includes due_at and tags but omits description/links/metadata', () => {
    const task = services.taskService.createTask({
      title: 'Test',
      project: 'inbox',
      description: 'Full description',
      tags: ['urgent'],
    });

    const result = runShow({ services, taskId: task.task_id, view: 'standard', json: false });
    expect(result.task).toHaveProperty('tags');
    expect(result.task).toHaveProperty('due_at');
    expect(result.task).not.toHaveProperty('description');
    expect(result.task).not.toHaveProperty('links');
    expect(result.task).not.toHaveProperty('metadata');
    // Standard includes comments/checkpoints
    expect(result).toHaveProperty('comments');
    expect(result).toHaveProperty('checkpoints');
  });

  it('full view returns everything (default behavior)', () => {
    const task = services.taskService.createTask({
      title: 'Test',
      project: 'inbox',
      description: 'Full description',
    });

    const result = runShow({ services, taskId: task.task_id, view: 'full', json: false });
    expect(result.task).toHaveProperty('description');
    expect(result.task).toHaveProperty('links');
    expect(result.task).toHaveProperty('metadata');
    expect(result).toHaveProperty('comments');
    expect(result).toHaveProperty('checkpoints');
  });

  it('defaults to full view when --view not specified', () => {
    const task = services.taskService.createTask({ title: 'Test', project: 'inbox', description: 'desc' });
    const result = runShow({ services, taskId: task.task_id, json: false });
    expect(result.task).toHaveProperty('description');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter hzl-cli test src/commands/task/show.test.ts`
Expected: FAIL — runShow doesn't accept `view` option

**Step 3: Implement --view on show**

In `packages/hzl-cli/src/commands/task/show.ts`:

Add a type for ShowView and a shaping function:

```typescript
export type ShowView = 'summary' | 'standard' | 'full';

interface ShowTaskSummary {
  task_id: string;
  title: string;
  project: string;
  status: string;
  priority: number;
  parent_id: string | null;
  agent: string | null;
}

interface ShowTaskStandard extends ShowTaskSummary {
  due_at: string | null;
  tags: string[];
  lease_until: string | null;
}

function shapeTaskForView(task: Task, view: ShowView): ShowTaskSummary | ShowTaskStandard | Task {
  if (view === 'summary') {
    return {
      task_id: task.task_id,
      title: task.title,
      project: task.project,
      status: task.status,
      priority: task.priority,
      parent_id: task.parent_id,
      agent: task.agent,
    };
  }

  if (view === 'standard') {
    return {
      task_id: task.task_id,
      title: task.title,
      project: task.project,
      status: task.status,
      priority: task.priority,
      parent_id: task.parent_id,
      agent: task.agent,
      due_at: task.due_at,
      tags: task.tags,
      lease_until: task.lease_until,
    };
  }

  return task;
}
```

Update `ShowResult` to use a union type for `task`:

```typescript
export interface ShowResult {
  task: ShowTaskSummary | ShowTaskStandard | Task;
  comments: Array<{ text: string; author?: string; timestamp: string }>;
  checkpoints: Array<{ name: string; data: Record<string, unknown>; timestamp: string }>;
  subtasks?: Array<SubtaskSummary> | Array<DeepSubtask>;
}
```

Update `runShow` signature to accept `view?: ShowView` and apply the shaping:

```typescript
export function runShow(options: {
  services: Services;
  taskId: string;
  showSubtasks?: boolean;
  deep?: boolean;
  view?: ShowView;
  json: boolean;
}): ShowResult {
  const { services, taskId, showSubtasks = true, deep = false, view = 'full', json } = options;
  // ... existing task lookup and subtask logic ...

  const shapedTask = shapeTaskForView(task, view);

  // For summary view, skip comments/checkpoints entirely
  const comments = view === 'summary' ? [] : services.taskService.getComments(taskId);
  const checkpoints = view === 'summary' ? [] : services.taskService.getCheckpoints(taskId);

  const result: ShowResult = {
    task: shapedTask,
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
  // ... rest of output logic
```

Update `createShowCommand` to add the `--view` option:

```typescript
.option('--view <view>', 'Response view: summary | standard | full', 'full')
```

And pass it through in the action handler:

```typescript
runShow({
  services,
  taskId,
  showSubtasks: opts.subtasks !== false,
  deep: opts.deep ?? false,
  view: (opts.view as ShowView) ?? 'full',
  json: globalOpts.json ?? false,
});
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter hzl-cli test src/commands/task/show.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/commands/task/show.ts packages/hzl-cli/src/commands/task/show.test.ts
git commit -m "feat: add --view option to show command for token-efficient output"
```

---

### Task 5: Strip empty collections utility

**Files:**
- Create: `packages/hzl-cli/src/strip-empty.ts`
- Create: `packages/hzl-cli/src/strip-empty.test.ts`

**Step 1: Write the failing tests**

Create `packages/hzl-cli/src/strip-empty.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { stripEmptyCollections } from './strip-empty.js';

describe('stripEmptyCollections', () => {
  it('strips empty arrays', () => {
    expect(stripEmptyCollections({ tags: [], title: 'foo' })).toEqual({ title: 'foo' });
  });

  it('strips empty objects', () => {
    expect(stripEmptyCollections({ metadata: {}, title: 'foo' })).toEqual({ title: 'foo' });
  });

  it('keeps non-empty arrays', () => {
    expect(stripEmptyCollections({ tags: ['a'], title: 'foo' })).toEqual({ tags: ['a'], title: 'foo' });
  });

  it('keeps non-empty objects', () => {
    expect(stripEmptyCollections({ metadata: { k: 'v' }, title: 'foo' })).toEqual({ metadata: { k: 'v' }, title: 'foo' });
  });

  it('keeps null values', () => {
    expect(stripEmptyCollections({ agent: null, title: 'foo' })).toEqual({ agent: null, title: 'foo' });
  });

  it('keeps scalar values', () => {
    expect(stripEmptyCollections({ priority: 0, done: false, title: '' })).toEqual({ priority: 0, done: false, title: '' });
  });

  it('does not recurse into nested objects', () => {
    expect(stripEmptyCollections({ nested: { tags: [] } })).toEqual({ nested: { tags: [] } });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter hzl-cli test src/strip-empty.test.ts`
Expected: FAIL — module not found

**Step 3: Implement stripEmptyCollections**

Create `packages/hzl-cli/src/strip-empty.ts`:

```typescript
/**
 * Strip top-level empty arrays and empty objects from a record.
 * Keeps nulls, scalars, non-empty arrays, and non-empty objects.
 * Does not recurse — only strips at the top level.
 */
export function stripEmptyCollections<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value) && value.length === 0) continue;
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) continue;
    result[key] = value;
  }
  return result as Partial<T>;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter hzl-cli test src/strip-empty.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/hzl-cli/src/strip-empty.ts packages/hzl-cli/src/strip-empty.test.ts
git commit -m "feat: add stripEmptyCollections utility for token-efficient output"
```

---

### Task 6: Apply stripEmptyCollections to command JSON output

**Files:**
- Modify: `packages/hzl-cli/src/commands/task/claim.ts`
- Modify: `packages/hzl-cli/src/commands/task/list.ts`
- Modify: `packages/hzl-cli/src/commands/task/show.ts`
- Modify: `packages/hzl-cli/src/commands/task/add.ts`

These are the main commands that return task data with potentially-empty tags/links/metadata. The stripping is applied at the serialization boundary (just before `JSON.stringify`), not in the data shaping functions, so tests of return values are unaffected.

**Step 1: Apply to claim.ts**

In `printClaimResult`, wrap the result before stringifying when the task view contains potentially-empty collections:

```typescript
import { stripEmptyCollections } from '../../strip-empty.js';

function printClaimResult(result: ClaimResult, json: boolean): void {
  if (json) {
    const output = {
      ...result,
      task: result.task ? stripEmptyCollections(result.task) : null,
    };
    console.log(JSON.stringify(output));
    return;
  }
  // ... human output unchanged
}
```

**Step 2: Apply to list.ts**

In `runList`, where JSON output happens (lines ~281 and ~310):

```typescript
import { stripEmptyCollections } from '../../strip-empty.js';
```

At the JSON output points, strip each task:

```typescript
if (json) {
  const output = {
    ...result,
    tasks: result.tasks.map(t => stripEmptyCollections(t)),
    ...(result.groups ? {
      groups: result.groups.map(g => ({
        ...g,
        tasks: g.tasks.map(t => stripEmptyCollections(t)),
      })),
    } : {}),
  };
  console.log(JSON.stringify(output));
}
```

**Step 3: Apply to show.ts**

In `runShow`, at the JSON output point:

```typescript
import { stripEmptyCollections } from '../../strip-empty.js';
```

```typescript
if (json) {
  const output = {
    ...result,
    task: stripEmptyCollections(result.task as Record<string, unknown>),
  };
  console.log(JSON.stringify(output));
}
```

**Step 4: Apply to add.ts**

In `runAdd`, at the JSON output point:

```typescript
import { stripEmptyCollections } from '../../strip-empty.js';
```

```typescript
if (json) {
  console.log(JSON.stringify(stripEmptyCollections(result)));
}
```

**Step 5: Run full test suite**

Run: `pnpm --filter hzl-cli test`
Expected: ALL PASS — stripping is at the serialization boundary, not in return values that tests check

**Step 6: Verify with a quick manual check**

Run: `pnpm --filter hzl-cli build && node packages/hzl-cli/dist/cli.js task add "test empty strip" -p inbox`
Expected: output should NOT contain `"tags":[]`, `"links":[]`, or `"metadata":{}`

**Step 7: Commit**

```bash
git add packages/hzl-cli/src/commands/task/claim.ts packages/hzl-cli/src/commands/task/list.ts packages/hzl-cli/src/commands/task/show.ts packages/hzl-cli/src/commands/task/add.ts
git commit -m "feat: strip empty collections from JSON output for token efficiency"
```

---

### Task 7: Run full validation

**Step 1: Run full test suite**

Run: `pnpm test`
Expected: ALL PASS

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors (or fix any lint issues)

**Step 4: Verify CLI manifest is still current**

Run: `pnpm --filter hzl-cli build && pnpm generate:cli-manifest && pnpm verify:cli-manifest`
Expected: Manifest is current (the --view flag on show adds a new option but doesn't change the command tree)

**Step 5: Verify CLI docs parity**

Run: `pnpm verify:cli-docs`
Expected: PASS (no new commands added, just new options on existing commands)
