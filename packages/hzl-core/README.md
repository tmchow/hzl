# hzl-core

Core library for [HZL](https://github.com/tmchow/hzl) - lightweight task tracking for AI agents and swarms.

This package provides the business logic for programmatic use. For the CLI, install [`hzl-cli`](https://www.npmjs.com/package/hzl-cli) instead.

## Installation

```bash
npm install hzl-core
```

## Usage

```typescript
import {
  createConnection,
  runMigrations,
  EventStore,
  ProjectionEngine,
  TaskService,
  ProjectService,
} from 'hzl-core';

// Initialize database
const db = createConnection('/path/to/data.db');
runMigrations(db);

// Set up event sourcing
const eventStore = new EventStore(db);
const projectionEngine = new ProjectionEngine(db, eventStore);

// Create services
const taskService = new TaskService(db, eventStore, projectionEngine);
const projectService = new ProjectService(db, eventStore, projectionEngine);

// Create a project and task
projectService.createProject({ name: 'my-project' });
const task = taskService.createTask({
  title: 'Implement feature',
  project: 'my-project',
});

// Claim and complete
taskService.claimTask(task.id, { owner: 'agent-1' });
taskService.completeTask(task.id);
```

## Key Concepts

**Event Sourcing**: All state changes are recorded as immutable events. The `EventStore` handles persistence, and projections derive current state.

**Atomic Claiming**: `claimTask()` and `claimNext()` use database transactions to prevent race conditions when multiple agents claim work concurrently.

**Projections**: Current state is rebuilt from events. The `ProjectionEngine` coordinates projectors that maintain specific views (tasks, dependencies, tags, etc.).

## Exports

- **Database**: `createConnection`, `runMigrations`, `withWriteTransaction`
- **Events**: `EventStore`, `EventType`, `TaskStatus`
- **Projections**: `ProjectionEngine`, individual projectors
- **Services**: `TaskService`, `ProjectService`, `SearchService`, `ValidationService`, `BackupService`

## License

MIT
