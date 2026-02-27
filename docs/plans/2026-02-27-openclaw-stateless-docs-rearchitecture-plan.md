# OpenClaw Stateless Docs Rearchitecture Plan

Date: 2026-02-27
Status: Proposal (for OpenClaw feedback)
Audience: HZL maintainers, OpenClaw maintainers, operator-doc owners

## Why This Plan Exists

HZL documentation currently explains primitives well, but under-explains the core OpenClaw reality:
- agent sessions are stateless and ephemeral,
- coordination is reconstructed from durable task state each wake,
- reliability depends on system-enforced patterns (workflows + hooks), not prompt memory.

The docs need to shift from "CLI feature catalog" to "stateless operating model + reliable execution patterns."

## Strategic Shift

### Old framing (insufficient)

"HZL is a task ledger with commands."

### New framing (recommended)

"HZL is the continuity and coordination layer for stateless agents. Workflows encode the session lifecycle."

This is the key pitch change for both:
- repo `README.md`
- docs-site homepage (`docs-site/index.md`)

## Positioning Changes (Homepage + README)

## Messaging to Lead With

1. Stateless reality:
   "Each agent wake is a fresh session. HZL is how work continuity survives session boundaries."
2. Reliability:
   "Completion hooks + retries make handoff signaling system-level, not prompt-dependent."
3. Scalable routing:
   "Projects as role pools let teams scale identities without changing assigner prompts."
4. Operator control:
   "Cross-project dependencies are policy-controlled (`same_project|cross_project`) and queryable."

## Messaging to De-emphasize

1. Generic task-manager comparisons as primary story.
2. OpenClaw setup marked "TBD" at top-level entry points.
3. Primitive-first examples that hide workflow guidance.

## Proposed Information Architecture

`Workflows` should be a first-class top-level pillar, not a secondary add-on.

Recommended top-level order:
1. Getting Started
2. Workflows
3. Concepts
4. Reference
5. Dashboard
6. Troubleshooting
7. Experimental Integrations

Rationale:
- Operators need "how to run stateless sessions safely" before deep conceptual internals.
- `Concepts` explains why; `Workflows` explains what to do every wake cycle.
- `Reference` remains a lookup surface, not the primary onboarding path.

## Section Breakout and Hierarchy

## Getting Started (task: fast time-to-safe-loop)

Keep this lean and execution-focused:
1. Installation
2. 10-minute Quickstart (single queue + claim/checkpoint/complete)
3. OpenClaw Setup (no TBD; concrete config and loop)
4. First Stateless Loop (new): resume-or-claim, checkpointing, handoff, failure recovery

## Workflows (task: default operating procedures)

Reframe as recommended day-to-day operating playbooks:
1. Session Start (`workflow run start`)
2. Handoff (`workflow run handoff`)
3. Delegation (`workflow run delegate`)
4. Pool Routing by Project (unassigned task in target project)
5. Completion Hooks and Retry Model
6. Human Oversight
7. Blocking/Unblocking and escalation paths

Note: keep current pages (single-agent, multi-agent, session-handoffs), but pivot examples to workflow-centric flows and stateless assumptions.

## Concepts (task: constraints + guarantees)

Focus on invariants and policy:
1. Done vs Complete semantics
2. Dependency policy modes (`same_project|cross_project`)
3. Tags (first-class routing/filtering) vs metadata (structured context)
4. Leases and expired-lease recovery
5. Event-sourcing/audit model

## Reference (task: exact command surface)

Include discoverability and machine-useful details:
1. `workflow list/show/run` contracts and output schemas
2. hook commands (`hook drain`, statuses, retry states)
3. dependency listing/query commands (`dep list` filters)
4. idempotency scope (`--op-id`, `--auto-op-id`, retention, replay semantics)
5. explicit `workflow show start` note: `--auto-op-id` is intentionally unsupported for polling-style `start` calls

## File-by-File Documentation Changes

## P0: Must Update for Coherent Launch

1. `README.md`
   - rewrite hero + opening to stateless continuity framing
   - add "Stateless Agent Loop" example
   - add Workflows link prominence

2. `docs-site/index.md`
   - replace "OpenClaw problem" narrative with stateless lifecycle narrative
   - add explicit "Start / Handoff / Delegate / Hook" journey
   - remove "OpenClaw Setup (TBD)"

3. `docs-site/getting-started/index.md`
   - remove TBD language
   - add "First Stateless Loop" as required step

4. `docs-site/getting-started/openclaw.md`
   - publish concrete setup contract
   - include pool-routing guidance
   - note launch-scope hook config is global (`hooks.on_done`), with per-project/per-agent overrides as future scope
   - include hook retry ownership model (host-process scheduler)

5. `docs-site/workflows/index.md`
   - make workflow commands primary (not just pattern chooser)
   - include decision table by session state (resume, claim, handoff, delegate)

6. `docs-site/concepts/dependencies.md`
   - replace "same-project only" absolute statement
   - document policy modes + safety defaults + queryability

7. `docs-site/concepts/index.md`
   - remove hard-coded same-project dependency limitation
   - add stateless-agent mental model upfront

8. `docs-site/reference/cli.md`
   - add workflow and hook command families
   - make `workflow show start` behavior explicit: no `--auto-op-id`, with rationale
   - add `task list --tags`
   - add dependency query commands and filters

## P1: Strongly Recommended After P0

1. `docs-site/workflows/multi-agent.md`
   - emphasize project-pool routing pattern
   - clarify `claim --agent` ownership-setting vs candidate filtering contract

2. `docs-site/workflows/session-handoffs.md`
   - migrate examples to `workflow run handoff`
   - show dual carry placement (description + initial checkpoint)

3. `docs-site/workflows/blocking-unblocking.md`
   - clarify delegation with `--pause-parent` bridge semantics

4. `docs-site/reference/architecture.md`
   - add hook outbox + drain architecture
   - add workflow op-id idempotency boundaries

5. `docs-site/troubleshooting.md`
   - add hook delivery failures, retry exhaustion, and drain cadence troubleshooting

## P2: Keep Skills and Prompts in Sync

1. `snippets/HZL-GUIDE.md`
2. `snippets/AGENT-POLICY.md` (if quick-reference commands change materially)
3. `openclaw/OPENCLAW-TOOLS-PROMPT.md`
4. `openclaw/skills/hzl/SKILL.md`

These need alignment so agent prompts do not teach pre-workflow operating patterns after workflows ship.

## Proposed Workflows Placement Decision

Decision:
- Keep `Workflows` as a top-level section.
- Move it ahead of `Concepts` in nav order.
- Link to it directly from:
  - homepage hero actions,
  - README primary docs links,
  - Getting Started completion step.

Reason:
- For stateless agents, workflows are not advanced usage; they are the default safety path.

## Editorial Rules for the New Documentation Voice

1. Every OpenClaw-facing page should state stateless assumptions explicitly.
2. Lead with "what command to run now," then explain why.
3. Distinguish command names from status terms (`complete` command vs `done` status).
4. Use "pool routing" term consistently when `--agent` is omitted intentionally.
5. Include failure-mode behavior for each operational feature (hooks, leases, deps, retries).

## Example Home/README Copy Direction (Draft)

One-line positioning:
"HZL is the continuity layer for stateless agent systems: claim safely, resume reliably, and hand off with context."

Primary CTA structure:
1. Get Started
2. Workflows
3. OpenClaw Setup

Feature bullets:
1. Session continuity for stateless wakes
2. Atomic claim and lease recovery
3. Reliable handoff signaling via hooks + retries
4. Policy-controlled cross-project dependencies

## Rollout Sequence

1. Ship P0 docs in same release as workflow/hooks/dependency changes.
2. Ship P1 doc deepening in next patch/minor if needed.
3. Ship P2 prompt/skill sync immediately after P0 to prevent drift.

## Acceptance Criteria

1. A new OpenClaw operator can run a safe session lifecycle from docs without reading source.
2. No top-level docs page contains "TBD" for OpenClaw core setup.
3. Workflows are discoverable from homepage, README, and Getting Started.
4. Dependency policy docs match shipped behavior and flags.
5. Agent-facing snippets/prompts reflect workflow-first guidance.

## Open Questions for OpenClaw Feedback

1. Should docs present one default scheduler cadence for `hzl hook drain` (for example, every 1 minute), or a recommended range by load profile?
2. For `workflow run start`, should docs promote explicit `--op-id` patterns for orchestrators by default, or keep that in advanced sections?
3. Should project-pool routing be documented as default policy for role teams, with explicit-assignee routing as exception?
