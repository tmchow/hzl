# pnpm Migration Design

**Date:** 2026-02-02
**Status:** Approved
**Goal:** Migrate from npm to pnpm to fix internal dependency version sync issues

## Problem

When publishing with npm workspaces, internal dependency versions (e.g., `hzl-cli` depending on `hzl-web`) don't automatically update. This caused users to get stale versions of `hzl-web` when installing `hzl-cli` globally.

npm doesn't support the `workspace:*` protocol natively. A custom script was syncing versions, but it was incomplete.

## Solution

Migrate to pnpm, which natively supports `workspace:*` and replaces it with the actual version at publish time.

## Changes

### 1. Package Manager Setup

**Create `pnpm-workspace.yaml`:**
```yaml
packages:
  - 'packages/*'
```

**Create `.npmrc` (optional - only if peer dependency errors occur):**
```ini
strict-peer-dependencies=false
```

**Update `package.json` (root):**
```json
{
  "packageManager": "pnpm@10.28.2",
  "scripts": {
    "build": "pnpm -r run build",
    "test": "pnpm -r run test",
    "test:ci": "pnpm -r run test -- --run --coverage",
    "test:watch": "pnpm -r run test -- --watch",
    "typecheck": "tsc -b packages/*/tsconfig.json",
    "lint": "eslint \"packages/*/src/**/*.ts\"",
    "lint:fix": "eslint \"packages/*/src/**/*.ts\" --fix",
    "format": "prettier -w .",
    "format:check": "prettier -c .",
    "verify:marketplace": "node scripts/verify-marketplace-versions.js",
    "clean": "rm -rf packages/*/dist packages/*/.turbo",
    "prepare": "husky && pnpm run build"
  }
}
```

**Remove from root `package.json`:**
- The `workspaces` field (superseded by `pnpm-workspace.yaml`)
- The `version:patch`, `version:minor`, `version:major` scripts (not needed with semantic-release)

**Delete:** `package-lock.json`

### 2. Internal Dependencies

Already set (no changes needed):
- `hzl-cli/package.json`: `"hzl-core": "workspace:*", "hzl-web": "workspace:*"`
- `hzl-web/package.json`: `"hzl-core": "workspace:*"`

### 3. CI Workflows

**`.github/workflows/ci.yml`** — replace npm steps:

```yaml
- name: Setup pnpm
  uses: pnpm/action-setup@v4

- name: Setup Node.js
  uses: actions/setup-node@v6
  with:
    node-version: '22.14.0'
    cache: 'pnpm'

- name: Install dependencies
  run: pnpm install --frozen-lockfile
```

Remove corepack steps. Replace `npm run X` with `pnpm X`.

**`.github/workflows/release.yml`** — same pattern, plus:
- Change `npx semantic-release` to `pnpm exec semantic-release`

**`.github/workflows/commitlint.yml`** — same pattern:
- Add pnpm/action-setup before setup-node
- Change `cache: 'npm'` to `cache: 'pnpm'`
- Change `npm ci` to `pnpm install --frozen-lockfile`
- Change `npx commitlint` to `pnpm exec commitlint`

### 4. Release Process

**`.releaserc.json`:**
- Change `npm install --package-lock-only` to `pnpm install --lockfile-only`
- Change `package-lock.json` to `pnpm-lock.yaml` in git assets

### 5. Documentation

**`AGENTS.md`:**
- Update all `npm` commands to `pnpm`
- Update `-w <package>` to `--filter <package>`

## What Stays the Same

- Semantic-release workflow
- Package structure (3 packages)
- TypeScript/build configuration
- Husky/commitlint
- All existing scripts (just invoked via pnpm)

## Migration Steps

1. Create `pnpm-workspace.yaml`
2. Update root `package.json` (packageManager, scripts, remove workspaces field)
3. Update CI workflows (ci.yml, release.yml, commitlint.yml)
4. Update `.releaserc.json`
5. Update `AGENTS.md`
6. Delete `package-lock.json`
7. Run `pnpm install` to generate `pnpm-lock.yaml`
8. Test locally: `pnpm build && pnpm test`
9. Test semantic-release dry-run: `pnpm exec semantic-release --dry-run`
10. Commit and push

## Rollback Plan

If migration fails after merging:
1. Revert the migration commit
2. Delete `pnpm-lock.yaml` and `pnpm-workspace.yaml`
3. Run `npm install` to regenerate `package-lock.json`
4. Commit and push

## Troubleshooting

**Peer dependency errors:** Create `.npmrc` with `strict-peer-dependencies=false`

**Phantom dependencies:** If tests fail with "module not found" errors for packages not in your dependencies, add them explicitly. pnpm uses stricter node_modules structure than npm.
