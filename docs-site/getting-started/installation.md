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
Install the OpenClaw HZL skill by running: npx clawhub@latest install hzl
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

### Optional: Run the web dashboard as a service

HZL includes a web dashboard at `http://localhost:3456`. To run it persistently (survives reboots):

**Linux (systemd):**

```bash
mkdir -p ~/.config/systemd/user
hzl serve --print-systemd > ~/.config/systemd/user/hzl-web.service
systemctl --user daemon-reload
systemctl --user enable --now hzl-web
loginctl enable-linger $USER
```

Note on `--print-systemd` output: The generated service binds to `0.0.0.0:3456` by default. If you're exposing the dashboard via `tailscale serve` (recommended), change this to `--host 127.0.0.1` so the port isn't directly reachable over the network without TLS:

```
ExecStart=/path/to/hzl serve --port 3456 --host 127.0.0.1 --allow-framing
```

**macOS (background mode):**

```bash
hzl serve --background
```

Verify:

```bash
# Linux
systemctl --user status hzl-web

# macOS
hzl serve --status
```

The server binds to `0.0.0.0:3456` by default, making it accessible over the network (including Tailscale). Use `--port` to change the port and `--host 127.0.0.1` to restrict to localhost only.

### Expose over HTTPS on your tailnet (optional, tailnet-only)

If you use Tailscale, you can serve the dashboard over HTTPS within your tailnet without exposing it to the public internet. HTTPS also enables installing the dashboard as a PWA (progressive web app) for a native app experience.

```bash
tailscale serve --bg --https=3456 http://127.0.0.1:3456
```

Dashboard is then available at `https://<hostname>.<tailnet>.ts.net:3456`.

Check for port conflicts first — `tailscale serve status` shows what's already mapped. Port 3456 matches the backend port and is a reasonable default, but pick any free port.

`tailscale serve` = tailnet only. `tailscale funnel` = public internet. Use `serve`.

For full dashboard documentation, see [Web Dashboard](../dashboard).

## Tier 2: OpenClaw integration (instance-specific)

## 1) Install the OpenClaw HZL skill

Why: the OpenClaw skill gives agents HZL-specific operating guidance (workflow-first loop, recovery patterns, and command usage) directly in runtime context.

```bash
npx clawhub@latest install hzl
```

Run this once per OpenClaw workspace/environment where agents should use HZL.

## 2) For agents: discover, then confirm

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

## 2b) Check sandbox mode for each agent

Why: HZL uses the `exec` tool to run CLI commands. If an agent has sandbox mode enabled, `exec` runs in Docker, where the HZL binary and data directory are not present by default.

Check `openclaw.json` for:
- `agents.defaults.sandbox.mode`
- `agents.list[].sandbox.mode` per agent

If sandbox mode is absent or `off` for all agents, continue to step 3.

If any agent has `sandbox.mode: "all"` or `sandbox.mode: "non-main"`, add HZL bind mounts to that agent's sandbox config:

```json5
{
  "agents": {
    "list": [{
      "id": "<agent-id>",
      "sandbox": {
        "docker": {
          "binds": [
            "/home/<user>/.local/share/hzl:/home/<user>/.local/share/hzl:rw",
            "<hzl-binary-path>:/usr/local/bin/hzl:ro"
          ]
        }
      }
    }]
  }
}
```

Find values with:

```bash
whoami
which hzl
```

Apply changes via `config.patch`; do not hand-edit `openclaw.json`.

`non-main` mode note:
- `non-main` sandboxes all non-main sessions, including group/channel sessions (for example Discord or Telegram agents).
- If `agents.defaults.sandbox.mode` is `non-main`, sub-agents are sandboxed even without per-agent overrides.

## 3) Choose project routing model

Why: tasks routed to a project pool (instead of a specific agent) can be claimed by any agent monitoring that pool. See [Projects](/concepts/projects) for how project pools work.

Note: HZL creates a protected `inbox` project automatically on first init. It cannot be deleted. Use it for unrouted tasks, or skip it and create named pools directly.

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
- Any matching agent can claim with `hzl task claim --next -P <project> --agent <id>`.

### Exec-denied agents (resolve before HEARTBEAT wiring)

Check each agent's exec status during discovery and resolve before step 4.

`openclaw agents list` does not currently expose tool deny status ([openclaw#31510](https://github.com/openclaw/openclaw/issues/31510)). Until that ships, check directly:

```bash
python3 -c "
import json, os
path = os.path.expanduser('~/.openclaw/openclaw.json')
with open(path) as f:
    c = json.load(f)
for a in c.get('agents', {}).get('list', []):
    deny = a.get('tools', {}).get('deny', [])
    blocked = 'exec' in deny or 'group:runtime' in deny
    print(f'{a[\"id\"]}: exec_blocked={blocked}')
"
```

All agents should show `exec_blocked=False`. If any show `True`, that agent cannot run HZL commands and HEARTBEAT polling will silently do nothing.

Some agents deny `exec` in `tools.deny`. HZL depends on `exec` for CLI commands, so this is all-or-nothing at the tool level.

For each exec-denied agent, ask:

```md
Agent <id> has exec denied. HZL requires exec to run CLI commands. Two options:
1) Allow exec for this agent by removing exec from tools.deny.
2) Keep exec denied. This agent won't run HZL commands directly; another agent (for example the main agent) will manage tasks on its behalf with --agent <id>.

Which do you prefer?
```

Do not assume option 2. The deny rule may be inherited rather than deliberate.

If option 1 is chosen:
- Remove `exec` from that agent's `tools.deny` before adding the HEARTBEAT Task Poll block.

If deny is inherited from `group:runtime`, carve `exec` back out without re-enabling the full group:

```json5
"tools": {
  "deny": ["group:runtime"],
  "allow": ["exec"]
}
```

If option 2 is chosen:
- Skip the HEARTBEAT Task Poll block for that agent.
- Record it as `indirect participant - tasks managed by <main-agent-id>` in integration notes.

## 4) Add session-start polling in each agent HEARTBEAT

Why: this ensures each agent checks pending work at session start before doing anything else. See [Claiming & Leases](/concepts/claiming-leases) for how atomic claiming and lease expiry work.

HEARTBEAT.md is read at every session start — keep it minimal. Automation belongs here. Explanations of why the loop works belong in AGENTS.md (workspace orientation, read once). Command reference belongs in TOOLS.md (lookup during work).

Add the following block to each agent's HEARTBEAT.md, substituting that agent's identity and project pool. For multi-agent setups, repeat for every agent in the roster (skip any exec-denied agents handled via option 2 in step 3).

Wrap with markers so teardown is easy later:

```md
<!-- hzl:start -->
## Task Poll
Run: hzl workflow run start --agent <agent-id> --project <project> --lease 30
Output is JSON by default (`--format json`).
If `selected` is non-null, work on the returned task before continuing the rest of this heartbeat.
If `selected` is null, continue normally.
<!-- hzl:end -->
```

Use each agent's exact identity string.

`--lease 30` sets a 30-minute expiry on the claimed task. Without a lease, the task has no expiry and another agent can never reclaim it if this one crashes. Use `hzl task checkpoint` during work to extend the lease.

Output shapes for `workflow run start`:

No task available:
```json
{
  "workflow": "start",
  "mode": "none",
  "selected": null,
  "filters": { "project": "openclaw" },
  "in_progress_count": 0,
  "others_total": 0,
  "others": []
}
```

Task found and resumed:
```json
{
  "workflow": "start",
  "mode": "resume",
  "selected": {
    "task_id": "01KJPVNDGTFGJGXSCAXXEGMWZQ",
    "title": "...",
    "project": "openclaw",
    "status": "in_progress",
    "priority": 0,
    "agent": "henry",
    "lease_until": null
  },
  "filters": { "project": "openclaw" },
  "in_progress_count": 1,
  "others_total": 0,
  "others": []
}
```

Decision key: `selected` is `null` when nothing to do; non-null when a task was claimed or resumed. `mode` is `"none"` | `"resume"` | `"claim"`.

## 5) Hook delivery (configure endpoint + schedule drain)

Why: when a task completes, HZL queues a callback to your OpenClaw gateway; `hzl hook drain` delivers queued callbacks. Without a scheduler running drain, callbacks accumulate but never fire. See [Lifecycle Hooks](/concepts/lifecycle-hooks) for design rationale and [Hooks Reference](/reference/hooks) for payload format and delivery semantics.

Hook config is global at launch (`hooks.on_done`).

Edit your HZL config file directly (there is no `hzl config set` command).
Default config path is typically `~/.config/hzl/config.json` (or `$XDG_CONFIG_HOME/hzl/config.json`).
Create the file if missing, then add:

```json
{
  "hooks": {
    "on_done": {
      "url": "<OPENCLAW_GATEWAY_URL>/hooks/agent",
      "headers": {
        "Authorization": "Bearer <HOOKS_TOKEN>"
      },
      "body": {
        "message": "HZL task completed. Run: hzl workflow run start to resume work.",
        "agentId": "main",
        "deliver": false,
        "wakeMode": "now"
      }
    }
  }
}
```

Important details:
- The endpoint is `/hooks/agent`, not `/events/inject`.
- `<HOOKS_TOKEN>` is `hooks.token` from `openclaw.json` — this is a separate credential from the gateway auth token (`gateway.auth.token`).
- `deliver: false` prevents the agent's response from being broadcast to your messaging channel (Discord/Telegram/etc.) on every task completion.
- `agentId: "main"` routes to the primary agent; multi-agent setups should route by role.
- Accepted auth header formats: `Authorization: Bearer <token>` or `x-openclaw-token: <token>`.
- A successful call returns `202 {"ok": true, "runId": "<uuid>"}`.

### Verify hook connectivity before scheduling drain

Run a manual drain to confirm the endpoint and token are correct:

```bash
hzl hook drain
```

- If config is correct and queue is empty: prints delivery summary with 0 delivered.
- If endpoint is unreachable or token is wrong: prints a connection/auth error.

Do not set up the drain cron until this passes cleanly.

### Schedule drain runs

HZL uses a host-process model (no required daemon). Your runtime must schedule drain runs.

Recommended cadence: every 1-5 minutes (2 minutes is a good default).

OpenClaw-specific guidance — create a cron job with the complete config:

```json5
{
  "name": "hzl-hook-drain",
  "schedule": { "kind": "cron", "expr": "*/2 * * * *", "tz": "UTC" },
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "Run: hzl hook drain\nIf 0 hooks delivered, reply HEARTBEAT_OK. Otherwise summarize what was delivered.",
    "timeoutSeconds": 60
  },
  "delivery": { "mode": "none" }
}
```

- `sessionTarget: "isolated"` — the drain doesn't need session history; `"main"` would serialize it against all user messages.
- `delivery: {mode: "none"}` suppresses the post-run announcement. Without it, every drain posts a summary to your messaging channel every 2 minutes.

If you cannot access cron tooling, ask the operator to add this scheduler entry.

If no scheduler exists, hooks remain queued until you run `hzl hook drain` manually.

## 6) Verify end-to-end

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

## 7) Add per-agent TOOLS.md baseline (recommended during setup)

Why: each agent should know its own HZL identity, queue scope, sandbox expectation, and relevant commands without inferring full-system context.

Add an HZL section to each agent's `TOOLS.md` using the guidance in [Per-agent TOOLS.md guidance](#per-agent-tools-md-guidance).

## 7b) Optional: Add a shared HZL policy block to TOOLS.md

Why: if your OpenClaw setup uses a shared runtime policy in `TOOLS.md`, use this canonical block.

````md
### Tasks: External tracking with HZL

HZL is OpenClaw's durable task ledger for stateless sessions.

Use HZL by default when work is non-trivial, spans sessions, or involves delegation.

## Default operating loop

```bash
# Session start
hzl workflow run start --agent <agent-id> --project <project>

# During work
hzl task checkpoint <id> "progress + next step"

# Finish paths
hzl task complete <id>
# or
hzl workflow run handoff --from <id> --title "<next task>" --project <project>
# or
hzl workflow run delegate --from <id> --title "<delegated task>" --project <project> --pause-parent
```

## Multi-agent routing

- Prefer project pools for role queues.
- Omit `--agent` when creating pool-routed tasks.
- Claim with `hzl task claim --next -P <project> --agent <id>`.

## Agent roster changes (standing instruction)

When a new agent is added:
- decide which HZL project pool(s) that agent monitors,
- check sandbox settings and add HZL bind mounts first if sandbox mode is enabled,
- add the marker-wrapped HZL Task Poll block to that agent's HEARTBEAT,
- add/update that agent's HZL section in `TOOLS.md` (identity, projects, sandbox mode, relevant commands),
- update the main agent's HZL system map in `TOOLS.md` to include the new agent and project ownership.

## Reliability

- Completion hooks are outbox-based.
- Host runtime must schedule `hzl hook drain` (every 1-5 minutes).

## Troubleshooting quick hits

| Error | Fix |
|---|---|
| "not claimable (status: backlog)" | `hzl task set-status <id> ready` |
| "Cannot complete: status is X" | `hzl task claim <id> --agent <id>` first |
| "handoff requires --agent, --project, or both" | add explicit routing flags |

## Destructive commands (never run unless explicitly requested)

- `hzl init --force`
- `hzl task prune`
````

## 8) Record what changed (required for clean teardown)

Add this to `TOOLS.md` or your runtime memory file:

```md
HZL integration (installed <date>):
- Scheduler job id/name for `hzl hook drain`: <id>
- Config keys changed: hooks.on_done
- HEARTBEAT files modified: <paths>
- Projects created: <list>
- Sandbox-enabled agents + HZL bind mounts: <list>
- Update preference: auto-update | notify-only | manual
- Update scheduler/job id (if any): <id>
```

## 9) Configure HZL update preference

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

### Optional: Manual `upgrade hzl` helper script (OpenClaw)

If you want one workspace command for manual upgrades, create `scripts/upgrade-hzl.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Updating hzl-cli..."
npm install -g hzl-cli@latest
echo "hzl-cli version: $(hzl --version)"

echo "Updating OpenClaw HZL skill..."
npx clawhub update hzl
echo "OpenClaw HZL skill update completed."
```

Then make it executable:

```bash
chmod +x scripts/upgrade-hzl.sh
```

If your runtime supports command aliases/intents, map `upgrade hzl` to this script.

## Installation checklist

Use this checklist to verify your setup is complete. Items marked **(required)** must pass. Items marked **(recommended)** are strongly encouraged but may be skipped with justification. Items marked **(optional)** depend on your deployment.

If you deviate from any required or recommended step, document the reason in your integration notes (step 8) so future maintainers understand the decision.

### Tier 1: CLI and infrastructure

- [ ] `hzl --version` returns a version **(required)**
- [ ] `hzl task list` runs without error **(required)**
- [ ] Web dashboard accessible at `http://localhost:3456` **(optional)** — only if you set up the service

### Tier 2: OpenClaw integration

- [ ] OpenClaw HZL skill installed (`npx clawhub@latest install hzl`) **(required)**
- [ ] Agent roster, gateway URL, and scheduler capability discovered and confirmed with operator **(required)**
- [ ] Sandbox bind mounts configured for any sandboxed agents **(required if sandbox mode is enabled)**
- [ ] At least one project pool created **(required)**
- [ ] Exec-denied agents identified and resolved (option 1 or 2) **(required if any agents deny exec)**
- [ ] HEARTBEAT Task Poll block added for each participating agent **(required)**
- [ ] `hooks.on_done` configured in `config.json` with correct endpoint and token **(required)**
- [ ] `hzl hook drain` runs without error (manual test before scheduling) **(required)**
- [ ] Drain cron job scheduled (every 1–5 minutes) **(required)**
- [ ] End-to-end verification passed: task add → workflow start → complete → drain **(required)**
- [ ] Per-agent TOOLS.md HZL section added **(recommended)**
- [ ] Shared HZL policy block added to TOOLS.md **(optional)**
- [ ] Integration notes recorded (scheduler IDs, config changes, HEARTBEAT paths) **(recommended)**
- [ ] Update preference configured (auto / notify / manual) **(recommended)**

### Customization note

These instructions cover the most common OpenClaw deployment pattern. Your environment may differ — for example, different scheduler tooling, non-standard agent configurations, or custom gateway setups. Deviations are fine as long as the core contract holds: agents poll at session start, hooks fire on completion, and drain runs on a schedule. When in doubt, verify with the end-to-end test in step 6.

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
Sandbox mode: off  <!-- or: on (bind mounts configured in openclaw.json) -->

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
1. Decide which project pool(s) it monitors.
2. Check sandbox config for the new agent and defaults.
3. If sandbox mode is enabled (or defaults are `non-main`/`all`), add HZL bind mounts before HEARTBEAT wiring.
4. Add marker-wrapped Task Poll block to that agent's HEARTBEAT.
5. Add an HZL section to that agent's `TOOLS.md` with identity, projects, sandbox mode, and relevant commands.
6. Update the main agent's HZL system map in its `TOOLS.md` to include the new agent and project ownership.
7. Record the change in your HZL integration notes.

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

## Next

- [Quickstart](./quickstart)
- [Workflows](../workflows/)
