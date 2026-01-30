# Contributing to HZL

Thank you for your interest in contributing to HZL.

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/hzl.git
   cd hzl
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build all packages:
   ```bash
   npm run build
   ```

4. Run tests:
   ```bash
   npm test
   ```

## Project Structure

```
hzl/
├── packages/
│   ├── hzl-core/     # Core business logic, SQLite, events, projections
│   └── hzl-cli/      # CLI wrapper over hzl-core
├── docs/
│   └── plans/        # Implementation plans
└── .github/
    └── workflows/    # CI/CD configuration
```

## Development Workflow

1. Create a feature branch from `main`.
2. Make changes following the existing code style.
3. Write tests for new functionality.
4. Ensure all checks pass:
   ```bash
   npm test
   npm run format:check
   npm run typecheck
   npm run lint
   ```
5. Submit a pull request.

## Commit Messages

We use Conventional Commits:

- `feat(scope): add new feature`
- `fix(scope): fix bug`
- `docs(scope): update documentation`
- `test(scope): add tests`
- `refactor(scope): refactor code`
- `chore(scope): maintenance tasks`

Scopes: `core`, `cli`, `ci`, `docs`

## Code Style

- Prettier for formatting
- ESLint for linting

Useful commands:

```bash
npm run format
npm run lint:fix
```
