---
name: event-sourcing-patterns
description: Enforces event sourcing patterns in hzl - all state mutations must go through EventStore.append(), projections are read-only derived state
user-invocable: false
---

# Event Sourcing Patterns for HZL

This skill is automatically applied when working on hzl code. It enforces the event sourcing architecture where events are the source of truth and projections are derived state.

## Core Principles

### 1. Events Are Immutable Facts

All state changes are recorded as immutable events via `EventStore.append()`. Events represent facts that happened in the past and cannot be modified or deleted.

```typescript
// CORRECT: Record what happened as an event
await eventStore.append({
  type: EventType.TaskCreated,
  task_id: newId,
  data: { title, project_id, status: 'ready' }
});

// WRONG: Never modify state directly
await db.run('INSERT INTO tasks_current ...'); // Bypasses event sourcing!
```

### 2. Projections Are Derived, Read-Only Views

The `tasks_current`, `dependencies`, `tags`, and other projection tables are rebuilt from events. They exist for query performance, not as sources of truth.

**When adding a new feature:**
1. Define the event type in `src/events/types.ts`
2. Add the event handler in the appropriate projector (`src/projections/*.ts`)
3. Append the event in the service layer (`src/services/*.ts`)

**Never:**
- Write directly to projection tables outside of projectors
- Store data only in projections without a corresponding event
- Modify projection logic to have side effects

### 3. Event Types and Schemas

All events are defined in `packages/hzl-core/src/events/types.ts` with Zod validation:

```typescript
// Adding a new event type:
export enum EventType {
  // ... existing types
  MyNewEvent = 'my_new_event',
}

export const MyNewEventSchema = z.object({
  type: z.literal(EventType.MyNewEvent),
  task_id: z.string(),
  data: z.object({
    // event-specific payload
  }),
  timestamp: z.string().optional(),
});
```

### 4. Projector Pattern

Projectors in `src/projections/` follow this pattern:

```typescript
export class MyProjector implements Projector {
  // Called once at startup to create tables
  initialize(db: Database): void {
    db.run(`CREATE TABLE IF NOT EXISTS my_projection (...)`);
  }

  // Called for each event during replay/live processing
  apply(db: Database, event: HzlEvent): void {
    if (event.type === EventType.MyNewEvent) {
      // Update projection based on event data
      db.run(`INSERT INTO my_projection ...`, [event.data...]);
    }
  }
}
```

### 5. Service Layer Responsibilities

Services in `src/services/` orchestrate business logic:

```typescript
// TaskService example pattern
async createTask(params: CreateTaskParams): Promise<Task> {
  const id = generateId();

  // Validate business rules
  if (!params.title) throw new Error('Title required');

  // Append event (this triggers projection updates)
  await this.eventStore.append({
    type: EventType.TaskCreated,
    task_id: id,
    data: { title: params.title, ... }
  });

  // Return current state from projection (for convenience)
  return this.getTask(id);
}
```

## Checklist When Implementing Features

- [ ] New state change? Define event type in `events/types.ts`
- [ ] Event has Zod schema for validation
- [ ] Projector handles the new event type
- [ ] Service appends event (never writes to projections directly)
- [ ] Projection can be rebuilt from events (no external dependencies)
- [ ] Concurrent operations use `withWriteTransaction()` for atomicity

## Common Mistakes to Avoid

| Mistake | Correct Approach |
|---------|------------------|
| `db.run('UPDATE tasks_current ...')` in service | Append a `StatusChanged` event |
| Storing computed values only in projection | Store source data in event, compute in projector |
| Reading from projection, then writing event based on stale data | Use `withWriteTransaction()` for atomic read-modify-write |
| Adding timestamps in projector | Timestamps belong in events (set at append time) |
