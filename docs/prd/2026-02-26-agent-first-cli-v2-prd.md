# Agent-First CLI v2 - PRD

**Date:** 2026-02-26
**Status:** Brainstorming

## Goal

Make HZL v2 the default task ledger interface for AI agents by reducing command ambiguity, reducing polling friction in CLI-only environments, and improving machine-oriented query/response contracts while keeping agent autonomy for prioritization.

## Scope

### In Scope

- Major-version CLI redesign focused on agent usage (breaking changes allowed)
- Unify claiming interface around one verb family:
  - Claim by explicit task ID
  - Claim by automatic selection (`--next` mode)
- Default JSON responses for all commands, with explicit human format option
- Agent-oriented task querying improvements:
  - Query assigned tasks by exact agent ID
  - Query assigned tasks by case-insensitive pattern
  - Pagination and payload-size controls for assigned-task queries
  - Full task-detail retrieval by task ID
- CLI-only polling improvements for multi-agent cron setups, including anti-herd behavior guidance and contract
- Stable, documented ranking behavior for automatic task selection (priority-led)
- Migration guidance for v1 -> v2 command/flag/output changes

### Boundaries

- **No daemon or watch/streaming subsystem in v2**: v2 remains CLI-only; realtime push can be evaluated later.
- **No agent registration/authentication system**: agent identity remains honor-system string input in trusted environments.
- **No assignment hard enforcement**: assignment metadata is advisory/observability, not a claim gate.
- **No forced centralized prioritization policy for all agents**: automatic selection exists, but agents may still use their own selection logic.
- **No compatibility shim**: this is an immediate cutover major release.

## Requirements

| ID | Priority | Requirement |
|----|----------|-------------|
| R1 | Core | v2 must provide a single, unambiguous claiming interface where claiming by ID and claiming the next ranked task are both part of the same command family, and `task next` is removed. |
| R2 | Core | v2 must default to JSON output across the CLI so agents can reliably parse responses without opt-in flags, and human-readable output is explicit via `--format md`. |
| R3 | Must | v2 automatic claim selection must use a documented eligibility gate (claimable status, dependencies satisfied, and parent/child eligibility rules) before deterministic ranking, with ranking order `priority desc -> due_at asc (null last) -> created_at asc -> task_id asc`. |
| R4 | Must | v2 must support agent-driven selection by listing assigned tasks with pagination and view-level controls to manage payload size. |
| R5 | Must | v2 assigned-task queries must support exact agent matching and case-insensitive `--agent-pattern` glob matching using `*` wildcard syntax (not SQL `%`), including documented escaping and quoting behavior. |
| R6 | Must | v2 must preserve full task retrieval by task ID with complete task context for agent reasoning. |
| R7 | Must | v2 must support CLI-only cron polling workflows with built-in anti-herd behavior enabled by default for auto-claim worker selection (`task claim --next --agent ...`), using a default 1000ms stagger window, configurable globally, with per-call opt-out. |
| R8 | Must | v2 must use `agent` terminology in command interfaces for AI-agent-first clarity. |
| R9 | Must | v2 must publish a breaking-change migration guide that maps removed/renamed v1 commands and flags to v2 equivalents. |
| R10 | Must | v2 must provide per-agent workload summaries in two surfaces: a dedicated `agent` namespace summary interface (for example `agent stats`) and a task-query grouping mode (for example `task list --group-by-agent`). |
| R13 | Must | v2 JSON responses must use a stable, versioned machine contract with documented success/error envelopes and backward-compatibility guarantees within major version v2. |
| R14 | Core | v2 claim operations must return a stable, versioned machine-readable `decision_trace` in both success and failure paths, including eligibility checks, ranking version, selection/rejection reason, and concise alternative-candidate rationale. |
| R11 | Out | v2 does not introduce daemon-based push/watch delivery semantics; these are deferred to a future iteration. |
| R12 | Out | v2 does not introduce an agent registration/permission model; enforcement without authentication is explicitly out of scope. |

## Chosen Direction

Use a CLI-first hard reset for v2 with protocol-quality JSON contracts: one claiming mental model, JSON-by-default outputs, and stronger query surfaces for both automated and self-directed agents. The system remains polling-based and CLI-only in v2, with anti-herd patterns to keep cron-driven multi-agent operation practical without introducing daemon complexity.

## Alternatives Considered

- **Add intent workflows but retain most v1 surface** — Rejected because it keeps dual mental models and command ambiguity during high-frequency agent use.
- **Daemon/watch-first architecture in v2** — Rejected because it increases operational and protocol complexity before validating the simplified CLI contract.
- **Agent registration model** — Rejected because, without authentication, it adds lifecycle overhead but does not create meaningful enforcement in trusted environments.

## Key Decisions

- **Immediate major cutover**: v2 can remove/rename legacy interfaces directly rather than carrying compatibility shims.
- **Unified claim UX**: automatic and explicit claiming are one concept, not separate command families, and `task next` is removed.
- **JSON-first contract**: human-readable output is explicit (`--format md`), not default.
- **Agent autonomy preserved**: HZL supports auto-selection and query tools, but does not force one prioritization policy for all agents.
- **Assignment as metadata, not gate**: claim lock semantics remain authoritative; assignment primarily supports coordination and observability.
- **Wildcard behavior via pattern flag**: `--agent-pattern` is case-insensitive glob matching with `*` syntax in the user contract.
- **Deterministic next-task ordering**: automatic selection first applies claim-eligibility gates, then uses `priority desc -> due_at asc (null last) -> created_at asc -> task_id asc`.
- **Anti-herd default behavior**: staggering is automatic for `claim --next` agent worker selection, with 1000ms default window and explicit opt-out.
- **Agent summary location**: per-agent workload summaries are available both in a dedicated `agent` namespace and as grouped task-list output (`--group-by-agent`).
- **Versioned JSON envelope**: machine outputs are contract-stable and versioned across v2 minors/patches.
- **Decision trace as first-class machine output**: claim-selection outcomes include a structured `decision_trace` so agents can reason about why a task was selected or rejected and adapt without extra probing calls.

## Next Steps

-> Create technical plan for v2 CLI surface changes, JSON contract definitions, migration plan, and test strategy.
