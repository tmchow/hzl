---
layout: doc
title: Installation & OpenClaw Setup
parent: Getting Started
nav_order: 1
---

# Installation & OpenClaw Setup

This is the primary setup path for OpenClaw deployments.

HZL integrates with OpenClaw at three points: project pools (routing work to the right agent), HEARTBEAT (picking up work at session start), and completion hooks (notifying OpenClaw when a task finishes).
Tier 1 installs the CLI and local state.
Tier 2 wires up each integration point.

## Quick start for OpenClaw users

Paste this into your OpenClaw instance to begin:

```md
Read https://www.hzl-tasks.com/getting-started/installation and follow the setup instructions.
Check your existing config to discover agent roster, gateway URL, and scheduling capability before asking me anything.
Confirm your findings with me in one message before making any changes.
```

## Tier 1: Mechanical setup (same for everyone)

Install HZL once per machine.

### Option A: npm

```bash
npm install -g hzl-cli
hzl init
```

### Option B: Homebrew (macOS/Linux)

```bash
brew tap tmchow/hzl
brew install hzl
hzl init
```

Verify:

```bash
hzl --version
hzl task list
```

`hzl init` is non-interactive in normal use and creates required local data files. It only prompts when you run destructive reset flags (for example `--force` without `--yes`).

## Tier 2: OpenClaw integration (instance-specific)

## 1) For agents: discover, then confirm

Why: OpenClaw deployments are parameterized by your agent IDs, gateway config, and scheduler capabilities.

Before asking the operator anything, check what you already know:
- Agent roster: read `AGENTS.md`, `TOOLS.md`, and `openclaw.json`.
- Gateway URL/token: check `TOOLS.md` and `openclaw.json`.
- Scheduling capability: check whether you have cron tool access.

Example confirmation message (adapt to your actual findings) before making changes:

```md
Here's what I found:
- Agents: henry (main), clara (writing), kenji (research)
- Suggested projects: writing, research
- Gateway: http://127.0.0.1:18789
- Hook drain: I'll create a cron job every 2 minutes

Does this look right before I proceed?
```

Only ask the operator for a value if it is genuinely missing from config/state.

## 2) Choose project routing model

Why: tasks routed to a project pool (instead of a specific agent) can be claimed by any agent monitoring that pool.

### Small/simple setup

Use one shared queue plus tags:

```bash
hzl project create openclaw
```

### Role-based multi-agent setup

Use project pools by role:

```bash
hzl project create research
hzl project create writing
hzl project create coding
hzl project create marketing
```

Pool routing rule:
- Create tasks in the target project without `--agent`.
- Any matching agent can claim with `task claim --next -P <project> --agent <id>`.

## 3) Add session-start polling in each agent HEARTBEAT

Why: this ensures each agent checks pending work at session start before doing anything else.

Wrap with markers so teardown is easy later:

```md
<!-- hzl:start -->
## Task Poll
Run: hzl workflow run start --agent <agent-id> --project <project>
Output is JSON by default (`--format json`).
If a task is returned, work on it before continuing the rest of this heartbeat.
If no task is returned, continue normally.
<!-- hzl:end -->
```

Use each agent's exact identity string.

## 4) Hook delivery (configure endpoint + schedule drain)

Why: when a task completes, HZL queues a callback to your OpenClaw gateway; `hzl hook drain` delivers queued callbacks. Without a scheduler running drain, callbacks accumulate but never fire.

Hook config is global at launch (`hooks.on_done`).

Edit your HZL config file directly (there is no `hzl config set` command).
Create the file if missing, then add:

```json
{
  "hooks": {
    "on_done": {
      "url": "<OPENCLAW_GATEWAY_URL>/events/inject",
      "headers": {
        "Authorization": "Bearer <YOUR_GATEWAY_TOKEN>"
      }
    }
  }
}
```

Default config path is typically `~/.config/hzl/config.json` (or `$XDG_CONFIG_HOME/hzl/config.json`).
HZL uses a host-process model (no required daemon). Your runtime must schedule drain runs.

Recommended cadence: every 1-5 minutes (2 minutes is a good default).

OpenClaw-specific guidance:
- Use OpenClaw's cron tool to create a recurring job that runs `hzl hook drain` every 2 minutes.
- If you cannot access cron tooling, ask the operator to add this scheduler entry.

Command:

```bash
hzl hook drain
```

If no scheduler exists, hooks remain queued until you run `hzl hook drain` manually.

## 5) Verify end-to-end

Version note:
- `workflow run` commands require a recent HZL build that includes workflows.
- If `hzl workflow run start` is unavailable, upgrade HZL first.
- Temporary fallback for verification only: use `hzl task claim --next -P <project> --agent <agent-id>`.

```bash
hzl task add "HZL setup verification" -P <project> -s ready
hzl workflow run start --agent <agent-id> --project <project>
hzl task complete <task-id>
hzl hook drain
```

Expected:
- `workflow run start` returns resumed/claimed task info.
- `hook drain` reports claimed/delivered/retried/failed counts.

## 6) Add per-agent TOOLS.md baseline (recommended during setup)

Why: each agent should know its own HZL identity, queue scope, and relevant commands without inferring full-system context.

Add an HZL section to each agent's `TOOLS.md` using the guidance in [Per-agent TOOLS.md guidance](#per-agent-tools-md-guidance).

## 7) Record what changed (required for clean teardown)

Add this to `TOOLS.md` or your runtime memory file:

```md
HZL integration (installed <date>):
- Scheduler job id/name for `hzl hook drain`: <id>
- Config keys changed: hooks.on_done
- HEARTBEAT files modified: <paths>
- Projects created: <list>
- Update preference: auto-update | notify-only | manual
- Update scheduler/job id (if any): <id>
```

## 8) Configure HZL update preference

Why: update behavior is an operator decision, not a silent default. Auto-updating a task ledger CLI can affect workflows (for example migrations or behavior changes).

Ask this during setup:

```md
How do you want to handle HZL updates?
1) Auto-update: check daily, update automatically, notify what changed
2) Notify only: check daily, notify when update is available, operator decides when to apply
3) Manual: no scheduled checks; operator handles updates directly
```

Discover which package manager was used in Tier 1 (`npm` or `brew`), confirm the option with the operator, then configure accordingly.

OpenClaw note:
- If you already have an update-automation workflow in OpenClaw, add HZL to that existing update watch list instead of creating a separate cron job.
- Consolidated update checks are preferred over one-cron-per-tool.

### Option A: Auto-update

Daily behavior:
- `npm`: run `npm update -g hzl-cli`
- `brew`: run `brew upgrade hzl`
- Notify operator with previous version -> new version after update.

Cron example (daily at 09:00 local time):

```txt
0 9 * * * npm update -g hzl-cli && hzl --version
```

```txt
0 9 * * * brew upgrade hzl && hzl --version
```

### Option B: Notify only (recommended default)

Daily behavior:
- `npm`: run `npm outdated -g hzl-cli`
- `brew`: run `brew outdated hzl`
- If outdated, notify operator and wait for explicit approval to update.

Cron example (daily at 09:00 local time):

```txt
0 9 * * * npm outdated -g hzl-cli
```

```txt
0 9 * * * brew outdated hzl
```

### Option C: Manual

No scheduled update checks. Operator updates intentionally when ready.

Cron configuration:
- none

## Ongoing maintenance (after initial setup)

Use this section after you are already up and running.

## Per-agent TOOLS.md guidance

After setup, add an HZL section to each agent's `TOOLS.md`.
Each agent should know its own identity, project scope, and commands relevant to the work it actually does.

### Every agent gets

```md
## HZL

Identity: <agent-id>
Projects monitored: <project-name(s)>

Key commands:
- hzl task complete <id>
- hzl dep list --agent <self> --blocking-only
```

`workflow run start` already lives in HEARTBEAT, so it does not need to be duplicated in `TOOLS.md`.

### Any agent that creates or delegates work also gets

```md
- hzl task add "<title>" --project <pool>
- hzl workflow run handoff --from <id> --title "<t>" --project <pool>
- hzl workflow run delegate --from <id> --title "<t>" --project <pool>
- hzl dep list --from-agent <self> --blocking-only
```

### Main agent additionally gets

```md
## HZL — System Map

Projects and owners:
- <project> -> <agent-id> (plus future agents in this role)

Agent identity strings:
- <name>: <agent-id>

System commands:
- hzl dep list --cross-project-only
- hzl hook drain
- hzl task list -P <project> -s ready
```

## New agent checklist

When adding a new agent later:
1. Add marker-wrapped Task Poll block to that agent's HEARTBEAT.
2. Decide which project pool(s) it monitors.
3. Add an HZL section to that agent's `TOOLS.md` with identity, projects, and relevant commands.
4. Update the main agent's HZL system map in its `TOOLS.md` to include the new agent and project ownership.
5. Record the change in your HZL integration notes.

## Teardown checklist (manual, reverse order)

1. Disable/remove scheduled `hzl hook drain`.
2. Remove marker-wrapped HZL blocks from HEARTBEAT files.
3. Remove or null `hooks.on_done` in config.
4. Optionally export/archive task data.
5. Optionally uninstall HZL binary and delete HZL data/config directories.

OpenClaw integration teardown is runtime/operator-owned, not automatic in HZL.

## Optional: Cloud sync with Turso

By default, HZL runs local-first with SQLite on your machine. If you want optional cloud backup/multi-machine sync, configure Turso:

```bash
hzl init --sync-url libsql://<db>.turso.io --auth-token <token>
hzl status
hzl sync
```

For full setup details, see [Cloud Sync](/concepts/cloud-sync).

## Uninstall HZL (CLI footprint only)

HZL uninstall is intentionally narrow:

1. Remove the binary using your package manager.
2. Optionally remove HZL data/config directories.

Typical default locations:
- Data: `$XDG_DATA_HOME/hzl` (or `~/.local/share/hzl`)
- Config: `$XDG_CONFIG_HOME/hzl` (or `~/.config/hzl`)

In repository dev mode, HZL uses local `.local/hzl` and `.config/hzl` paths.

## Next

- [Quickstart](./quickstart)
- [Workflows](../workflows/)
