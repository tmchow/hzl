# HZL

HZL is a lightweight task coordination system for AI agent swarms. It provides an event-sourced core with SQLite storage and a CLI for day-to-day task management.

## Packages

- `hzl-core`: Business logic, event store, projections, and services.
- `hzl-cli`: CLI wrapper for `hzl-core`.

## Quick Start

```bash
npm install
npm run build

# Initialize a database
node packages/hzl-cli/dist/cli.js init
```

## CLI Examples

```bash
# Create a task
hzl add inbox "Implement auth" --priority 2 --tags backend,auth

# List tasks
hzl list --project inbox

# Claim next available
hzl claim-next inbox --author agent-1
```
