# One-Liner Install Script Design

## Overview

A single curl command that installs HZL and sets up agent integrations:

```bash
curl -fsSL "https://raw.githubusercontent.com/tmchow/hzl/main/scripts/install.sh?$(date +%s)" | bash
```

The `?$(date +%s)` suffix busts CDN cache to ensure users always get the latest script.

## Goals

1. **Convenience for new users** — "I want to try HZL" → get everything running in 30 seconds
2. **Safe by default** — Don't modify user files (AGENTS.md), just provide guidance
3. **Graceful degradation** — Core install succeeds even if optional integrations can't be set up

## What It Does

| Step | Action | Failure behavior |
|------|--------|------------------|
| 1 | Check Node.js 22.14+ | Exit with install instructions |
| 2 | `npm install -g hzl-cli` | Exit on failure |
| 3 | `hzl init` | Exit on failure |
| 4 | Install Claude Code plugin (if `claude` CLI exists) | Warn and continue |
| 5 | Install Codex skill (if `~/.codex/` exists) | Warn and continue |
| 6 | Output AGENTS.md snippet inline + link | Always |

Steps 4-5 are optional — if the user doesn't have Claude Code or Codex, the script still succeeds with a helpful message about re-running later.

## Commands

### Install

```bash
curl -fsSL "https://raw.githubusercontent.com/tmchow/hzl/main/scripts/install.sh?$(date +%s)" | bash
```

### Uninstall

```bash
curl -fsSL "https://raw.githubusercontent.com/tmchow/hzl/main/scripts/install.sh?$(date +%s)" | bash -s -- --uninstall
```

## Installation Details

### Prerequisites Check

The script checks for Node.js 22.14+. If not found, it exits with clear instructions:

```
✗ Node.js 22.14+ required (found: 18.x)
  Install via: https://nodejs.org or 'brew install node'
```

### Claude Code Plugin

Uses the `claude` CLI to install the plugin at user level:

```bash
claude plugin marketplace add tmchow/hzl
claude plugin install hzl@hzl  # defaults to --scope user
```

If the `claude` command is not found:

```
⚠ Claude Code CLI not found, skipping plugin install
  → After installing Claude Code, re-run this script to add the plugin
```

### Codex Skill

Downloads the skill file to `~/.codex/skills/hzl/SKILL.md`:

```bash
mkdir -p ~/.codex/skills/hzl
curl -fsSL "$SKILL_URL" -o ~/.codex/skills/hzl/SKILL.md
```

If `~/.codex/` doesn't exist:

```
⚠ Codex not detected (~/.codex/ not found), skipping skill install
  → After installing Codex, re-run this script to add the skill
```

### AGENTS.md Snippet

The script outputs the snippet inline (since it's short) plus a link to the source:

```
════════════════════════════════════════════════════════════════
Add this to your AGENTS.md, CLAUDE.md, or GEMINI.md:
════════════════════════════════════════════════════════════════

### HZL task ledger

This project uses HZL for external task tracking.

**IMPORTANT - Task tracking:** When starting work that is multi-step...
[full snippet]

════════════════════════════════════════════════════════════════
Source: https://raw.githubusercontent.com/tmchow/hzl/main/snippets/AGENT-POLICY.md
```

We intentionally do NOT inject this into files — too risky to stomp existing content.

## Uninstall Details

| Step | Action |
|------|--------|
| 1 | `npm uninstall -g hzl-cli` |
| 2 | `claude plugin uninstall hzl@hzl` (if `claude` CLI exists) |
| 3 | `claude plugin marketplace remove hzl` (if exists) |
| 4 | `rm -rf ~/.codex/skills/hzl/` (if exists) |
| 5 | Output database preservation message |

### Database Preservation

The database is **not** deleted on uninstall. Output:

```
✓ Uninstalled hzl-cli
✓ Removed Claude Code plugin
✓ Removed Codex skill

Your HZL database was preserved at ~/.local/share/hzl/
  - To remove it: rm -rf ~/.local/share/hzl/
  - Reinstalling HZL can reuse this database
```

## CLI Output

### Colors (ANSI, no dependencies)

```bash
GREEN='\033[0;32m'   # Success messages
YELLOW='\033[1;33m'  # Warnings
RED='\033[0;31m'     # Errors
BLUE='\033[0;34m'    # Info/headers
BOLD='\033[1m'
NC='\033[0m'         # Reset
```

### Sample Successful Install

```
╔════════════════════════════════════════╗
║           HZL Installer                ║
╚════════════════════════════════════════╝

[hzl] Checking prerequisites...
✓ Node.js v22.14.0

[hzl] Installing hzl-cli...
✓ Installed hzl-cli v1.25.2

[hzl] Initializing database...
✓ Database created at ~/.local/share/hzl/

[hzl] Installing Claude Code plugin...
✓ Installed hzl@hzl plugin

[hzl] Installing Codex skill...
✓ Installed skill to ~/.codex/skills/hzl/

════════════════════════════════════════════════════════════════
Add this to your AGENTS.md, CLAUDE.md, or GEMINI.md:
════════════════════════════════════════════════════════════════

[snippet content]

════════════════════════════════════════════════════════════════
Source: https://raw.githubusercontent.com/tmchow/hzl/main/snippets/AGENT-POLICY.md

Done! Run 'hzl --help' to get started.
```

## Script Structure

```bash
#!/usr/bin/env bash
set -euo pipefail

# --- Constants ---
VERSION="1.0.0"
SKILL_URL="https://raw.githubusercontent.com/tmchow/hzl/main/skills/hzl/SKILL.md"
SNIPPET_URL="https://raw.githubusercontent.com/tmchow/hzl/main/snippets/AGENT-POLICY.md"
MIN_NODE_VERSION="22.14.0"

# --- Colors ---
# ... ANSI codes ...

# --- Utility functions ---
log_info(), log_success(), log_warn(), log_error(), die()
version_gte()  # Compare semver
download_with_retry()

# --- Core functions ---
check_prerequisites()   # Node.js version check
install_hzl_cli()       # npm install
init_database()         # hzl init
install_claude_plugin() # claude CLI commands
install_codex_skill()   # Download SKILL.md
print_agents_snippet()  # Output the snippet
do_uninstall()          # Reverse all steps

# --- Main ---
main() {
    parse_args "$@"
    print_banner

    if [[ "$UNINSTALL" == "true" ]]; then
        do_uninstall
    else
        check_prerequisites
        install_hzl_cli
        init_database
        install_claude_plugin
        install_codex_skill
        print_agents_snippet
        print_success
    fi
}

main "$@"
```

## Key Properties

- **Idempotent** — Safe to re-run (updates or no-ops)
- **No external dependencies** — Just bash, curl, npm
- **Retry logic** — Downloads retry 3 times with 2s delay
- **Graceful degradation** — Optional integrations skip cleanly

## Location

`scripts/install.sh`

## Documentation Updates

When this ships, update:
- `README.md` — Add one-liner to Quickstart section
- `snippets/CODING-AGENT-SETUP.md` — Add one-liner option

## Maintenance

### Node.js Version Sync

The `MIN_NODE_VERSION` in the script must be kept in sync manually. When changing the minimum Node.js version:

1. Update `package.json` engines.node
2. Update `scripts/install.sh` MIN_NODE_VERSION

This is documented in AGENTS.md.
