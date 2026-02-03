# Anti-Sprawl Documentation Design

## Problem

An AI agent was asked to track 3 related tasks using HZL. Despite documentation saying "do not create per-feature projects," the agent created a new project called `query-perf` instead of using a repo-level project with a parent task and subtasks.

**What the agent did (wrong):**
```bash
hzl project create "query-perf"
hzl task add "Fix search N+1" -P query-perf
hzl task add "Cache statement" -P query-perf
```

**What it should have done:**
```bash
hzl task add "Query performance fixes" -P myrepo
hzl task add "Fix search N+1" --parent <parent-id>
hzl task add "Cache statement" --parent <parent-id>
```

## Root Cause

1. Anti-pattern warning isn't prominent enough (buried in prose)
2. No explicit wrong/right examples
3. No guidance on sizing parent tasks
4. OpenClaw's tools-prompt.md had incorrect guidance ("one project per request")

## Solution

Update 4 files with a tiered approach:

### Tier 1: Always-Present (Concise)

These files are always loaded, so keep them brief and don't duplicate skill content.

**`docs/snippets/agent-policy.md`:**
- Add punchy anti-pattern warning with minimal wrong/right example
- Strengthen workflow to emphasize checking for existing projects first

**`docs/openclaw/tools-prompt.md`:**
- Fix incorrect "one project per request" guidance
- Establish single `openclaw` project model
- Add minimal anti-pattern warning

### Tier 2: On-Demand Skills (Detailed)

These files are loaded when working with HZL, so they can be thorough.

**`skills/hzl/SKILL.md`:**
- Add "Anti-pattern: Project Sprawl" section with full wrong/right examples
- Add "Sizing Parent Tasks" section with completability test
- Mention `--links` for additional context

**`docs/openclaw/skills/hzl/SKILL.md`:**
- Same sections as above
- OpenClaw-specific framing: single `openclaw` project, not repo-bound

## Key Principles

1. **Projects are stable containers** - One per repo (Claude Code/Codex) or single `openclaw` (OpenClaw)
2. **Features are parent tasks, not projects** - Prevents sprawl
3. **Scope by problem, not technical layer** - Shape Up methodology
4. **Completability test** - "I finished [parent task]" should describe a real outcome
5. **Use `--links` for context** - When description isn't enough

## Implementation Plan

1. Update `docs/snippets/agent-policy.md`
2. Update `docs/openclaw/tools-prompt.md`
3. Update `skills/hzl/SKILL.md`
4. Update `docs/openclaw/skills/hzl/SKILL.md`
5. Run snippet sync script to propagate agent-policy.md changes
6. Commit with conventional commit message
