# Config File Design

## Overview

Add a persistent config file (`~/.hzl/config.json`) so that `hzl init --db /custom/path` remembers the database location for subsequent commands.

## Problem

Currently, if a user initializes a database at a custom path with `hzl init --db ~/custom.db`, subsequent commands like `hzl list` don't know about it. The user must either:
- Pass `--db ~/custom.db` on every command
- Set `export HZL_DB=~/custom.db` in their shell profile

This is a usability gap—if someone inits at a custom path, they expect subsequent commands to "just work."

## Design

### Config File Location

`~/.hzl/config.json`

This keeps all hzl state in one directory. If `~/.hzl/` is unavailable, users can set `HZL_CONFIG` env var as an escape hatch.

### Config File Format

```json
{
  "db": "~/.hzl/data.db"
}
```

Simple JSON. The `db` key stores the database path. Additional keys can be added in the future for other preferences.

### Database Path Resolution Order

1. `--db` flag (highest priority, per-command override)
2. `HZL_DB` env var (session/profile override)
3. `db` in `~/.hzl/config.json` (persistent user preference)
4. `~/.hzl/data.db` (default)

### `hzl init` Behavior

`hzl init` always writes the config file after creating the database:

| Config exists? | Path matches? | Result |
|----------------|---------------|--------|
| No | - | Proceed, create config |
| Yes | Same path | Proceed (idempotent re-init) |
| Yes | Different path | Error, require `--force` |

Error message when config points to different path:
```
Config already exists pointing to ~/work-tasks.db
Use --force to reinitialize with a different database
```

### New Command: `hzl config`

Read-only command that shows current config values and their source:

```
db: ~/custom.db (from config)
```

or

```
db: /override/path.db (from --db flag)
```

Helpful for debugging "why is hzl looking at the wrong database" without adding set/get complexity.

### New Flag: `--force` on `hzl init`

Overwrites existing config when it points to a different path. Required to prevent accidental database switches.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Config file is invalid JSON | Error: "Config file at ~/.hzl/config.json is invalid JSON" |
| Config file isn't writable during `hzl init --db` | Error: "Cannot write config file - your database preference won't persist" |
| `~/.hzl/` directory doesn't exist | Create it; if creation fails, error |
| Config db path doesn't exist (non-init commands) | Existing "database not found" error |

Principle: **If the user asked for something explicitly and we can't do it, fail loudly.** Silent fallbacks hide problems.

## Implementation Scope

1. **New file: `~/.hzl/config.json`**
   - JSON format, starts with just `db` key
   - Created/updated by `hzl init`

2. **Modified: `hzl init`**
   - Always writes config file after creating database
   - Check for existing config pointing to different path
   - Add `--force` flag to override

3. **Modified: Database path resolution** (in `resolveDbPath`)
   - New order: `--db` → `HZL_DB` → config file → default
   - Read config file, parse JSON, extract `db` key

4. **New command: `hzl config`**
   - Shows current config values and their source
   - Read-only, no arguments

5. **Environment variable: `HZL_CONFIG`**
   - Override config file location (escape hatch)
