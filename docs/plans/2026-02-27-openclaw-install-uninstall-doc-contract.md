# OpenClaw Install/Uninstall Documentation Contract

Date: 2026-02-27
Status: Proposal (critical review applied)
Audience: HZL docs maintainers, OpenClaw maintainers, operator-doc owners

## Purpose

Define how HZL installation and teardown docs should work for OpenClaw environments where:
- mechanical HZL setup is shared across users,
- OpenClaw integration is variable per instance (agent count, roles, files, scheduler access),
- setup is often executed by an AI agent following a pasted link.

This contract is intentionally agent-executable and human-readable in one document.

## Critical Review of OpenClaw Feedback

## Adopt As-Is

1. Two-tier install structure: mechanical first, parametric integration second.
2. Explicit introspection step before integration.
3. Hook reliability model: host-process scheduled `hook drain`.
4. HEARTBEAT integration as OpenClaw-specific section.
5. End-to-end verify sequence at the end.
6. Marker-based file edits for reversible teardown.

## Adopt With Changes

1. Project setup guidance:
   - Do not prescribe "one project per domain" as universal default for single-agent setups.
   - Use a decision tree that includes a low-complexity default (`openclaw` project + tags) to avoid project sprawl.
2. Commands/examples:
   - Use canonical HZL command names (`hzl project create`, not `project add`).
   - Ensure examples match the documented release surface and naming.
3. Config mutation examples:
   - document `hzl config set ...` as part of the workflows/hooks release surface.
   - if a specific installer path still uses file edits, document that path explicitly.
4. Verify step:
   - Do not rely on `hzl hook drain --dry-run` unless implemented.
   - Provide a fallback verify method that works with shipped commands.

## Pushback / Scope Guard

1. OpenClaw teardown ownership:
   - integration teardown is OpenClaw/operator responsibility, not HZL runtime responsibility.
   - HZL docs should provide teardown guidance, but HZL should not attempt to mutate OpenClaw-owned config/files automatically.
2. Installation manifest must respect HZL path rules:
   - use XDG-resolved path (and dev-mode local path), not only hardcoded `~/.local/share/hzl/...`.
3. Teardown should default to plan output first:
   - no silent mutation of shared operator files.

## HZL Uninstall Boundary (Recommended)

HZL uninstall is intentionally narrow:
1. Remove binary via package manager:
   - npm: `npm uninstall -g hzl-cli`
   - Homebrew: `brew uninstall hzl`
2. Remove HZL data/config only if desired:
   - data path is XDG-resolved (`$XDG_DATA_HOME/hzl` or `~/.local/share/hzl` by default)
   - config path is XDG-resolved (`$XDG_CONFIG_HOME/hzl` or `~/.config/hzl` by default)
   - dev mode may use repo-local `.local/hzl` and `.config/hzl`

Important:
- do not hardcode one path in docs as the only valid location;
- OpenClaw integration artifacts are not part of HZL's own footprint.

## Installation Docs Structure (Recommended)

## Tier 1: Mechanical Setup (Universal)

Goal: setup the CLI and verify baseline health.

Steps:
1. Install binary (`npm` or `brew`).
2. Initialize HZL (`hzl init`).
3. Verify:
   - `hzl --version`
   - `hzl task list`

This section is identical for all operators and safe for autonomous execution.

## Tier 2: OpenClaw Integration (Parametric)

Goal: connect HZL to the specific OpenClaw instance.

### Step A: Introspect Local Context First

Before configuring anything, instruct the agent to discover:
1. Its own agent identity string (`--agent` value).
2. Active agent roster and role mapping (if multi-agent).
3. Gateway URL/token from standard config sources (`TOOLS.md`, `openclaw.json`, or equivalent).
4. Whether scheduled command execution is available (cron/systemd timer/OpenClaw scheduler).

If any value cannot be discovered, require escalation to operator with a precise missing-field list.

### Step B: Choose Project Model via Decision Tree

Use this decision tree, in order:
1. If setup is small/early-stage and no clear role queues exist:
   - start with one shared project (for example `openclaw`) + tags for routing.
2. If multiple role queues are stable (research/writing/coding/etc.):
   - create one project per role queue.
3. If a role may scale to multiple agent identities:
   - route by project pool (unassigned task in role project), not by hardcoded assignee.

Avoid one-project-per-ephemeral-domain defaults that create long-term project sprawl.

### Step C: Configure Hooks + Scheduler Ownership

Document clearly:
1. Hook config is global at launch (`hooks.on_done`).
2. Delivery is outbox-based and non-blocking.
3. Retries only happen when `hzl hook drain` is scheduled by host runtime.

Scheduler recommendation:
- every 1-5 minutes (default suggestion: 2 minutes).

If no scheduler access exists:
- explicitly note degraded mode: events queue but do not deliver until manual drain.

### Step D: HEARTBEAT Integration (OpenClaw-Specific)

Add a `Task Poll` section in each agent HEARTBEAT using that agent's identity.

Required conventions:
1. Wrap inserted content in reversible markers:
   - `<!-- hzl:start -->`
   - `<!-- hzl:end -->`
2. Use exact identity strings that match assignment/claim usage.
3. Keep polling logic minimal and deterministic.

Example wrapper:
```md
<!-- hzl:start -->
## Task Poll
... hzl workflow run start ...
<!-- hzl:end -->
```

### Step E: Verify End-to-End

Verification should include:
1. Add a test task in intended project.
2. Run session-start command path.
3. Complete the task.
4. Verify hook outbox/delivery path with shipped diagnostics.

Docs must provide a fallback verification path if workflows/hooks are not yet shipped in the currently installed version.

### Step F: Record Installation for Teardown

After verify, record integration deltas in `TOOLS.md` (or equivalent OpenClaw memory file), including:
1. install date,
2. scheduler job id/name for `hzl hook drain`,
3. config keys added/changed (for example `hooks.on_done`),
4. HEARTBEAT files modified,
5. projects created for integration.

Rationale:
- HZL has no OpenClaw-specific eject command in this phase; clean teardown depends on accurate local change records.

## "Paste Link to Agent" Compatibility

The install doc should include a copyable "agent execution preflight" block:
- discover required variables,
- list missing inputs,
- proceed step-by-step with explicit checks.

Design rule:
- no step should require hidden context or assumed human interpretation.

## Ongoing Maintenance: New Agent Onboarding

HZL integration is not one-time; it must be extended when roster changes.

Require a `## HZL - New Agent Checklist` section in `TOOLS.md`:
1. add marker-wrapped `Task Poll` block to new agent `HEARTBEAT.md`,
2. choose monitored project pool(s) (create project if needed),
3. append install-record line for the new agent (agent id, projects, date).

Install docs should explicitly link to this checklist:
- "When adding agents after initial setup, complete the New Agent Checklist in `TOOLS.md`."

## Uninstallation / Teardown Documentation Contract

Binary removal alone is insufficient. Teardown must cover OpenClaw integration artifacts.

## Teardown Ownership Model

Provide manual teardown checklist in reverse install order:
1. disable/remove scheduled `hzl hook drain`,
2. remove HZL-inserted HEARTBEAT sections between markers,
3. clear hook config entries,
4. optional data export,
5. optional HZL data directory cleanup.

Each step must include verification commands.

## Install Manifest Requirements

Manifest should record exactly what was changed:
1. runtime type and timestamp,
2. scheduler registrations (ids/names),
3. config keys touched,
4. files modified + marker ranges or patch metadata,
5. projects created by integration flow.

Path requirement:
- ownership can live in OpenClaw-managed notes/config (recommended), or in HZL data directory if operator prefers.
- if stored by HZL-side docs, use resolved HZL data directory (`$XDG_DATA_HOME/hzl/...` or dev-mode local equivalent).

## Why Plan-First Teardown

Teardown touches shared systems (OpenClaw config, scheduler, HEARTBEAT files). Defaulting to dry-run avoids unsafe assumptions and supports agent-supervised execution.

## Docs Files to Update

P0:
1. `docs-site/getting-started/installation.md`
2. `docs-site/getting-started/openclaw.md`
3. `docs-site/getting-started/index.md`
4. `README.md` (installation/docs links + stateless framing)

P1:
1. `docs-site/workflows/index.md` (session-start usage)
2. `docs-site/reference/cli.md` (hooks/workflows surface)
3. `openclaw/OPENCLAW-TOOLS-PROMPT.md`
4. `openclaw/skills/hzl/SKILL.md`
5. `snippets/HZL-GUIDE.md`

## Acceptance Criteria

1. A human can paste the doc link to an OpenClaw agent and get deterministic setup behavior.
2. The same document works for single-agent and multi-agent instances via decision tree.
3. Hook reliability ownership is explicit (who runs drain, how often, failure mode).
4. Teardown instructions undo all integration points, not just binary install.
5. Command examples match the actual release/version being documented (no docs/runtime mismatch).
