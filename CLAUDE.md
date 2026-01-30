# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
npm install          # Install dependencies (all workspaces)
npm run build        # Build all packages
npm test             # Run all tests
npm run test:watch   # Watch mode
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint
npm run lint:fix     # ESLint with auto-fix
```

### Running Single Tests

```bash
# Run a specific test file
npm test -w hzl-core -- src/services/task-service.test.ts

# Run tests matching a pattern
npm test -w hzl-cli -- --grep "claim"
```

### Testing the CLI

```bash
# After building, run CLI commands directly
node packages/hzl-cli/dist/cli.js init
node packages/hzl-cli/dist/cli.js --help

# Or link globally
npm link packages/hzl-cli
hzl --help
```

## Architecture

HZL is an event-sourced task coordination system. The codebase is a monorepo with two packages:

### hzl-core (`packages/hzl-core/`)

Shared business logic library. Key components:

- **Events** (`src/events/`): Append-only event store. All state changes are recorded as immutable events. `EventStore` handles persistence, `types.ts` defines event schemas with Zod validation.

- **Projections** (`src/projections/`): Derived state rebuilt from events. `ProjectionEngine` coordinates projectors. Each projector (`tasks-current.ts`, `dependencies.ts`, `tags.ts`, etc.) maintains a specific view of the data.

- **Services** (`src/services/`): Business operations. `TaskService` is the main entry point for task operations (create, claim, complete, etc.). Uses transactions to ensure atomic claiming.

- **Database** (`src/db/`): SQLite connection management and migrations. Uses WAL mode for concurrent access.

### hzl-cli (`packages/hzl-cli/`)

CLI wrapper using Commander.js. Each command in `src/commands/` is a thin layer that:
1. Parses arguments
2. Calls into `hzl-core` services
3. Formats output (human-readable or `--json`)

## Key Patterns

### Event Sourcing

Every mutation goes through `EventStore.append()`. Current state is derived by applying events to projections. The `tasks_current` table is a projection, not the source of truth.

```typescript
// Correct: append event, let projection update
eventStore.append({ type: EventType.StatusChanged, task_id, data: { from, to } });

// Wrong: never modify projections directly
```

### Atomic Claiming

`TaskService.claimTask()` and `claimNext()` use `withWriteTransaction()` with `BEGIN IMMEDIATE` to prevent race conditions. Two agents calling `claim-next` simultaneously will get different tasks.

### Task Availability

A task is claimable when:
1. Status is `ready`
2. All dependencies have status `done`

The `--available` flag in `hzl list` filters to claimable tasks.

## Database Location

Default: `~/.hzl/data.db` (user-level, not repo-level). Override with `HZL_DB` env var or `--db` flag.

## Testing Concurrency

Concurrency tests in `hzl-core/src/__tests__/concurrency/` spawn worker processes to verify atomic claiming. Run with:

```bash
npm test -w hzl-core -- src/__tests__/concurrency/stress.test.ts
```
