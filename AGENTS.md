# AGENTS.md

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
# Dev mode is automatic - uses .local/hzl/ in repo, not ~/.hzl/
node packages/hzl-cli/dist/cli.js init
node packages/hzl-cli/dist/cli.js --help

# Or link globally (WARNING: linked CLI still detects dev mode based on install location)
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

`TaskService.claimTask()` and `claimNext()` use `withWriteTransaction()` with `BEGIN IMMEDIATE` to prevent race conditions. Two agents calling `claimNext()` simultaneously will get different tasks.

### Task Availability

A task is claimable when:
1. Status is `ready`
2. All dependencies have status `done`

The `--available` flag in `hzl task list` filters to claimable tasks.

## Database Location

### Production (installed CLI)

Uses [XDG Base Directory](https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html) paths:

- Database: `$XDG_DATA_HOME/hzl/data.db` (defaults to `~/.local/share/hzl/data.db`)
- Config: `$XDG_CONFIG_HOME/hzl/config.json` (defaults to `~/.config/hzl/config.json`)

Resolution order: `--db` flag → `HZL_DB` env → config file → default.

### Development (running from source)

**Dev mode is automatic.** When running the CLI from this repo (e.g., `node packages/hzl-cli/dist/cli.js`), hzl detects it's in the source tree and uses project-local storage:

- Database: `.local/hzl/data.db` (in repo root)
- Config: `.config/hzl/config.json` (in repo root)

This isolation is automatic - no env vars or setup required. The CLI shows `(dev mode - isolated from production)` in output to confirm.

To disable dev mode (for tests checking production behavior): `HZL_DEV_MODE=0`

### CRITICAL: Never modify user's XDG directories

**Do not delete, overwrite, or modify `~/.local/share/hzl/` or `~/.config/hzl/`.** These directories contain the user's real production data if they use hzl outside of development.

When testing or developing:
- Always use the dev mode paths (automatic when running from source)
- Never run commands that could affect the user's XDG directories
- If you need to test with a clean database, use the project-local `.local/hzl/` directory

## Testing Concurrency

Concurrency tests in `hzl-core/src/__tests__/concurrency/` spawn worker processes to verify atomic claiming. Run with:

```bash
npm test -w hzl-core -- src/__tests__/concurrency/stress.test.ts
```

## Commits and Releases

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint. Commits must follow the format:

```
type(scope): description

# Examples:
feat: add task search command
fix: prevent race condition in claim-next
feat!: change task status enum values    # Breaking change
docs: update README
chore: bump dependencies
test: add concurrency stress tests
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`

**Version bumps** (automated via semantic-release on merge to main):
- `fix:` → patch (0.1.0 → 0.1.1)
- `feat:` → minor (0.1.0 → 0.2.0)
- `feat!:` or `BREAKING CHANGE:` in body → major (0.1.0 → 1.0.0)
- `docs:`, `chore:`, `test:`, etc. → no release

Both packages are versioned together (linked versions).

## Documentation

**README**: Edit `/README.md` (root) only. The release script copies it to `/packages/hzl-cli/README.md` for npm. Never edit the CLI README directly.
