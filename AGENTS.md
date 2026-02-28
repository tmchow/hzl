# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
pnpm install          # Install dependencies (all workspaces)
pnpm build            # Build all packages
pnpm test             # Run all tests
pnpm test:watch       # Watch mode
pnpm typecheck        # TypeScript type checking
pnpm lint             # ESLint
pnpm lint:fix         # ESLint with auto-fix
```

### Running Single Tests

```bash
# Run a specific test file
pnpm --filter hzl-core test src/services/task-service.test.ts

# Run tests matching a pattern
pnpm --filter hzl-cli test -- --grep "claim"
```

### After Refactoring

When moving logic between layers (CLI → service) or changing error handling:

1. Run tests for the specific modified files, not just the full suite:
   ```bash
   pnpm --filter hzl-cli test src/commands/task/archive.test.ts
   ```

2. Verify error message patterns in tests still match - service layer errors won't include CLI flag prefixes (`--cascade` vs `cascade`)

### Testing the CLI

```bash
# After building, run CLI commands directly
# Dev mode is automatic - uses .local/hzl/ in repo, not ~/.hzl/
node packages/hzl-cli/dist/cli.js init
node packages/hzl-cli/dist/cli.js --help

# Or link globally (note: pnpm link works differently than npm link)
pnpm link --global packages/hzl-cli
hzl --help
```

### Running the Web Dashboard (Worktrees + Dev Mode)

```bash
# Build the web + CLI packages (required after UI/server changes)
pnpm --filter hzl-web build
pnpm --filter hzl-cli build

# Start the dashboard server from the CLI (this is the correct entrypoint)
node packages/hzl-cli/dist/cli.js serve

# Optional: bind localhost only
node packages/hzl-cli/dist/cli.js serve --host 127.0.0.1
```

Notes:
- In a worktree, dev mode is automatic and uses `.local/hzl/` in that worktree.
- Do not run `node packages/hzl-web/dist/server.js` directly; it exports helpers but does not keep the process alive.
- Open `http://localhost:3456` after starting the server.

### Quick UI Smoke Test (Subtasks)

```bash
# Create a parent + child and verify the badge in the UI
node packages/hzl-cli/dist/cli.js task add "Parent task" -p demo
node packages/hzl-cli/dist/cli.js task add "Child task" -p demo --parent <parent_id>
```

Then:
- Open the dashboard, toggle "Show subtasks" off.
- Verify the parent card shows `[1 subtasks]` (or `[N/M subtasks]` when filtered).

## Architecture

HZL is an event-sourced task coordination system. The codebase is a monorepo with three packages:

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

### hzl-web (`packages/hzl-web/`)

Web dashboard server. Serves the Kanban board UI at `http://localhost:3456`. Uses hzl-core for data access.

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

- Database: `$XDG_DATA_HOME/hzl/` (defaults to `~/.local/share/hzl/`) containing `events.db` and `cache.db`
- Config: `$XDG_CONFIG_HOME/hzl/config.json` (defaults to `~/.config/hzl/config.json`)

Resolution order: `--db` flag → `HZL_DB` env → config file → default.

### Development (running from source)

**Dev mode is automatic.** When running the CLI from this repo (e.g., `node packages/hzl-cli/dist/cli.js`), hzl detects it's in the source tree and uses project-local storage:

- Database: `.local/hzl/` (in repo root) containing `events.db` and `cache.db`
- Config: `.config/hzl/config.json` (in repo root)

This isolation is automatic - no env vars or setup required. The CLI shows `(dev mode - isolated from production)` in output to confirm.

To disable dev mode (for tests checking production behavior): `HZL_DEV_MODE=0`

### Formal Local-Dev DB Contract

When running from the source repo, HZL must use repo-local storage by default:
- Events DB: `.local/hzl/events.db`
- Cache DB: `.local/hzl/cache.db`
- Config: `.config/hzl/config.json`

Guardrails:
- In dev mode, HZL rejects production XDG DB paths by default (for `--db`, `HZL_DB`, `HZL_DB_EVENTS_PATH`, and config `db.events.path`).
- In dev mode, HZL rejects production XDG config paths provided by `HZL_CONFIG`.
- To intentionally use production DB/config paths from source, set `HZL_ALLOW_PROD_DB=1` and/or `HZL_ALLOW_PROD_CONFIG=1` (or disable dev mode with `HZL_DEV_MODE=0`).

### CRITICAL: Never modify user's XDG directories

**Do not delete, overwrite, or modify `~/.local/share/hzl/` or `~/.config/hzl/`.** These directories contain the user's real production data if they use hzl outside of development.

When testing or developing:
- Always use the dev mode paths (automatic when running from source)
- Never run commands that could affect the user's XDG directories
- If you need to test with a clean database, use the project-local `.local/hzl/` directory
- For agents/runtimes without hook callbacks, preflight commands with `scripts/guard-production-hzl-data.sh --tool Bash --command "<command>"` or path checks with `--tool Write --file-path "<path>"`

## Testing Concurrency

Concurrency tests in `hzl-core/src/__tests__/concurrency/` spawn worker processes to verify atomic claiming. Run with:

```bash
pnpm --filter hzl-core test src/__tests__/concurrency/stress.test.ts
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

**Release trigger:** Releases are **manual**. Merges to `main` do not publish automatically.

Run the release workflow from `main`:
```bash
# Preview next version and notes (no publish)
gh workflow run release.yml --ref main -f mode=dry-run

# Publish when ready
gh workflow run release.yml --ref main -f mode=publish
```

**Version bumps** (semantic-release, on `mode=publish`):
- `fix:` → patch (0.1.0 → 0.1.1)
- `perf:` → patch (0.1.0 → 0.1.1)
- `feat:` → minor (0.1.0 → 0.2.0)
- `feat!:` or `BREAKING CHANGE:` in body → major (0.1.0 → 1.0.0)
- `docs:`, `chore:`, `test:`, `style:`, `refactor:`, `ci:`, `build:` → no release

**During publish:** semantic-release updates `CHANGELOG.md` from Conventional Commit messages since the last tag, creates the release commit/tag/GitHub release, publishes npm packages, and then triggers Homebrew formula update.

All published packages are versioned together (linked versions).

## Documentation

**README**: Edit `/README.md` (root) only. The release script copies it to `/packages/hzl-cli/README.md` for npm. Never edit the CLI README directly.

### Documentation Structure

The documentation is organized into three folders:

| Folder | Purpose |
|--------|---------|
| `docs-site/` | External documentation site (GitHub Pages) |
| `docs/` | Internal development docs (plans, brainstorms, solutions) |
| `snippets/` | Source files for CLI output and snippet sync |

**HZL documentation layers:**

| Source | Purpose | When accessed |
|--------|---------|---------------|
| `snippets/AGENT-POLICY.md` | Minimal policy (when to use HZL) | Installer/instruction-file guidance |
| `snippets/HZL-GUIDE.md` | Full workflow guide | Via `hzl guide` command |
| `skills/hzl/SKILL.md` | OpenClaw skill reference | During OpenClaw agent operation |
| `docs-site/getting-started/installation.md` | OpenClaw-specific setup and runtime policy | During OpenClaw install/maintenance |

Agents get the minimal HZL policy in AGENTS.md, then run `hzl guide` for full workflow documentation.

### Snippet Source Files

Reusable HZL source content lives in `/snippets/`:
- `snippets/AGENT-POLICY.md` — Minimal policy used by installer messaging and instruction-file guidance.
- `snippets/HZL-GUIDE.md` — Source for `hzl guide` content generation.

### ⚠️ Documentation to Update When CLI Changes

**IMPORTANT:** After any CLI change, always ask: "Does the documentation site need to be updated?"

When adding or modifying CLI commands, flags, or workflows, update **all** of the following:

| Document | Path | What to update |
|----------|------|----------------|
| **README** | `README.md` | CLI reference section |
| **Agent policy snippet** | `snippets/AGENT-POLICY.md` | Key commands list |
| **OpenClaw skill** | `skills/hzl/SKILL.md` | Quick reference, patterns, examples |
| **Docs site - Tasks** | `docs-site/concepts/tasks.md` | Task creation flags, update options, workflows |
| **Docs site - Other** | `docs-site/concepts/*.md` | Check if other concept pages are affected |

**Changes that require updates:**
- New CLI commands (e.g., `block`, `unblock`, `progress`)
- New or modified flags (e.g., `--links`, `--agent-id`, `--progress`)
- Changed command behavior or workflows
- New concepts (e.g., authorship tracking, blocked status)

**Forgetting to update these means:**
- AI agents won't know about new features (skills)
- Users won't find documentation (docs site)
- The README will be out of date

### CLI/docs parity checks

The repo now has a CLI manifest + docs parity gate to prevent command drift:

```bash
# Regenerate machine-readable CLI manifest from the real Commander command tree
pnpm generate:cli-manifest

# Verify committed manifest is current (CI check)
pnpm verify:cli-manifest

# Verify docs-site/reference/cli.md covers all leaf CLI commands
pnpm verify:cli-docs
```

Files involved:
- `docs/metadata/cli-manifest.json` — generated manifest (source of truth snapshot)
- `scripts/generate-cli-manifest.js` — generator
- `scripts/verify-cli-doc-parity.js` — docs checker

When adding/removing/renaming commands:
1. Run `pnpm --filter hzl-cli build`
2. Run `pnpm generate:cli-manifest`
3. Update `docs-site/reference/cli.md`
4. Run `pnpm verify:cli-manifest && pnpm verify:cli-docs`

### Node.js Version Updates

When changing the minimum Node.js version, update these locations:

1. `package.json` — `engines.node` field
2. `README.md` - mentions of node version
