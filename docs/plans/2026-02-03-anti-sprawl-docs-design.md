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

Update 4 files with a tiered approach based on Anthropic's skill best practices.

### Tier 1: Always-Present (Concise)

These files are always loaded, so keep them brief and don't duplicate skill content.

Per [Anthropic's skill best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices):
> "The context window is a public good. Only add context Claude doesn't already have."

**`docs/snippets/agent-policy.md`:**
- Add punchy anti-pattern warning with minimal wrong/right example
- Strengthen workflow to emphasize checking for existing projects first
- **Remove command reference** (belongs in skill, not always-present docs)

**`docs/openclaw/tools-prompt.md`:**
- Fix incorrect "one project per request" guidance
- Establish single `openclaw` project model
- Reference the skill for command syntax (don't duplicate)

### Tier 2: On-Demand Skills (Detailed)

These files are loaded when working with HZL, so they can be thorough.

Per [Claude Code skills docs](https://code.claude.com/docs/en/skills):
> "At startup, only the metadata (name and description) from all Skills is pre-loaded. Claude reads SKILL.md only when the Skill becomes relevant."

**`skills/hzl/SKILL.md`:**
- Add "Anti-pattern: Project Sprawl" section with full wrong/right examples
- Add "Sizing Parent Tasks" section with completability test
- Mention `--links` for additional context
- Contains full command reference (this is where it belongs)

**`docs/openclaw/skills/hzl/SKILL.md`:**
- Same sections as above
- OpenClaw-specific framing: single `openclaw` project, not repo-bound

## Key Principles

1. **Projects are stable containers** - One per repo (Claude Code/Codex) or single `openclaw` (OpenClaw)
2. **Features are parent tasks, not projects** - Prevents sprawl
3. **Scope by problem, not technical layer** - Shape Up methodology
4. **Completability test** - "I finished [parent task]" should describe a real outcome
5. **Use `--links` for context** - When description isn't enough

## Documentation Architecture Learnings

### AGENTS.md vs Skills

| Layer | Purpose | Content |
|-------|---------|---------|
| AGENTS.md / tools-prompt.md | Always-present context | When to use, anti-patterns, workflow (high-level) |
| SKILL.md | On-demand when relevant | Command syntax, detailed patterns, scenarios |

**Key insight:** Command references belong in skills, not always-present docs. Claude discovers skills via description matching—no need to explicitly mention the skill in AGENTS.md.

### OpenClaw vs Claude Code

| Context | Project Model | Reason |
|---------|--------------|--------|
| Claude Code / Codex | One per repo | Running in repo context |
| OpenClaw | Single `openclaw` project | Not repo-bound; simplifies `hzl task next` |

## Implementation Summary

| Commit | Changes |
|--------|---------|
| `aee38f5` | Add anti-sprawl guidance (anti-pattern + sizing sections) |
| `c2dc340` | Remove command reference from agent-policy (belongs in skill) |

## Files Changed

- `docs/snippets/agent-policy.md` - Anti-pattern warning, workflow, removed commands
- `docs/openclaw/tools-prompt.md` - Single project model, skill reference
- `skills/hzl/SKILL.md` - Full anti-pattern + sizing sections
- `docs/openclaw/skills/hzl/SKILL.md` - OpenClaw-specific framing
- `AGENTS.md`, `README.md` - Auto-synced from snippet
