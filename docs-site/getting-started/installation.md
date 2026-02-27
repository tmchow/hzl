---
layout: doc
title: Installation
parent: Getting Started
nav_order: 1
---

# Installation

Install HZL once per machine.

## Option A: npm

```bash
npm install -g hzl-cli
hzl init
```

## Option B: Homebrew (macOS/Linux)

```bash
brew tap tmchow/hzl
brew install hzl
hzl init
```

## Verify

```bash
hzl --version
hzl task list
```

## Optional: Cloud Sync with Turso

By default, HZL runs local-first with SQLite on your machine. If you want optional cloud backup/multi-machine sync, configure Turso:

```bash
hzl init --sync-url libsql://<db>.turso.io --auth-token <token>
hzl status
hzl sync
```

For full setup details, see [Cloud Sync](/concepts/cloud-sync).

## Uninstall HZL

HZL uninstall is intentionally narrow:

1. Remove the binary using your package manager.
2. Optionally remove HZL data/config directories.

Typical default locations:
- Data: `$XDG_DATA_HOME/hzl` (or `~/.local/share/hzl`)
- Config: `$XDG_CONFIG_HOME/hzl` (or `~/.config/hzl`)

In repository dev mode, HZL uses local `.local/hzl` and `.config/hzl` paths.

OpenClaw integration artifacts (cron entries, HEARTBEAT edits, gateway config) are not removed by uninstalling HZL; follow the teardown checklist in [OpenClaw Setup](./openclaw).

## Next

- [OpenClaw Setup](./openclaw)
- [Quickstart](./quickstart)
