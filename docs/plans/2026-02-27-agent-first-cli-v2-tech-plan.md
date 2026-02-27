# Agent-First CLI v2 - Technical Plan

**Date:** 2026-02-27
**Status:** Planning
**PRD:** `docs/prd/2026-02-26-agent-first-cli-v2-prd.md`

## Overview

This plan executes the v2 CLI hard reset for agent-first usage: JSON-first contracts, unified claiming (`claim <id>` and `claim --next`), deterministic selection with decision traces, agent-centric querying, and removal of `task next`. The implementation keeps architecture CLI-only (no daemon/watch), while adding low-latency anti-herd behavior for auto-claim worker loops.

A major cross-cutting element is terminology migration from `assignee` to `agent` across read models, service types, CLI flags, JSON output contracts, web API surfaces, and tests. Historical event replay remains backward-compatible (`assignee` read fallback), while runtime interfaces are standardized to `agent`.

## Architecture

```
            CLI surface (hzl-cli)
┌─────────────────────────────────────────────┐
│ Global format: json default, --format md   │
│ task claim <id> / task claim --next        │
│ task list --agent / --agent-pattern        │
│ agent stats                                │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
               TaskService (hzl-core)
┌─────────────────────────────────────────────┐
│ Eligibility gate + deterministic ranking    │
│ Decision trace generation                   │
│ Pattern-based agent filtering               │
│ Agent summary aggregations                  │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
           Cache projection schema (SQLite)
┌─────────────────────────────────────────────┐
│ tasks_current.agent (renamed from assignee) │
│ indexes adjusted for claim/list/stats paths │
│ migration: assignee -> agent                │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
            Append-only events (events.db)
┌─────────────────────────────────────────────┐
│ Historical events may contain assignee key  │
│ v2 events emit agent key                    │
│ projector reads both during replay          │
└─────────────────────────────────────────────┘
```

Key implementation decisions:
- Keep events append-only and avoid rewriting historical payloads; compatibility is projector-level.
- Introduce a shared JSON envelope utility (`schema_version`, `ok`, `data|error`) used by all updated commands to satisfy stability requirements.
- Apply built-in anti-herd only in `claim --next --agent ...` path (default 1000ms, configurable, opt-out), not generic list/show commands.
- Consolidate next-task behavior into claim command; remove `task next` registration and docs.
- Use offset pagination (`--page`, `--limit`) for v2 list surfaces to keep the first release simple and predictable.
- Use a hard-cutover compatibility strategy with explicit DB/CLI major-version gating (v1 binaries must fail fast against v2-migrated stores with migration guidance).
- Use an explicit eligibility matrix for `claim --next`: ready status, all dependencies done, and leaf-only claimability.
- Use a concrete `decision_trace` contract with bounded alternatives (max 3) and fixed reason codes.
- Distinguish grouped list vs stats surfaces: `task list --group-by-agent` returns task details grouped by agent; `agent stats` returns counts only.
- Anti-herd formula is deterministic-only (no runtime randomness): `offset_ms = hash(agent + ':' + floor(now_ms / window_ms)) % window_ms`.

## Delivery Plan

One PR with 6 atomic parent tasks, each broken into commit-sized subtasks:
1. Contract foundation (format + envelope + errors)
2. Core service/model migration (`assignee` -> `agent`) and compatibility
3. Claim flow unification (`claim --next`) + decision trace + anti-herd
4. Query enhancements (`--agent-pattern`, pagination/views, grouped output)
5. New `agent stats` namespace and aggregation
6. Removal/migration/documentation/integration hardening

---

## 1. Contract Foundation

### 1.1 Add global output format model (`json` default, `--format md`)

**Depends on:** none
**Files:** `packages/hzl-cli/src/index.ts`, `packages/hzl-cli/src/types.ts`, `packages/hzl-cli/src/types.test.ts`, `packages/hzl-cli/src/index.test.ts`

Replace global `--json` opt-in with `--format <format>` where default is `json` and only supported human mode is `md`. Update global option schema and command bootstrap parsing so command implementations receive normalized format data.

Keep this subtask focused on option parsing and type model only; per-command output adaptation is handled in later subtasks.

**Test scenarios:** (`packages/hzl-cli/src/types.test.ts`)
- No format flag -> parsed format is `json`
- `--format md` -> parsed format is `md`
- Unsupported format value -> validation error with machine-readable error envelope

**Verify:** `pnpm --filter hzl-cli test src/types.test.ts src/index.test.ts`

### 1.2 Introduce stable versioned JSON envelope + shared error envelope

**Depends on:** 1.1
**Files:** `packages/hzl-cli/src/output.ts`, `packages/hzl-cli/src/errors.ts`, `packages/hzl-cli/src/errors.test.ts`, `packages/hzl-cli/src/output.test.ts` (new)

Add shared envelope helpers used by command handlers:
- Success: `{ schema_version, ok: true, data }`
- Error: `{ schema_version, ok: false, error: { code, message, details? } }`

Define compatibility policy in code comments/types for v2 (no breaking envelope shape changes in minor/patch). Ensure `handleError` uses the shared error envelope in JSON mode.

Pattern to follow: current centralized `handleError` and `output.ts` formatter utilities; extend instead of introducing per-command bespoke wrappers.

**Test scenarios:** (`packages/hzl-cli/src/output.test.ts`)
- Success envelope includes `schema_version`, `ok: true`, and `data`
- Error envelope includes `schema_version`, `ok: false`, structured error object
- CLIError exit codes map to stable symbolic/typed error code values
- Unknown errors still return stable envelope shape

**Verify:** `pnpm --filter hzl-cli test src/errors.test.ts src/output.test.ts`

### 1.3 Add global argv migration interception for removed command/flag surfaces

**Depends on:** 1.1, 1.2
**Files:** `packages/hzl-cli/src/index.ts`, `packages/hzl-cli/src/index.test.ts`, `packages/hzl-cli/src/errors.ts`, `packages/hzl-cli/src/__tests__/integration/v2-migration.test.ts` (new)

Add a pre-parse argv compatibility interceptor at CLI entrypoint to catch removed/renamed surfaces before Commander emits default unknown-option/unknown-command errors. This ensures migration hints are consistently returned in the stable error envelope.

Removed/renamed examples to intercept:
- `hzl task next` -> suggest `hzl task claim --next`
- `--json` -> explain JSON is default and suggest `--format md` for human output
- `--assignee` -> suggest `--agent`

**Test scenarios:** (`packages/hzl-cli/src/__tests__/integration/v2-migration.test.ts`)
- `hzl task next` returns structured migration error/hint envelope
- `hzl task claim 123 --json` returns structured migration hint
- `hzl task claim 123 --assignee x` returns structured migration hint
- Unknown unrelated flags still return standard unknown-option error envelope

**Verify:** `pnpm --filter hzl-cli test src/index.test.ts src/__tests__/integration/v2-migration.test.ts`

---

## 2. Core Model + Replay Compatibility (`assignee` -> `agent`)

### 2.1 Add cache migration to rename `tasks_current.assignee` -> `agent`

**Depends on:** none
**Files:** `packages/hzl-core/src/db/schema.ts`, `packages/hzl-core/src/db/migrations/index.ts`, `packages/hzl-core/src/db/migrations/v3.ts` (new), `packages/hzl-core/src/db/migrations.test.ts`

Create a cache DB migration that renames/ports ownership column to `agent` and updates related indexes. Keep migration idempotent for fresh and existing DBs. Ensure schema definition (`CACHE_SCHEMA_V1` or next schema constant) reflects `agent` as canonical field.

Migration strategy should use SQLite-safe pattern compatible with current migration framework (programmatic checks + conditional operations).

**Test scenarios:** (`packages/hzl-core/src/db/migrations.test.ts`)
- Existing DB with `assignee` column migrates to `agent` with data preserved
- Fresh DB gets `agent` column directly
- Re-running migration is safe (no-op)
- Claim-next and list indexes exist after migration

**Verify:** `pnpm --filter hzl-core test src/db/migrations.test.ts`

### 2.2 Update projections/services/types to canonical `agent` field with old-event compatibility

**Depends on:** 2.1
**Files:** `packages/hzl-core/src/projections/tasks-current.ts`, `packages/hzl-core/src/services/task-service.ts`, `packages/hzl-core/src/services/task-service.test.ts`, `packages/hzl-core/src/events/types.ts`, `packages/hzl-core/src/events/types.test.ts`, `packages/hzl-core/src/index.ts`

Update service/read-model interfaces and projector writes to use `agent` as canonical runtime field while replaying historical events that may still include `assignee` data.

Compatibility rule: projector reads `data.agent` if present, otherwise falls back to `data.assignee` for older events. New v2 emissions write `agent` in event data for ownership-bearing events. No dual-write in v2 events.

Also update exported public types to present `agent` field names.

**Test scenarios:** (`packages/hzl-core/src/services/task-service.test.ts`)
- New claim emits and reads `agent`
- Replay of historical event payload containing only `assignee` populates `task.agent`
- Mixed history (old + new events) resolves to latest ownership value
- APIs no longer expose `assignee` in v2-facing task types

**Verify:** `pnpm --filter hzl-core test src/services/task-service.test.ts src/events/types.test.ts`

### 2.3 Execute full surface migration matrix for `assignee` -> `agent`

**Depends on:** 2.2
**Files:** `packages/hzl-cli/src/commands/**/*.ts`, `packages/hzl-cli/src/commands/**/*.test.ts`, `packages/hzl-web/src/server.ts`, `packages/hzl-web/src/server.test.ts`, `packages/hzl-core/src/services/**/*.ts`, `packages/hzl-core/src/services/**/*.test.ts`, `README.md`, `docs-site/**/*.md`

Create and execute a migration matrix that enumerates every `assignee` touchpoint and maps it to v2 behavior (`migrate to agent` or `legacy compatibility path`). This subtask closes scope gaps across CLI, core, and web API.

Minimum matrix coverage:
- CLI flags/fields/options
- TaskService/public types and projections
- Web server response fields and filters
- Integration and unit tests
- User-facing docs and guides

**Test scenarios:** (`packages/hzl-web/src/server.test.ts`)
- Web task and event responses expose `agent` fields where ownership is represented
- No required v2-facing API surface still emits `assignee`
- Legacy event replay still resolves ownership correctly in API responses

**Verify:** `pnpm --filter hzl-core test && pnpm --filter hzl-cli test && pnpm --filter hzl-web test`

### 2.4 Add DB/CLI major-version gate for hard cutover compatibility

**Depends on:** 2.1, 2.2
**Files:** `packages/hzl-cli/src/db.ts`, `packages/hzl-cli/src/config.ts`, `packages/hzl-cli/src/errors.ts`, `packages/hzl-cli/src/__tests__/integration/v2-migration.test.ts`, `packages/hzl-core/src/db/schema.ts`

Implement explicit major-version gating metadata in local/global DB metadata so older CLIs fail fast on v2-upgraded stores with clear migration guidance. This prevents silent mixed-version corruption when v2 starts emitting `agent`-only ownership payloads.

**Test scenarios:** (`packages/hzl-cli/src/__tests__/integration/v2-migration.test.ts`)
- v2-initialized DB records major compatibility marker
- opening v2 DB with simulated pre-v2 compatibility marker mismatch fails with actionable message
- compatibility errors are emitted in stable error envelope shape

**Verify:** `pnpm --filter hzl-cli test src/__tests__/integration/v2-migration.test.ts`

---

## 3. Unified Claim Interface + Selection Intelligence

### 3.1 Fold `next` behavior into `claim --next` and remove `task next`

**Depends on:** 1.1, 2.2
**Files:** `packages/hzl-cli/src/commands/task/claim.ts`, `packages/hzl-cli/src/commands/task/claim.test.ts`, `packages/hzl-cli/src/commands/task/index.ts`, `packages/hzl-cli/src/commands/task/next.ts` (delete), `packages/hzl-cli/src/commands/task/next.test.ts` (delete), `packages/hzl-cli/src/resolve-id.ts`

Extend claim command with mutually-exclusive modes:
- `claim <taskId>` explicit claim
- `claim --next` automatic selection+claim

Keep one command family and remove `task next` registration and command implementation. Update help/errors for invalid combinations (e.g., `<taskId>` with `--next`).

Pattern to follow: reuse current `runClaim` entrypoint and pull in next-selection logic from `runNext` to avoid divergent behaviors.

**Test scenarios:** (`packages/hzl-cli/src/commands/task/claim.test.ts`)
- `claim <id>` still claims ready task
- `claim --next` selects and claims highest-ranked eligible task
- `claim --next --project X` restricts candidate set
- invalid arg combos fail with stable error envelope
- legacy `task next` invocation fails with migration hint

**Verify:** `pnpm --filter hzl-cli test src/commands/task/claim.test.ts`

### 3.2 Add deterministic eligibility+ranking contract and `decision_trace`

**Depends on:** 3.1, 2.2
**Files:** `packages/hzl-core/src/services/task-service.ts`, `packages/hzl-core/src/services/task-service.test.ts`, `packages/hzl-cli/src/commands/task/claim.ts`, `packages/hzl-cli/src/commands/task/claim.test.ts`

Implement canonical selection pipeline:
1. eligibility gate:
   - status must be `ready`
   - all dependencies must be `done`
   - task must be leaf-only (tasks with children are not auto-claim eligible)
   - optional filters (`project`, `parent`, `tags`) applied before ranking
2. ranking (`priority desc -> due_at asc null-last -> created_at asc -> task_id asc`)

Return `decision_trace` for success and failure paths in claim responses using fixed schema:
- `decision_trace.version` (e.g. `v1`)
- `decision_trace.mode` (`explicit` | `next`)
- `decision_trace.filters` (effective filters)
- `decision_trace.eligibility` (applied gate rules)
- `decision_trace.outcome` (`selected` | `rejected`, `reason_code`, `reason`)
- `decision_trace.alternatives` (ranked alternatives with reason, max 3 entries)

Reason codes are explicit and testable (for example: `not_ready`, `dependency_blocked`, `has_children`, `no_candidates`, `claimed`, `claim_failed`).

**Test scenarios:** (`packages/hzl-core/src/services/task-service.test.ts`)
- eligible set excludes blocked/dependency-incomplete tasks
- due date null-last tie-break behaves as specified
- deterministic tie-break on equal priority/due/created using `task_id`

**Test scenarios:** (`packages/hzl-cli/src/commands/task/claim.test.ts`)
- success response includes `decision_trace` with selected task reason
- no-eligible-task response includes failure `decision_trace`
- explicit claim failures include rejection reason in trace envelope

**Verify:** `pnpm --filter hzl-core test src/services/task-service.test.ts && pnpm --filter hzl-cli test src/commands/task/claim.test.ts`

### 3.3 Built-in anti-herd for `claim --next --agent` (default 1000ms)

**Depends on:** 3.1
**Files:** `packages/hzl-cli/src/commands/task/claim.ts`, `packages/hzl-cli/src/commands/task/claim.test.ts`, `packages/hzl-cli/src/config.ts`, `packages/hzl-cli/src/types.ts`, `packages/hzl-cli/src/config.test.ts`

Add automatic pre-selection staggering on auto-claim worker path when agent is provided. Default window: 1000ms, configurable globally; per-call opt-out via `--no-stagger`.

Implementation uses deterministic-only offset formula:
- `bucket = floor(now_ms / window_ms)`
- `offset_ms = hash(agent + ':' + bucket) % window_ms`
- no non-deterministic randomness

Delay must happen before selection query.

Keep behavior scoped to `claim --next` to avoid global CLI sluggishness.

**Test scenarios:** (`packages/hzl-cli/src/commands/task/claim.test.ts`)
- default path applies delay calculation for `--next --agent`
- `--no-stagger` bypasses delay
- custom configured window overrides default
- explicit claim (`claim <id>`) does not stagger
- fixed clock + agent input yields deterministic offset in test

**Verify:** `pnpm --filter hzl-cli test src/commands/task/claim.test.ts src/config.test.ts`

---

## 4. Agent-Centric Query Surface

### 4.1 Add case-insensitive `--agent-pattern` glob matching to task list

**Depends on:** 2.2
**Files:** `packages/hzl-cli/src/commands/task/list.ts`, `packages/hzl-cli/src/commands/task/list.test.ts`, `packages/hzl-core/src/services/task-service.ts`, `packages/hzl-core/src/services/task-service.test.ts`

Add `--agent-pattern '<glob>'` using `*` wildcard semantics (not SQL `%`). Translate glob safely to SQL pattern with escaping for literal wildcard/meta characters and case-insensitive match.

Document and enforce mutual-exclusion/precedence rules between exact `--agent` and pattern flag.

Pattern to follow: existing `resolveTaskId` safe LIKE-escaping approach.

**Test scenarios:** (`packages/hzl-cli/src/commands/task/list.test.ts`)
- exact `--agent` only returns exact matches
- `--agent-pattern 'clara*'` matches clara1/clara2 but not xclara
- `--agent-pattern '*clara*'` matches contains cases
- case-insensitive behavior (`ClArA*` matches `clara1`)
- literal special chars can be escaped and matched

**Verify:** `pnpm --filter hzl-cli test src/commands/task/list.test.ts`

### 4.2 Add pagination + view controls for agent-driven list payloads

**Depends on:** 4.1, 1.2
**Files:** `packages/hzl-cli/src/commands/task/list.ts`, `packages/hzl-cli/src/commands/task/list.test.ts`, `packages/hzl-core/src/services/task-service.ts`, `packages/hzl-core/src/services/task-service.test.ts`

Implement offset pagination (`--page`, `--limit`) and `--view summary|standard|full` response shaping for list queries so agents can reason on manageable payloads. Ensure default view remains compact while preserving full-detail retrieval via `task show <id>`.

Decision: use offset-based pagination (`--page`, `--limit`) consistently across v2 list-like command surfaces.

**Test scenarios:** (`packages/hzl-cli/src/commands/task/list.test.ts`)
- page 1/page 2 return disjoint deterministic sets
- view levels include/exclude large fields as expected
- full view includes markdown description and metadata fields
- pagination metadata is present in JSON envelope (`page`, `limit`, `total`, `has_more`)

**Verify:** `pnpm --filter hzl-cli test src/commands/task/list.test.ts`

### 4.3 Add grouped task-list output by agent (`--group-by-agent`)

**Depends on:** 4.2
**Files:** `packages/hzl-cli/src/commands/task/list.ts`, `packages/hzl-cli/src/commands/task/list.test.ts`, `packages/hzl-core/src/services/task-service.ts`

Add grouped mode for task list output to satisfy PRD grouped task-list surface. This mode returns grouped task details (tasks nested under agent buckets) instead of summary counts-only data. In markdown format, render agent sections with task rows.

Keep grouped mode compatible with explicit filters: `--project`, `--status`, `--agent`, `--agent-pattern`.

**Test scenarios:** (`packages/hzl-cli/src/commands/task/list.test.ts`)
- grouped output nests full task entries under each agent bucket
- unassigned tasks are grouped under explicit null/unassigned bucket
- status-filtered grouped output only includes tasks matching statuses

**Verify:** `pnpm --filter hzl-cli test src/commands/task/list.test.ts`

---

## 5. Dedicated Agent Summary Namespace

### 5.1 Add `hzl agent` command group with `stats` subcommand

**Depends on:** 4.3, 1.2
**Files:** `packages/hzl-cli/src/index.ts`, `packages/hzl-cli/src/commands/agent/index.ts` (new), `packages/hzl-cli/src/commands/agent/stats.ts` (new), `packages/hzl-cli/src/commands/agent/stats.test.ts` (new), `packages/hzl-core/src/services/task-service.ts`, `packages/hzl-core/src/services/task-service.test.ts`

Introduce top-level `agent` namespace and `agent stats` command using shared aggregation primitives from TaskService. This surface returns counts only (no per-task detail payload), including per-agent total and per-status counts, stable ordering, and envelope compliance.

Pattern to follow: existing command namespace structure used by `project` and `task` command trees.

**Test scenarios:** (`packages/hzl-cli/src/commands/agent/stats.test.ts`)
- returns all agents with assigned tasks and correct per-status counts
- supports explicit `--project` and `--status` filters with consistent semantics
- consistent ordering for deterministic snapshots
- JSON envelope compliance (`schema_version`, `ok`, `data`)

**Verify:** `pnpm --filter hzl-cli test src/commands/agent/stats.test.ts`

---

## 6. Migration, Docs, and Integration Hardening

### 6.1 Add v1->v2 migration behavior and deprecation failure messaging

**Depends on:** 1.3, 3.1, 5.1
**Files:** `packages/hzl-cli/src/commands/task/index.ts`, `packages/hzl-cli/src/index.ts`, `packages/hzl-cli/src/__tests__/integration/v2-migration.test.ts` (new), `packages/hzl-cli/src/errors.ts`

Implement explicit failure hints for removed commands/flags (`task next`, `--json`, `--assignee`) with concise migration suggestions via the global argv interception path. Ensure errors still use versioned envelope.

Integration tests should exercise real CLI invocation paths to confirm migration UX and exit-code behavior.

**Test scenarios:** (`packages/hzl-cli/src/__tests__/integration/v2-migration.test.ts`)
- `task next` returns migration hint to `task claim --next`
- `--json` usage returns migration hint to `--format md`/default json behavior
- `--assignee` usage returns migration hint to `--agent`
- each removed surface returns stable error envelope and non-zero exit

**Verify:** `pnpm --filter hzl-cli test src/__tests__/integration/v2-migration.test.ts`

### 6.2 Update docs, guide content, and snippets for v2 CLI contract

**Depends on:** 6.1
**Files:** `README.md`, `docs-site/reference/cli.md`, `docs-site/workflows/single-agent.md`, `docs-site/workflows/multi-agent.md`, `docs-site/concepts/tasks.md`, `snippets/HZL-GUIDE.md`, `snippets/AGENT-POLICY.md`, `skills/hzl/SKILL.md`, `openclaw/skills/hzl/SKILL.md`, `packages/hzl-cli/src/commands/guide-content.ts`

Apply documentation checklist from AGENTS.md for CLI behavior changes. Replace `next` examples with unified claim flows; update format defaults; adopt `agent` terminology; add `agent-pattern` and grouped summaries.

**Test scenarios:** (doc validation/manual review)
- `hzl guide` reflects v2 commands and flags
- docs have no stale references to `task next`, `--json`, or `--assignee`
- examples are internally consistent across README/docs-site/skills

**Verify:** `pnpm --filter hzl-cli test src/commands/guide.test.ts` and targeted grep checks for removed flags/commands

### 6.3 End-to-end regression pass for agent workflows

**Depends on:** 6.2
**Files:** `packages/hzl-cli/src/__tests__/integration/agent-workflows-v2.test.ts` (new), `packages/hzl-cli/src/__tests__/integration/helpers.ts`

Add a focused integration suite for key workflows in PRD:
- auto-claim path with decision trace
- agent-driven list+show+claim path
- pattern-based query path
- agent stats and grouped list summaries
- envelope consistency and md formatting fallback

This suite serves as a contract test guardrail for future minor releases.

**Test scenarios:** (`packages/hzl-cli/src/__tests__/integration/agent-workflows-v2.test.ts`)
- worker loop: `claim --next --agent` claims eligible task and returns trace
- manual reasoning path: `list --agent-pattern`, choose task, `claim <id>`
- grouped and dedicated agent summaries produce consistent totals
- all JSON outputs include schema/versioned envelope

**Verify:** `pnpm --filter hzl-cli test src/__tests__/integration/agent-workflows-v2.test.ts`

### 6.4 Add repo-wide migration guardrails and cross-package regression matrix

**Depends on:** 2.3, 6.3
**Files:** `packages/hzl-cli/src/__tests__/integration/`, `packages/hzl-core/src/__tests__/`, `packages/hzl-web/src/server.test.ts`, `package.json`, `README.md`, `docs-site/reference/cli.md`

Add a final migration guard step that validates no unintended v2-facing `assignee`/`--json` remnants remain and that core/web/cli suites pass with the new contract.

Guardrails:
- targeted grep assertions in test scripts for stale v2-facing terms where prohibited
- explicit cross-package regression run (`hzl-core`, `hzl-cli`, `hzl-web`)
- migration test matrix summary in plan implementation notes

**Test scenarios:** (cross-package test execution)
- CLI, core, and web tests pass together after migration
- guard checks fail if deprecated v2-facing CLI flags/fields are reintroduced

**Verify:** `pnpm test` and guard script checks

## Testing Strategy

- New coverage:
  - contract-level JSON envelope stability and version field behavior
  - decision trace success/failure payloads
  - anti-herd scoped behavior and configuration
  - `assignee` historical replay compatibility into `agent`
  - command-surface migrations (`next` removal, renamed flags)
  - global command-family migration from `--json` to default JSON + `--format md`
  - web API and cross-package consistency for `agent` field naming
- Unit tests:
  - `hzl-core` TaskService ranking, filtering, aggregation, migration compatibility
  - `hzl-cli` command option parsing, output envelopes, grouped summaries
- Integration tests:
  - end-to-end CLI workflow validation in isolated DB contexts
  - migration/error UX checks for removed surfaces
  - hard-cutover DB/CLI major-version gate behavior
- Manual verification:
  - run representative v2 commands from built CLI and inspect both JSON envelope and `--format md` output for readability

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `assignee` -> `agent` rename breaks replay or old data visibility | Add projector fallback for historical `assignee` event payloads and migration tests that replay mixed old/new events |
| Partial migration leaves inconsistent naming between CLI/core/web | Run matrix-driven migration subtask across all surfaces and validate with cross-package regression tests |
| Broad JSON envelope migration causes noisy regressions across many commands | Introduce shared output helper first, migrate command families incrementally, and add contract-focused integration tests |
| Anti-herd delay harms interactive workflows | Scope built-in stagger only to `claim --next --agent` path; provide explicit `--no-stagger` opt-out |
| Removing `task next` disrupts existing scripts | Provide clear migration error messages and docs updates; include integration tests for migration hints |
| Pattern matching introduces SQL escaping bugs | Reuse existing LIKE-escape patterns (`resolveTaskId`) and add explicit escaping/quoting tests for `--agent-pattern` |
| Mixed v1/v2 clients write incompatible ownership event keys | Enforce hard DB/CLI major-version gate and fail fast with migration guidance |

## Open Questions

None — all implementation decisions resolved.
