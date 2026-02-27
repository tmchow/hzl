# HZL Proposal for OpenClaw Feedback

Date: 2026-02-27
Status: Draft v2 (updated after OpenClaw feedback)
Audience: OpenClaw maintainers and HZL maintainers

## Why This Document Exists

OpenClaw provided multi-agent feedback that is directionally strong but mixes feature requests, semantics clarifications, and workflow ergonomics.

This document proposes a concrete contract that:
1. Keeps HZL aligned with its role as a task-state ledger.
2. Improves stateless agent UX for common flows.
3. Makes cross-project dependencies first-class without policy toggles.
4. Preserves tags as first-class lightweight routing/filtering fields.

## Key Clarification: `done` vs `complete`

`done` and `complete` are related but not identical.

- `done` is a status value.
- `complete` is a command that transitions a task to `done` with stricter preconditions.

Current behavior:
- `task complete` requires `in_progress` or `blocked`.
- `task set-status <id> done` can also transition to `done`.
- `task add -s done` can create a task directly in `done`.

Implication for automation:
- Any downstream eventing should trigger on status transition to `done`, not only `task complete` invocation.

## Naming Direction: `workflow` Instead of `intent`

Use a first-class `workflow` namespace.

Proposed discovery surface:
- `hzl workflow list`
- `hzl workflow show <name>`
- `hzl workflow run <name> [options]`

Discovery contract note:
- `hzl workflow show start` must explicitly document that `--auto-op-id` is unsupported for `workflow run start`, because polling calls with identical inputs are expected to produce different valid outcomes over time.

Rationale:
- "workflow" is clearer to operators than "intent".
- Discovery commands reduce prompt-only tribal knowledge.
- Keeps command semantics explicit and inspectable.

## Proposed Built-in Workflows

### 1) `workflow run start`

Goal: one session-start command for stateless agents.

Behavior:
1. Find `in_progress` tasks for `--agent`, including tasks with expired leases.
2. If one or more are found:
   - select one using `priority` (default policy),
   - return selected task plus alternate-task summary for visibility,
   - optionally refresh lease on selected task.
3. Else claim next eligible task (`claim --next`) with optional project/tag filters.
4. Response includes a structured summary such as: selected task id, total in-progress count, and alternate task ids.

Inputs:
- `--agent <name>` (required)
- `-P, --project <project>` (optional)
- `--tags <tags>` (optional)
- `--lease <minutes>` (optional)
- `--resume-policy first|latest|priority` (optional; default `priority`)
- `--include-others` (optional; default true in JSON output)
- `--others-limit <n>` (optional; default `5`)

Pushback/constraint:
- Do not return unbounded full alternate task lists by default. Return count + top N ids unless `--others-limit all` is explicitly requested.
- Do not add strict-failure mode at launch. Keep launch behavior simple: selected task + bounded alternates.

### 2) `workflow run handoff`

Goal: complete current work and create follow-on work atomically.

Behavior:
1. Validate source task can transition to `done`.
2. Transition source to `done`.
3. Create follow-on task (target project or agent optional).
4. Copy last `N` checkpoints into follow-on description context block.
5. Also add an initial checkpoint to the follow-on task containing the same carried context.
6. Emit one workflow marker event with correlation id for auditability.

Inputs:
- `--from <task-id>` (required)
- `--title <new-task-title>` (required)
- `--project <project>` (optional)
- `--agent <agent>` (optional)
- `--carry-checkpoints <n>` (optional; default `3`)
- `--carry-max-chars <n>` (optional; default `4000`)

Pushback/constraint:
- Carrying context to both description and checkpoint is good for stateless pickup and auditability, but requires size controls to avoid prompt bloat and duplicated noise.
- Default split for carried text should prioritize pickup context: 2500 chars into description, 1500 chars into initial checkpoint.
- Explicitly document that omitting `--agent` is intentional pool routing: the follow-on task is unassigned and claimable by any eligible agent in the target project.
- Guardrail: if `--agent` is omitted, require explicit `--project` on handoff to prevent accidental routing into implicit/global queues.
- Actionable error contract:
  `handoff requires --agent, --project, or both. Omitting --agent creates a pool-routed task - specify --project to define the queue.`

### 3) `workflow run delegate`

Goal: create delegated work and gate parent progress with explicit semantics.

Behavior:
1. Create delegated task (subtask or sibling/follow-on).
2. Add dependency from parent to delegated task by default.
3. Optionally checkpoint parent with delegation context.

Inputs:
- `--from <task-id>` (required)
- `--title <delegated-title>` (required)
- `--project <project>` (optional)
- `--agent <agent>` (optional)
- `--no-depends` (optional; disables default parent dependency edge)
- `--checkpoint <text>` (optional)
- `--pause-parent` (optional; sets parent to blocked with a generated reason)

Note: dependency gating is default because this workflow is for true delegation blocking. If no gating is desired, plain `task add` remains the simpler primitive.

Critical pushback:
- A dependency edge alone does not fully "block" a parent currently if the parent is already `in_progress`.
- `task complete` also does not validate dependencies before transitioning to `done`.
- Therefore, "depends by default" is useful but not sufficient for strict parent-blocking semantics.
- Proposed direction: `workflow run delegate` should support `--pause-parent` immediately, and a follow-up invariant proposal should decide whether all done-transitions should enforce dependency completion.
- Launch contract wording: dependency edge provides availability gating; strict pause/block semantics require `--pause-parent` until Phase 4 invariants land.
- Launch unblock policy: when `--pause-parent` is used, parent remains blocked until explicit manual unblock (or a future auto-unpause workflow in Phase 4+).

## Workflow + Hook Idempotency (Scoped)

Add idempotency keys where duplicate risk is highest, with explicit phase scope.

In scope:
- `workflow run start|handoff|delegate --op-id <key>`
- Hook outbox deduplication via propagated `op_id`

Out of scope in this phase:
- Primitive mutations like `task add --op-id` or `task complete --op-id`

Execution contract:
1. If `--op-id` is provided and already completed, return stored prior result with no new side effects.
2. If `--op-id` is new, execute once, persist result snapshot, and bind generated events/hooks to that op id.
3. Replays with same `op_id` are no-ops plus cached response.
4. Concurrent submissions of the same `op_id` are single-writer:
   - persist `workflow_ops(op_id PRIMARY KEY, state, input_hash, result, created_at, updated_at)`,
   - transition atomically (`pending -> completed|failed`),
   - only one executor may own `pending` execution; others return in-progress/replay metadata.

Fallback safety net when `--op-id` is omitted:
- Do not implicitly auto-dedupe mutating workflows by default (prevents accidental suppression of intentional repeated runs).
- Provide explicit opt-in: `--auto-op-id`.
- When `--auto-op-id` is set, generate a deterministic content-addressed key from canonicalized workflow input (`workflow name + normalized args + resolved ids + source-task last_event_id fingerprint when available`).
- This opt-in mode protects stateless retry paths while making dedupe behavior intentional.
- Guardrail: `workflow run start` does not support `--auto-op-id` (polling path). Use explicit `--op-id` only when caller is intentionally retrying the same start operation; `workflow show start` should call this out explicitly so omission is understood as deliberate behavior, not a docs gap.

Retention policy for op records:
- Default TTL: 7 days.
- Reasoning: longer than transient retry windows and session gaps, without unbounded growth.

## Completion Hooks (One-Way Callback)

Completion hooks are compatible with HZL's design and are distinct from a full real-time event bus.

Proposed capability:
- On any status transition to `done`, execute a configured one-way callback.
- Primary transport: HTTP POST to configured URL.
- Optional fallback: shell command hook for local operator setups.

Suggested config shape:
```json
{
  "hooks": {
    "on_done": {
      "url": "http://127.0.0.1:18789/events/inject",
      "headers": {
        "Authorization": "Bearer $OPENCLAW_GATEWAY_TOKEN"
      }
    }
  }
}
```

Launch scope note:
- Hook configuration is intentionally global in this phase (single `hooks.on_done` surface). Per-project/per-agent hook overrides are a potential future extension, but are out of launch scope to keep setup and behavior simple.

Payload should include:
- task id, project, status transition, timestamp
- author/agent fields (when present)
- correlation/session ids (when present)

Trigger condition:
- transition to `done` regardless of command path (`task complete`, `task set-status done`, or other status transition routes).
- Transactional guarantee: the status transition and hook outbox enqueue must commit in the same transaction.

Reliability pushback/constraint:
- Hook delivery should be non-blocking by default so task mutation is not held hostage by network failures.
- Add explicit failure policy:
  - `best_effort` (default): record hook attempt/failure, do not fail command.
  - `fail_closed`: mutation fails if hook delivery fails (defer as a later optional mode).
- Recommended implementation is a local outbox table + scheduled `hzl hook drain` rather than synchronous inline HTTP as the only path.

Worker lifecycle contract (proposed):
- **Chosen launch model: host-process model.**
- HZL does not introduce a required daemon in launch scope.
- A persistent host runtime (OpenClaw gateway, systemd timer, cron, CI runner, etc.) is expected to run `hzl hook drain` on a schedule.
- If no scheduler is running, commands still enqueue outbox records; delivery is deferred until the next drain run.
- Manual `hzl hook drain` remains useful for debugging and incident recovery.

Rationale for chosen model:
- Keeps launch scope aligned with HZL's CLI-first design.
- Avoids introducing daemon lifecycle management in the first release.
- Works for both persistent-agent systems (OpenClaw) and non-persistent operator setups.

Deferred enhancement (optional later):
- Add `hzl hook worker` as a first-party long-running helper for operators who want HZL-native background retries.

Retry policy defaults (proposed):
- TTL: 24 hours.
- Max attempts: 5.
- Backoff schedule: exponential with jitter, bounded by TTL (for example ~30s, ~2m, ~10m, ~1h, ~6h).
- Terminal state after exhaustion: mark as `failed` in outbox with last error for inspection/replay.

`hzl hook drain` processing contract (for scheduled host-process model):
1. Select due records where `state = queued`, `now >= next_attempt_at`, `attempt_count < max_attempts`, and `now < expires_at`.
2. Atomically claim records (`queued -> processing`, set `worker_id`, `locked_at`) before delivery.
3. Attempt delivery for each claimed record.
4. On success: mark `delivered` with timestamp.
5. On failure: increment `attempt_count`, compute `next_attempt_at` from backoff schedule, persist last error, and transition back to `queued`.
6. On exhaustion (`attempt_count >= max_attempts` or `now >= expires_at`): mark `failed`.
7. Reclaim stale `processing` records when `locked_at` exceeds lock timeout.

Timing semantics:
- If scheduler cadence is slower than backoff intervals, delivery occurs on the next scheduler run after `next_attempt_at`.
- No implicit "catch-up burst" beyond normal per-run processing limits.
- Max-attempts is authoritative; remaining TTL does not permit extra attempts beyond `max_attempts`.

Recommended scheduler cadence in host-process model:
- Run `hzl hook drain` every 1-5 minutes for near-real-time behavior.

## Cross-Project Dependencies: Proposed Model

## Objective

Support cross-project dependencies as a default capability with minimal operator friction.

## Current Problem

Dependency policy and opt-in flags introduced unnecessary complexity for a core dependency feature.

## Capability Contract

Cross-project dependency edges are always allowed.

No dependency policy config is required:
- No `dependencies.mode`
- No per-command opt-in flags for cross-project edges

Command behavior:
- `task add ... --depends-on ...` may reference tasks from any project.
- `task add-dep <task> <dep>` may link tasks across projects.

## Validation Rules

Always enforce:
1. No self-dependency.
2. No cycles.
3. Target task ids must exist at creation time (launch behavior for both `task add --depends-on` and `task add-dep`).
4. Historical orphan dependency edges remain readable and visible; new orphan creation is rejected.

## Querying Dependencies (Operator + Agent Usability)

Add `hzl dep list` with composable filters.

Day one required filters:
- `--project <p>` (either side in project `p`)
- `--from-project <p>`
- `--to-project <p>`
- `--agent <a>` (either side assigned to agent)
- `--from-agent <a>`
- `--to-agent <a>`
- `--blocking-only` (dependency target not `done`)
- `--cross-project-only`

Phase-up filters:
- `--tag <t>` (either side has tag)
- `--from-tag <t>`
- `--to-tag <t>`

Example:
```bash
hzl dep list --project research --blocking-only
hzl dep list --from-project writing --to-project research
hzl dep list --agent clara --blocking-only
```

Output shape (JSON):
- `from_task_id`, `to_task_id`
- `from_project`, `to_project`
- `from_agent`, `to_agent`
- `from_tags`, `to_tags`
- `blocking` (boolean)

## Impacted Behaviors with Cross-Project Dependencies

### Pruning

Prune eligibility logic must account for dependents across all relevant projects, not assume project-local dependency closure.

### Project Delete/Move

Project deletion and bulk moves need safeguards when external dependency edges exist:
1. Block by default with actionable error.
2. Allow explicit override mode (`--force` or `--rewrite-deps`) with clear audit events.

### Visibility

`task show` should surface dependency project context when blockers are cross-project.

## Tags as First-Class, Metadata as Structured Context

Tags should remain first-class lightweight classification.

Recommended contract:
- Tags: short labels for routing and filters (queueing, ownership domains, work type).
- Metadata: rich structured payload for detailed context.

Immediate parity improvements:
1. Add `task list --tags <csv>` filter.
2. Keep all-tags semantics consistent with `claim --tags` unless an explicit `--tags-any` flag is added.
3. Ensure dependency queries support tag filters (`dep list --tag ...`).

## Rollout Plan

Phase 1 (safe consistency + low risk):
1. Normalize dependency validation across `task add` and `task add-dep`.
2. Remove dependency policy toggles and always allow cross-project edges.
3. Add `task list --tags`.

Phase 2 (observability + workflows):
1. Add completion hooks (`on_done` callback).
2. Add `dep list` with project/agent filters.
3. Add `workflow list/show/run` scaffold.
4. Add scoped idempotency for `workflow run` + hook outbox (`op_id`, replay-safe result cache, dedupe).
5. Ship `workflow run start` first (including expired-lease recovery semantics and bounded alternate-task visibility).

Phase 3 (advanced workflows):
1. `workflow run handoff`.
2. `workflow run delegate` (with explicit parent pause option).
3. Add tag filters to `dep list`.
4. Add correlation-id-rich audit output for workflow runs.

Phase 4 (semantic hardening):
1. Decide and implement done-transition dependency policy (enforce deps done vs keep permissive with override).
2. Refine delegate defaults once dependency-completion invariant is settled.

## Non-Goals

1. HZL does not become an agent orchestrator.
2. HZL does not become a real-time bi-directional event bus by default.
3. HZL does not require agent registration for these features.

## OpenClaw Feedback Resolution (Current)

1. `workflow run start`: launch with selected task + bounded alternates; defer strict-single mode.
2. Hooks: launch with `best_effort` + durable outbox retries; defer `fail_closed`.
3. Cross-project dependencies: always enabled; no policy mode or cross-project opt-in flags.
4. Handoff context budget: default 4000 chars split 2500 description / 1500 initial checkpoint.
5. Delegate behavior: keep `--pause-parent` explicit now; make default only after done-transition invariants are enforced.

## Recommended Decision

Adopt `workflow` namespace and ship in phases, with cross-project dependencies treated as a core always-on capability and operational safeguards handled through validation, visibility, and dependency query tooling.
