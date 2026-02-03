---
title: Fix npm publish authentication failure after pnpm workspace migration
date: 2026-02-02
tags: [pnpm, npm, semantic-release, authentication, CI]
category: ci-issues
module: release-workflow
symptoms:
  - npm error code ENEEDAUTH when publishing packages
  - semantic-release fails during pnpm exec invocation
  - NPM_TOKEN not properly passed through pnpm execution context
related_issues: []
---

# Fix npm publish authentication failure after pnpm workspace migration

## Problem Description

After migrating from npm to pnpm workspaces, the automated release workflow began failing when attempting to publish npm packages to the registry. While version 1.17.1 published successfully before the migration, version 1.18.0 failed consistently with an `ENEEDAUTH` error from npm.

The release process is triggered automatically when commits are merged to the main branch. The workflow uses semantic-release to automate version bumping, changelog generation, and npm package publishing. With three packages to publish (`hzl-core`, `hzl-web`, `hzl-cli`), all configured with `provenance: true` for supply chain security, the workflow suddenly lost its authentication credentials when executed.

## Root Cause Analysis

The issue originated in how environment variables were being passed through the execution context when the workflow changed from npm to pnpm.

When semantic-release publishes to npm with `provenance: true` enabled, the `@semantic-release/npm` plugin creates a temporary `.npmrc` configuration file containing authentication details. This temporary file is passed to the `npm publish` command via the `--userconfig` flag. The `NPM_TOKEN` environment variable must be accessible to npm during this process for authentication to succeed.

The original workflow used:
```bash
pnpm exec semantic-release
```

When `pnpm exec` invokes a command, it runs the command within pnpm's execution context but doesn't necessarily guarantee that environment variables are properly inherited by child processes, particularly when those child processes (npm) try to read environment variables through temporary configuration files.

Evidence from the failure logs showed:
- `npm publish ... --userconfig /tmp/31409c5def29e84557f7e49d87ccc6f1/.npmrc`
- `npm error code ENEEDAUTH`
- `npm error need auth This command requires you to be logged in`

The problem occurred specifically with pnpm workspaces because pnpm's execution environment differs from npm's in how it manages environment variable inheritance across process boundaries.

## Solution

Change the release command in `.github/workflows/release.yml` from `pnpm exec semantic-release` to `npx semantic-release`:

**Before:**
```bash
pnpm exec semantic-release 2>&1 | tee release-output.txt
```

**After:**
```bash
npx semantic-release 2>&1 | tee release-output.txt
```

The complete updated release step in the workflow:

```yaml
- name: Release
  id: release
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
  run: |
    # Capture semantic-release output to detect if a new release was made
    # Use npx instead of pnpm exec to ensure NPM_TOKEN is properly passed
    # to the @semantic-release/npm plugin's temp .npmrc for provenance
    npx semantic-release 2>&1 | tee release-output.txt

    # Check if a new version was published
    if grep -q "Published release" release-output.txt; then
      # Extract version from the release output
      VERSION=$(grep "Published release" release-output.txt | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
      echo "new_release=true" >> $GITHUB_OUTPUT
      echo "version=$VERSION" >> $GITHUB_OUTPUT
      echo "New release published: $VERSION"
    else
      echo "new_release=false" >> $GITHUB_OUTPUT
      echo "No new release published"
    fi
```

## Why This Works

Using `npx semantic-release` instead of `pnpm exec semantic-release` solves the environment variable inheritance issue for several reasons:

1. **Direct Process Execution**: `npx` bypasses pnpm's execution wrapper and launches semantic-release as a direct child process of the shell. This ensures environment variables like `NPM_TOKEN` and `NODE_AUTH_TOKEN` are inherited directly without pnpm's intermediate context.

2. **Standard npm Tooling Chain**: semantic-release internally uses `npm publish` to publish packages to the registry. Since `npx` is part of the npm ecosystem and designed to run npm-based tools, it maintains the standard environment variable chain that npm expects.

3. **Provenance Support**: The `@semantic-release/npm` plugin with `provenance: true` creates temporary `.npmrc` files. When npm is invoked as a subprocess of `npx`'s chain, it correctly receives and reads the `NPM_TOKEN` environment variable, allowing proper authentication to succeed.

4. **Backward Compatibility**: The npm-based release workflow that existed before the pnpm migration already used `npx` for semantic-release and worked correctly. This solution returns to that proven execution path.

5. **No Breaking Changes**: Using `npx` doesn't change any behavior of semantic-release itself, the semantic-release configuration, or the packages being published. It only changes how the tool is invoked, eliminating the intermediate pnpm execution layer that was disrupting environment variable inheritance.

## Prevention & Best Practices

### Testing CI Changes Before Merging

Before pushing CI/CD authentication changes to main, validate in a feature branch:

1. **Dry-run releases locally**: Run semantic-release with `--dry-run` to preview what will happen without actually publishing:
   ```bash
   NPM_TOKEN=your_test_token npx semantic-release --dry-run
   ```

2. **Test environment variables are passed correctly**: Create a minimal test script that echoes environment variables:
   ```bash
   export NPM_TOKEN="test_token_12345"
   echo "Direct access: $NPM_TOKEN"
   npx -c 'echo "In npx subprocess: $NPM_TOKEN"'
   pnpm exec -c 'echo "In pnpm subprocess: $NPM_TOKEN"'
   ```

3. **Simulate in a feature branch on GitHub**: Push CI/CD changes to a feature branch and run the full CI pipeline (not release, just the CI job).

### Environment Variable Considerations When Switching Package Managers

When you switch from npm to pnpm, be aware of how environment variables flow:

- **`npx semantic-release`**: Runs as a direct child of the shell. Environment variables are inherited directly.
- **`pnpm exec semantic-release`**: Runs through pnpm's process wrapper. Environment variables may not reach the subprocess.

Set all three token variables in your release step for maximum compatibility:

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
  NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Warning Signs: Auth Issues vs Other Problems

**Authentication issue symptoms:**
- Release workflow completes build and tests successfully but fails only at the publish step
- Error message includes "401 Unauthorized", "403 Forbidden", or "ENEEDAUTH"
- Error originates from `@semantic-release/npm` plugin
- Workflow succeeds when run locally but fails in GitHub Actions

**Non-auth issue symptoms:**
- Build fails (`pnpm build` error)
- Tests fail (`pnpm test:ci` error)
- TypeScript compilation fails
- These failures happen before reaching the release step

## Related Documentation

- [pnpm Migration Design](/docs/plans/2026-02-02-pnpm-migration-design.md) - Migration plan and rationale
- [AGENTS.md](/AGENTS.md) - Commits and Releases section with Conventional Commits rules
- [.releaserc.json](/.releaserc.json) - Semantic-release configuration
- [.github/workflows/release.yml](/.github/workflows/release.yml) - Release workflow implementation
