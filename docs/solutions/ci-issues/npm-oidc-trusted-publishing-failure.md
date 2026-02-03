---
title: Fix npm OIDC Trusted Publishing failure in GitHub Actions
date: 2026-02-03
tags: [npm, oidc, github-actions, ci, semantic-release, trusted-publishing]
category: ci-issues
module: release-workflow
symptoms:
  - npm error code ENEEDAUTH despite OIDC token exchange succeeding
  - semantic-release fails during npm publish with authentication error
  - npm publish works locally but fails in GitHub Actions with OIDC
related_issues: []
---

# Fix npm OIDC Trusted Publishing failure in GitHub Actions

## Problem Description

After migrating from npm to pnpm workspaces and attempting to use npm's OIDC Trusted Publishing feature, the automated release workflow failed with an `ENEEDAUTH` error. The OIDC token exchange appeared to succeed (no errors in the token exchange phase), but npm publish still failed with authentication errors.

OIDC Trusted Publishing is npm's recommended approach for CI/CD authentication because it eliminates the need to store long-lived `NPM_TOKEN` secrets. Instead, it uses short-lived tokens issued through OpenID Connect identity verification.

## Root Cause Analysis

Two separate issues were discovered that both needed to be fixed:

### Issue 1: `actions/setup-node` with `registry-url` sets `NODE_AUTH_TOKEN`

When you configure `actions/setup-node` with `registry-url: 'https://registry.npmjs.org'`, the action automatically sets `NODE_AUTH_TOKEN` at the workflow level. This happens even if you don't explicitly pass a token value.

**The problem**: npm's OIDC Trusted Publishing only activates as a fallback when NO authentication environment variables are set. Even an empty string value for `NODE_AUTH_TOKEN` counts as "set" and prevents npm from falling back to OIDC authentication.

```yaml
# This configuration PREVENTS OIDC from working:
- uses: actions/setup-node@v6
  with:
    node-version: '22.14.0'
    registry-url: 'https://registry.npmjs.org'  # <- Sets NODE_AUTH_TOKEN
```

### Issue 2: npm CLI version requirement

Node 22.14.0 ships with npm 10.9.2, but **OIDC Trusted Publishing requires npm 11.5.1 or later**.

The OIDC support was added in npm 11.5.1. Earlier versions simply don't have the code to perform OIDC token exchange, so they fail with authentication errors even when all other prerequisites are met.

## Investigation Steps That Didn't Work

During troubleshooting, several approaches were attempted that did NOT solve the problem:

1. **Removing `NPM_TOKEN` and `NODE_AUTH_TOKEN` from env vars**: Didn't work because `registry-url` in `setup-node` still sets `NODE_AUTH_TOKEN` automatically.

2. **Setting token env vars to empty string (`''`)**: Didn't work because npm treats an empty string as "set", which still prevents OIDC fallback.

3. **Using `unset` in shell script**: Didn't work because workflow-level environment variables set by `setup-node` cannot be unset from a subshell.

```bash
# This does NOT work - workflow env vars persist
unset NODE_AUTH_TOKEN
unset NPM_TOKEN
npm publish  # Still fails because workflow-level vars are restored
```

## Solution

Two changes are required to make OIDC Trusted Publishing work:

### Step 1: Remove `registry-url` from `actions/setup-node`

This prevents `NODE_AUTH_TOKEN` from being automatically set:

**Before:**
```yaml
- uses: actions/setup-node@v6
  with:
    node-version: '22.14.0'
    registry-url: 'https://registry.npmjs.org'
    cache: 'pnpm'
```

**After:**
```yaml
- uses: actions/setup-node@v6
  with:
    node-version: '22.14.0'
    # No registry-url: it sets NODE_AUTH_TOKEN which prevents OIDC fallback
    cache: 'pnpm'
```

### Step 2: Upgrade npm to 11.5.1+

Add a step to upgrade npm before the release step:

```yaml
# OIDC Trusted Publishing requires npm 11.5.1+
- name: Upgrade npm for OIDC
  run: npm install -g npm@latest
```

### Complete Working Configuration

```yaml
name: Release

permissions:
  contents: write
  issues: write
  pull-requests: write
  id-token: write  # Required for OIDC token exchange

jobs:
  release:
    runs-on: ubuntu-latest
    environment: release  # Must match Trusted Publisher config on npmjs.com
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v6
        with:
          node-version: '22.14.0'
          # No registry-url: it sets NODE_AUTH_TOKEN which prevents OIDC fallback
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test:ci

      # OIDC Trusted Publishing requires npm 11.5.1+
      - name: Upgrade npm for OIDC
        run: npm install -g npm@latest

      - name: Release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # No NPM_TOKEN: using OIDC Trusted Publishing (id-token: write + npm config)
        run: |
          npx semantic-release 2>&1 | tee release-output.txt
```

## Prerequisites for OIDC Trusted Publishing

All of the following must be configured for OIDC to work:

### GitHub Actions Workflow

1. **`id-token: write` permission** in the workflow's permissions block
2. **`environment: release`** (or your chosen environment name) in the job
3. **NO `NODE_AUTH_TOKEN` or `NPM_TOKEN`** environment variables set (must be completely unset, not empty)
4. **npm CLI 11.5.1+** installed (Node 24+ has this by default, Node 22 needs manual upgrade)

### npmjs.com Package Configuration

For each package you want to publish, configure a Trusted Publisher:

1. Go to `https://www.npmjs.com/package/YOUR_PACKAGE/access`
2. Under "Publishing access", click "Add a new trusted publisher"
3. Configure with exact values:
   - **Owner**: Your GitHub username or organization (e.g., `tmchow`)
   - **Repository**: Repository name without owner prefix (e.g., `hzl`)
   - **Workflow filename**: Just the filename (e.g., `release.yml`)
   - **Environment**: Must match the `environment:` value in your workflow (e.g., `release`)

**Important**: Each package in a monorepo needs its own Trusted Publisher configuration. For a repo with `hzl-core`, `hzl-cli`, and `hzl-web` packages, you need to configure Trusted Publishers on all three npm packages.

## Why This Works

### Why removing `registry-url` is necessary

The `actions/setup-node` action with `registry-url` creates a `.npmrc` file and sets `NODE_AUTH_TOKEN`. This is designed for token-based authentication. When npm sees `NODE_AUTH_TOKEN` set (even to an empty value), it tries to use that token instead of falling back to OIDC.

By removing `registry-url`, we prevent any authentication environment variables from being set, which allows npm to use OIDC as its authentication method.

### Why npm 11.5.1+ is required

OIDC Trusted Publishing support was added to npm in version 11.5.1 (released late 2025). The feature requires:
- Code to detect when OIDC should be used (no tokens set, `id-token: write` permission present)
- Code to perform the OIDC token exchange with GitHub's identity provider
- Code to use the exchanged token for npm registry authentication

Earlier npm versions simply don't have this functionality, so they fail with `ENEEDAUTH` because they have no authentication method available.

### Node.js and npm version mapping

| Node.js Version | Bundled npm Version | OIDC Support |
|-----------------|---------------------|--------------|
| Node 22.14.0    | npm 10.9.2          | No - needs upgrade |
| Node 24+        | npm 11.5.1+         | Yes |

## Debugging OIDC Issues

If OIDC publishing still fails after applying these fixes, check:

### 1. Verify no auth env vars are set

Add a debug step before publish:

```yaml
- name: Debug auth state
  run: |
    echo "NODE_AUTH_TOKEN set: ${NODE_AUTH_TOKEN:+yes}"
    echo "NPM_TOKEN set: ${NPM_TOKEN:+yes}"
    echo "npm version: $(npm --version)"
    cat ~/.npmrc 2>/dev/null || echo "No .npmrc file"
```

### 2. Verify npm version

```yaml
- name: Check npm version
  run: |
    NPM_VERSION=$(npm --version)
    echo "npm version: $NPM_VERSION"
    # npm 11.5.1+ required for OIDC
    if [[ "$(printf '%s\n' "11.5.1" "$NPM_VERSION" | sort -V | head -n1)" != "11.5.1" ]]; then
      echo "::error::npm $NPM_VERSION does not support OIDC. Need 11.5.1+"
      exit 1
    fi
```

### 3. Check Trusted Publisher configuration

Verify on npmjs.com that:
- The owner matches your GitHub username/org exactly (case-sensitive)
- The repository name matches exactly (without owner prefix)
- The workflow filename matches exactly (just filename, not path)
- The environment matches your workflow's `environment:` value exactly

### 4. Check GitHub Actions logs

Look for OIDC-related messages in the npm publish output:
- "Attempting to authenticate via OIDC" indicates OIDC is being tried
- "OIDC token exchange successful" indicates token was received
- If you see neither, npm isn't attempting OIDC (check env vars and npm version)

## Prevention & Best Practices

### Use Node 24+ when available

Node 24 ships with npm 11.5.1+ by default, eliminating the need for the npm upgrade step. Once Node 24 is your project's minimum version, you can remove the upgrade step.

### Test OIDC configuration before relying on it

Before removing your `NPM_TOKEN` secret and switching to OIDC:
1. Set up Trusted Publishers on all packages
2. Keep `NPM_TOKEN` as a backup
3. Test a release with OIDC
4. Only after successful OIDC publish, remove the token fallback

### Document the npm version requirement

Add a comment in your workflow explaining the npm version requirement:

```yaml
# OIDC Trusted Publishing requires npm 11.5.1+
# Node 22.x ships with npm 10.x, so we upgrade
# This step can be removed when we move to Node 24+
- name: Upgrade npm for OIDC
  run: npm install -g npm@latest
```

## Related Documentation

- [npm Trusted Publishing docs](https://docs.npmjs.com/generating-provenance-statements#publishing-packages-with-provenance-via-github-actions)
- [GitHub OIDC for package registries](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [actions/setup-node registry-url behavior](https://github.com/actions/setup-node#usage)
- [Previous solution: npm publish auth failure](/docs/solutions/ci-issues/npm-publish-auth-failure-pnpm-migration.md) - Earlier token-based solution before OIDC migration
- [.github/workflows/release.yml](/.github/workflows/release.yml) - Current release workflow with OIDC
