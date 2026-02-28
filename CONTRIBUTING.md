# Contributing to HZL

Thank you for your interest in contributing to HZL.

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/tmchow/hzl.git
   cd hzl
   ```

2. Install dependencies (requires [pnpm](https://pnpm.io/) and Node.js ≥ 22.14.0):
   ```bash
   pnpm install
   ```

3. Build all packages:
   ```bash
   pnpm build
   ```

4. Run tests:
   ```bash
   pnpm test
   ```

## Project Structure

```
hzl/
├── packages/
│   ├── hzl-core/     # Core business logic, SQLite, events, projections
│   ├── hzl-cli/      # CLI wrapper over hzl-core
│   └── hzl-web/      # Web dashboard server
├── docs-site/        # Documentation site (hzl-tasks.com)
├── docs/             # Internal development docs
└── .github/
    └── workflows/    # CI/CD configuration
```

## Development Workflow

1. Create a feature branch from `main`.
2. Make changes following the existing code style.
3. Write tests for new functionality.
4. Ensure all checks pass:
   ```bash
   pnpm test
   pnpm typecheck
   pnpm lint
   pnpm format:check
   ```
5. Submit a pull request.

## CI & Release Expectations

- The `CI` workflow must pass before merging to `main`.
- Merges to `main` do **not** auto-release.
- Maintainers trigger `Release` manually from `main` (`mode=dry-run` first, then `mode=publish`).
- Keep branch protection on `main` requiring the `CI` status check.

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/), enforced by commitlint:

- `feat(scope): add new feature`
- `fix(scope): fix bug`
- `docs(scope): update documentation`
- `test(scope): add tests`
- `refactor(scope): refactor code`
- `chore(scope): maintenance tasks`

Scopes: `core`, `cli`, `web`, `ci`, `docs`

## Code Style

- Prettier for formatting
- ESLint for linting

Useful commands:

```bash
pnpm format        # Auto-format
pnpm format:check  # Check formatting
pnpm lint:fix      # Lint with auto-fix
```
