---
layout: doc
title: OpenClaw
parent: Getting Started
nav_order: 4
---

# OpenClaw Setup

This guide is written to work for both humans and AI agents executing setup steps.

## Tier 1: Mechanical Setup (Same for everyone)

```bash
hzl --version
hzl init
hzl task list
```

## Tier 2: Instance Integration (Depends on your setup)

## 1) Introspect before editing anything

Identify:
1. Your agent identity string (the value you pass to `--agent`).
2. Agent roster and roles (single agent vs multi-agent).
3. Gateway URL/token for hook ingestion.
4. Whether you can schedule `hzl hook drain` (cron/systemd/OpenClaw scheduler).

If any value is unknown, stop and get that value before proceeding.

## 2) Choose project routing model

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

Wrap with markers so teardown is easy later:

```md
<!-- hzl:start -->
## Task Poll
hzl workflow run start --agent <agent-id> --project <project>
<!-- hzl:end -->
```

Use each agent's exact identity string.

## 4) Configure completion hook endpoint (global launch scope)

Hook config is global at launch (`hooks.on_done`).

Edit your HZL config file and add:

```json
{
  "hooks": {
    "on_done": {
      "url": "http://127.0.0.1:18789/events/inject",
      "headers": {
        "Authorization": "Bearer <YOUR_GATEWAY_TOKEN>"
      }
    }
  }
}
```

Default config path is typically `~/.config/hzl/config.json` (or `$XDG_CONFIG_HOME/hzl/config.json`).

## 5) Schedule hook delivery drain

HZL uses a host-process model (no required daemon). Your runtime must schedule drain runs.

Recommended cadence: every 1-5 minutes (2 minutes is a good default).

Command:

```bash
hzl hook drain
```

If no scheduler exists, hooks remain queued until you run `hzl hook drain` manually.

## 6) Verify end-to-end

```bash
hzl task add "HZL setup verification" -P <project> -s ready
hzl workflow run start --agent <agent-id> --project <project>
hzl task complete <task-id>
hzl hook drain
```

Expected:
- `workflow run start` returns resumed/claimed task info.
- `hook drain` reports claimed/delivered/retried/failed counts.

## 7) Record what changed (required for clean teardown)

Add this to `TOOLS.md` or your runtime memory file:

```md
HZL integration (installed <date>):
- Scheduler job id/name for `hzl hook drain`: <id>
- Config keys changed: hooks.on_done
- HEARTBEAT files modified: <paths>
- Projects created: <list>
```

## New Agent Checklist (ongoing maintenance)

When adding a new agent later:
1. Add marker-wrapped Task Poll block to that agent's HEARTBEAT.
2. Decide which project pool(s) it monitors.
3. Record the change in your HZL integration notes.

## Teardown Checklist (manual, reverse order)

1. Disable/remove scheduled `hzl hook drain`.
2. Remove marker-wrapped HZL blocks from HEARTBEAT files.
3. Remove or null `hooks.on_done` in config.
4. Optionally export/archive task data.
5. Optionally uninstall HZL binary and delete HZL data/config directories.

OpenClaw integration teardown is runtime/operator-owned, not automatic in HZL.
