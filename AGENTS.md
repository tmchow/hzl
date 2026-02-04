# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- START docs/snippets/agent-policy.md -->
<!-- ⚠️ DO NOT EDIT - Auto-generated from docs/snippets/agent-policy.md -->
### HZL task ledger (external task tracking)

HZL is an external task database. Use it when external tracking helps clarity, handoff, or auditability.

**Use HZL when:**
- Work has multiple steps or may not finish this session
- You want durable record of progress or ownership
- Handoff or review expected
- Task is non-trivial (~30+ min or risky changes)

**Skip HZL when:**
- Small, clearly scoped work completed immediately
- Quick one-off answer or tiny change

**Rule of thumb:** If you're tempted to make a multi-step plan, use HZL.

**Structure:**
- **Project** = repo name. One per repo. Always `hzl project list` first.
- **Task** = feature or work item.
- **Subtask** = breakdown (`--parent <id>`). Max 1 level.

**Anti-pattern: project sprawl**
```bash
hzl project create "query-perf"  # Wrong: feature is not a project
```
Features are parent tasks:
```bash
hzl task add "Query perf" -P myrepo           # Parent task
hzl task add "Fix N+1" --parent <parent-id>   # Subtask
```

---

**Setup:**
```bash
hzl project list                    # Always check first
hzl project create <repo-name>      # Only if needed
```

**Adding work:**
```bash
hzl task add "Feature X" -P myrepo -s ready           # Ready to claim
hzl task add "Subtask A" --parent <id>                # Subtask
hzl task add "Subtask B" --parent <id> --depends-on <subtask-a-id>  # With dependency
```

**Working on a task:**
```bash
hzl task next -P myrepo                  # Next available task
hzl task next --parent <id>              # Next subtask of parent
hzl task next -P myrepo --claim          # Find and claim in one step
hzl task claim <id>                      # Claim specific task
hzl task checkpoint <id> "milestone X"   # Notable progress or before pausing
```

**Changing status:**
```bash
hzl task set-status <id> ready           # Make claimable (from backlog)
hzl task set-status <id> backlog         # Move back to planning
```
Statuses: `backlog` → `ready` → `in_progress` → `done` (or `blocked`)

**When blocked:**
```bash
hzl task block <id> --comment "Waiting for API keys from DevOps"
hzl task unblock <id>                    # When resolved
```

**Finishing work:**
```bash
hzl task comment <id> "Implemented X, tested Y"  # Optional: final notes
hzl task complete <id>

# After completing a subtask, check parent:
hzl task show <parent-id> --json         # Any subtasks left?
hzl task complete <parent-id>            # If all done, complete parent
```

**Troubleshooting:**
| Error | Fix |
|-------|-----|
| "not claimable (status: backlog)" | `hzl task set-status <id> ready` |
| "Cannot complete: status is X" | Claim first: `hzl task claim <id>` |

---

**DESTRUCTIVE - Never run without explicit user request:**
- `hzl task prune` — **PERMANENTLY DELETES** old done/archived tasks. No undo.
<!-- END docs/snippets/agent-policy.md -->

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

### CRITICAL: Never modify user's XDG directories

**Do not delete, overwrite, or modify `~/.local/share/hzl/` or `~/.config/hzl/`.** These directories contain the user's real production data if they use hzl outside of development.

When testing or developing:
- Always use the dev mode paths (automatic when running from source)
- Never run commands that could affect the user's XDG directories
- If you need to test with a clean database, use the project-local `.local/hzl/` directory

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

**Version bumps** (automated via semantic-release on merge to main):
- `fix:` → patch (0.1.0 → 0.1.1)
- `feat:` → minor (0.1.0 → 0.2.0)
- `feat!:` or `BREAKING CHANGE:` in body → major (0.1.0 → 1.0.0)
- `docs:`, `chore:`, `test:`, `style:`, `refactor:`, `ci:`, `build:` → patch

Both packages are versioned together (linked versions).

## Documentation

**README**: Edit `/README.md` (root) only. The release script copies it to `/packages/hzl-cli/README.md` for npm. Never edit the CLI README directly.

### Documentation Includes (Snippet System)

Reusable documentation lives in `docs/snippets/`. A GitHub Action syncs snippet content into target files automatically.

**Scanned paths:**
- `README.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `CODEX.md`
- `docs/**/*.md`
- `skills/**/*.md`

**Available snippets:**
- `docs/snippets/agent-policy.md` — HZL policy for coding agents (core workflow)
- `docs/snippets/coding-agent-setup.md` — Setup instructions for Claude Code, Codex, Gemini
- `docs/snippets/openclaw-setup-prompt.md` — OpenClaw quick start prompt
- `docs/snippets/upgrade-hzl-prompt.md` — HZL upgrade prompt for OpenClaw

**HZL documentation structure:**

The HZL documentation is layered to serve different agent capabilities:

| File | Purpose | When loaded |
|------|---------|-------------|
| `docs/snippets/agent-policy.md` | Core workflow commands | Every turn (via AGENTS.md) |
| `skills/hzl/SKILL.md` | Core + advanced topics | On-demand (skill invocation) |
| `docs/openclaw/tools-prompt.md` | OpenClaw-specific (uses `openclaw` project) | OpenClaw context |

The skill includes `agent-policy.md` via snippet markers, so:
- Agents without skill support get the core workflow from AGENTS.md
- Agents with skill support get core + advanced topics (multi-agent, leases, recovery)
- Updating `agent-policy.md` automatically updates the skill

**Marker syntax:**

```markdown
<!-- START docs/snippets/your-snippet.md -->
<!-- END docs/snippets/your-snippet.md -->
```

To wrap the snippet in a code fence (for showing as copyable code):

```markdown
<!-- START [code:md] docs/snippets/your-snippet.md -->
<!-- END [code:md] docs/snippets/your-snippet.md -->
```

The `[code:X]` modifier wraps content in triple backticks with language `X` (e.g., `md`, `txt`, `bash`).

**How it works:**
1. Edit the source file in `docs/snippets/`
2. Push to main
3. GitHub Action runs `node scripts/sync-snippets.js`
4. Action fills content between markers and commits

**To add a new snippet:**
1. Create the snippet file in `docs/snippets/`
2. Add markers in any scanned file (see paths above)
3. Push — the action fills in the content

**To edit a snippet:** Edit the source file in `docs/snippets/`, never the content between markers.

**Local testing:**
```bash
node scripts/sync-snippets.js          # Sync snippets locally
node scripts/sync-snippets.js --check  # Check if snippets are in sync (CI)
```

### ⚠️ Documentation to Update When CLI Changes

**IMPORTANT:** After any CLI change, always ask: "Does the documentation site need to be updated?"

When adding or modifying CLI commands, flags, or workflows, update **all** of the following:

| Document | Path | What to update |
|----------|------|----------------|
| **README** | `README.md` | CLI reference section |
| **Agent policy snippet** | `docs/snippets/agent-policy.md` | Key commands list |
| **Claude Code / Codex skill** | `skills/hzl/SKILL.md` | Scenarios, examples, command reference |
| **OpenClaw skill** | `docs/openclaw/skills/hzl/SKILL.md` | Quick reference, patterns, examples |
| **Docs site - Tasks** | `docs/concepts/tasks.md` | Task creation flags, update options, workflows |
| **Docs site - Other** | `docs/concepts/*.md` | Check if other concept pages are affected |

**Changes that require updates:**
- New CLI commands (e.g., `block`, `unblock`, `progress`)
- New or modified flags (e.g., `--links`, `--agent-id`, `--progress`)
- Changed command behavior or workflows
- New concepts (e.g., authorship tracking, blocked status)

**Forgetting to update these means:**
- AI agents won't know about new features (skills)
- Users won't find documentation (docs site)
- The README will be out of date
