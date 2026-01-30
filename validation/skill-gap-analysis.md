# Skill Gap Analysis

## Current Skills

| Skill | Purpose | Completeness |
|-------|---------|--------------|
| `orchestrator.md` | Break down work, spawn workers, monitor | ✅ Good |
| `worker.md` | Claim → work → report loop | ✅ Good |
| `writing-tasks.md` | Task description best practices | ✅ Good |
| `status-reports.md` | Human-friendly progress formatting | ✅ Good |
| `troubleshooting.md` | Error diagnosis and recovery | ✅ Good |

---

## Identified Gaps

### 1. **Plan-to-Implementation Skill** (RECOMMENDED)

**Problem**: The orchestrator knows how to *create* tasks, but not how to *translate a plan into the right task breakdown*.

**Symptom**: 
- An agent given a high-level plan (like your `2026-01-29-hzl-implementation.md`) doesn't know **how granular** to make tasks
- No guidance on **dependency structure** for phased work
- No examples of **real plan → task tree** transformations

**Recommendation**: Create `skills/plan-to-tasks.md`

```markdown
---
description: How to convert an implementation plan into HZL tasks
---

# Plan-to-Tasks Skill

## Input: A Markdown Implementation Plan

Plans typically have:
- Phases (Phase 1, Phase 2...)
- Tasks within phases
- Ordered steps within tasks
- Code snippets, file paths, verification steps

## Output: HZL Task Tree

### Rules

1. **One HZL task = one atomic deliverable** (15-60 min)
2. **Phase = dependency boundary** (Phase 2 tasks depend on Phase 1)
3. **Steps within a plan task = one HZL task** (not sub-tasks)
4. **Include file paths in description**
5. **Copy verification command into description**

### Example Transformation

**Plan Input:**
```markdown
## Phase 1: Setup
### Task 1: Initialize Monorepo
- Create package.json
- Create tsconfig.json
- Run npm install
- Commit

### Task 2: Database Schema
- Create schema.ts
- Create migrations.ts
- Write tests
- Run tests
```

**HZL Output:**
```bash
# Phase 1 tasks (no dependencies)
hzl task create "Initialize TypeScript monorepo" \
  --project=hzl \
  --description="Create package.json, tsconfig.json, run npm install.\nVerify: npm install succeeds." \
  --priority=3

hzl task create "Implement database schema and migrations" \
  --project=hzl \
  --depends-on=<monorepo-task-id> \
  --description="Files: packages/hzl-core/src/db/schema.ts, migrations.ts\nVerify: npm test passes" \
  --priority=2
```

### When to Split

Split a plan task into multiple HZL tasks if:
- It touches 3+ distinct files
- It has 5+ steps
- It could be done by different specialists (schema vs. API vs. tests)

### When to Combine

Combine plan steps into one HZL task if:
- They're all in one file
- They take <15 min combined
- Doing them separately creates thrashing
```

---

### 2. **Skill Selection Guide** (NICE TO HAVE)

**Problem**: Agents don't know which skill to use when.

**Recommendation**: Add to AGENTS.md or create `skills/index.md`:

```markdown
## Role Selection

Pick your skill based on your job:

| Your Job | Use This Skill |
|----------|----------------|
| Breaking down a plan into tasks | `skills/plan-to-tasks.md` |
| Managing a swarm of workers | `skills/orchestrator.md` |
| Claiming and completing tasks | `skills/worker.md` |
| Writing clear task descriptions | `skills/writing-tasks.md` |
| Generating progress reports | `skills/status-reports.md` |
| Diagnosing problems | `skills/troubleshooting.md` |
```

---

### 3. **Specialized Worker Skills** (FUTURE)

As the system matures, consider:

- `skills/code-review.md` — For review tasks
- `skills/testing.md` — For test-writing tasks
- `skills/documentation.md` — For docs tasks

These would be referenced by tag:
```bash
hzl task create "Write API docs" --tags=documentation
```

Worker prompt:
```markdown
You specialize in docs. See `skills/documentation.md`.
```

---

## Priority Order

1. **HIGH**: Create `skills/plan-to-tasks.md` — Fills critical gap
2. **MEDIUM**: Add role selection to AGENTS.md — Reduces confusion
3. **LOW**: Specialized worker skills — Wait for usage patterns

---

## Implementation Suggestion

Create `skills/plan-to-tasks.md` with this structure:

```yaml
---
description: How to convert implementation plans into granular HZL tasks
---

# Plan-to-Tasks Skill

## When to Use
- Given a markdown implementation plan
- Need to load work into HZL for workers

## Input Format
- Markdown with Phases and Tasks
- Code snippets and file paths
- Verification commands

## Output Format
- `hzl task create` commands
- Proper `--depends-on` chains
- Descriptions with Context/Files/Verify

## Transformation Rules
1. One task = one atomic outcome
2. Phase boundaries = dependency edges
3. Copy file paths into descriptions
4. Copy verification commands
5. 15-60 min per task

## Examples
[Detailed example transformations]
```

---

## Do We *Need* This Skill?

**Yes**, for these reasons:

1. **Current workflow gap**: The `orchestrator.md` assumes tasks already exist
2. **Plan documents are common**: Many users will provide markdown plans
3. **Consistency**: Without guidance, agents create inconsistent task structures
4. **Traceability**: Good task descriptions link back to plan sections

**Alternative**: Instead of a new skill, you could:
- Add a "From Plans" section to `orchestrator.md`
- Provide plan templates with embedded HZL commands

But a dedicated skill is cleaner and more discoverable.
