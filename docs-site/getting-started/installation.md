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
hzl project create install-check
hzl task add "Install check" -P install-check
hzl task list -P install-check
```

## Optional: Cloud Sync with Turso

By default, HZL runs local-first with SQLite on your machine. If you want optional cloud backup/multi-machine sync, configure Turso:

```bash
# Initialize (or update) HZL with Turso sync
hzl init --sync-url libsql://<db>.turso.io --auth-token <token>

# Verify sync config
hzl status

# Trigger manual sync
hzl sync
```

For full setup details, see [Cloud Sync](/concepts/cloud-sync).

## Notes

- HZL stores durable task data in SQLite.
- One installation supports multiple projects and agents.

## Next

- [OpenClaw Setup (TBD)](./openclaw)
- [Quickstart](./quickstart)
