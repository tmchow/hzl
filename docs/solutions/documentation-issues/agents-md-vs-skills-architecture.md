---
id: agents-md-vs-skills-architecture
title: "AGENTS.md vs Skills: Tiered Documentation Architecture"
problem_type: documentation-issues
module: hzl-core, hzl-cli
component: task-organization, project-structure, documentation
severity: medium
tags:
  - project-sprawl
  - task-hierarchy
  - agent-guidance
  - skills-architecture
  - anthropic-best-practices
  - documentation-tiering
symptoms:
  - AI agents creating new projects for each feature/concern
  - Fragmented task database across multiple project containers
  - Command references duplicated across always-present and on-demand docs
  - Documentation not following Anthropic skill best practices
date_added: 2026-02-03
status: resolved
---

# AGENTS.md vs Skills: Tiered Documentation Architecture

## Problem

An AI agent was asked to track 3 related tasks using HZL. Despite documentation saying "do not create per-feature projects," the agent created a new project called `query-perf` instead of using parent tasks within a repo-level project.

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

## Root Cause Analysis

Four underlying issues contributed to the failure:

1. **Anti-pattern warning buried in prose** - The warning was present but not prominent enough to override an agent's intuitive assumption
2. **No explicit wrong/right examples** - Abstract warnings are less effective than concrete comparisons
3. **Missing sizing guidance** - Agents lacked criteria for determining appropriate parent task scope
4. **Command references in wrong place** - AGENTS.md included command syntax that belongs in skills (wastes context, duplicates content)

## Solution

Implemented a **tiered documentation architecture** based on [Anthropic's skill best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices).

### Key Insight: Progressive Disclosure

From Anthropic's documentation:
> "The context window is a public good. Your Skill shares the context window with everything else Claude needs to know."

> "At startup, only the metadata (name and description) from all Skills is pre-loaded. Claude reads SKILL.md only when the Skill becomes relevant."

This means:
- **Always-present docs** (AGENTS.md, tools-prompt.md) should be concise
- **On-demand skills** (SKILL.md) can be thorough with full command references
- Don't duplicate content between tiers

### Tier 1: Always-Present (Concise)

Files always loaded, kept brief without duplicating skill content.

**`docs/snippets/agent-policy.md`** (syncs to AGENTS.md, README.md):
- When to use HZL (decision criteria)
- Anti-pattern warning with minimal wrong/right example
- Workflow steps (high-level process)
- Destructive command warning
- **No command reference** (belongs in skill)

**`docs/openclaw/tools-prompt.md`**:
- Single `openclaw` project model (OpenClaw-specific)
- References skill for command syntax
- Completability test for parent task naming

### Tier 2: On-Demand Skills (Detailed)

Files loaded only when HZL skill becomes relevant.

**`skills/hzl/SKILL.md`** and **`docs/openclaw/skills/hzl/SKILL.md`**:
- Full "Anti-pattern: Project Sprawl" section with detailed examples
- "Sizing Parent Tasks" section with completability test
- Complete command reference (where it belongs)
- `--links` guidance for adding context

## Documentation Architecture

| Layer | Purpose | Content |
|-------|---------|---------|
| AGENTS.md / tools-prompt.md | Always-present context | When to use, anti-patterns, workflow (high-level) |
| SKILL.md | On-demand when relevant | Command syntax, detailed patterns, scenarios |

**Why this works:** Claude discovers skills via description matching. No need to explicitly mention skills in AGENTS.md—this happens automatically.

## Key Principles Established

### 1. Projects are Stable Containers

| Context | Project Model | Reason |
|---------|---------------|--------|
| Claude Code / Codex | One per repo | Running in repo context |
| OpenClaw | Single `openclaw` project | Not repo-bound; simplifies `hzl task next` |

### 2. Features are Parent Tasks, Not Projects

Prevents sprawl. Projects accumulate forever; parent tasks complete and archive naturally.

### 3. Completability Test

"I finished [parent task]" should describe a real outcome:
- ✓ "Finished the user authentication feature"
- ✗ "Finished the backend work" (frontend still pending)
- ✗ "Finished home automation" (open-ended, never done)

### 4. Scope by Problem, Not Technical Layer

Shape Up methodology. A full-stack feature (frontend + backend + tests) is usually one parent if it ships together.

## Prevention Strategies

### Structural Prevention

1. **Two-tier architecture** - Separates concerns between always-present guidance and on-demand reference
2. **Snippet sync system** - Automation keeps policy consistent across AGENTS.md, README.md via `node scripts/sync-snippets.js`
3. **Single source of truth** - Edit `docs/snippets/agent-policy.md`, not synced files

### Documentation Checklist

When adding or modifying CLI commands:

| Document | What to update |
|----------|----------------|
| `docs/snippets/agent-policy.md` | High-level workflow only |
| `skills/hzl/SKILL.md` | Full command reference |
| `docs/openclaw/skills/hzl/SKILL.md` | OpenClaw-specific version |

## Implementation

**Commit 1: `aee38f5`** - Add anti-sprawl guidance
- Added anti-pattern sections to both SKILL.md files
- Added sizing guidance with completability test
- Fixed tools-prompt.md OpenClaw guidance

**Commit 2: `c2dc340`** - Remove command reference from always-present docs
- Per Anthropic best practices, commands belong in skills
- Reduces context window pollution
- Agents discover skills automatically

## Files Changed

- `docs/snippets/agent-policy.md` - Anti-pattern warning, workflow, removed commands
- `docs/openclaw/tools-prompt.md` - Single project model, skill reference
- `skills/hzl/SKILL.md` - Full anti-pattern + sizing sections
- `docs/openclaw/skills/hzl/SKILL.md` - OpenClaw-specific framing
- `AGENTS.md`, `README.md` - Auto-synced from snippet

## Related Documentation

- [Anti-Sprawl Design Doc](../plans/2026-02-03-anti-sprawl-docs-design.md) - Original design document
- [Coding Agent Support Patterns](best-practices/coding-agent-support-patterns.md) - Multi-agent patterns
- [Snippet Sync System](documentation/snippet-sync-system-design.md) - Automation details
- [Anthropic Skill Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) - Source guidance

## Lessons Learned

1. **Always-present docs should answer "when" and "what not to do"** - Leave "how" to on-demand skills
2. **Command references waste context when always loaded** - Skills are the right place
3. **Wrong/right examples are more effective than prose warnings** - Show, don't tell
4. **Different agent contexts need different guidance** - OpenClaw (single project) vs Claude Code (per-repo)
5. **Anthropic's skill best practices are well-documented** - Follow them for optimal agent behavior
