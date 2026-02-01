# hzl-web

Web dashboard for [HZL](https://github.com/tmchow/hzl) - a Kanban-style task monitoring UI.

This package provides the web server and dashboard for programmatic use. For the CLI (which includes `hzl serve`), install [`hzl-cli`](https://www.npmjs.com/package/hzl-cli) instead.

## Installation

```bash
npm install hzl-web
```

## Usage

```typescript
import { createConnection, runMigrations, EventStore, ProjectionEngine, TaskService } from 'hzl-core';
import { createWebServer } from 'hzl-web';

// Initialize database and services
const db = createConnection('/path/to/data.db');
runMigrations(db);
const eventStore = new EventStore(db);
const projectionEngine = new ProjectionEngine(db, eventStore);
const taskService = new TaskService(db, eventStore, projectionEngine);

// Start the web server
const server = createWebServer({
  port: 3456,
  host: '0.0.0.0', // or '127.0.0.1' for localhost only
  taskService,
  eventStore,
});

console.log(`Dashboard running at ${server.url}`);

// Stop the server when done
await server.close();
```

## Features

- **Kanban board**: Columns for Backlog, Blocked, Ready, In Progress, and Done
- **Date filtering**: Today, Last 3d, 7d, 14d, 30d
- **Project filtering**: Focus on a single project
- **Task details**: Click any card to see description, comments, and checkpoints
- **Activity panel**: Recent status changes and events
- **Auto-refresh**: Polls for updates (configurable interval)

## API Endpoints

The server exposes a JSON API:

- `GET /api/tasks` - List tasks (query: `since`, `project`)
- `GET /api/tasks/:id` - Task details
- `GET /api/tasks/:id/comments` - Task comments
- `GET /api/tasks/:id/checkpoints` - Task checkpoints
- `GET /api/events` - Recent events (query: `since` for event ID)
- `GET /api/stats` - Task statistics

## Exports

- `createWebServer(options)` - Create and start the web server
- `ServerOptions` - Configuration type
- `ServerHandle` - Server control interface (close, port, host, url)

## License

MIT
