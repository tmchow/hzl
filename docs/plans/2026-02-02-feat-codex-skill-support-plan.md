---
title: "feat: Add Codex skill support with repo restructure"
type: feat
date: 2026-02-02
brainstorm: docs/brainstorms/2026-02-02-codex-skill-support-brainstorm.md
---

# feat: Add Codex skill support with repo restructure

## Overview

Add OpenAI Codex CLI support for HZL skills by restructuring the repo to have a single source of truth (`skills/hzl/SKILL.md`), adding Codex bootstrap instructions, and updating documentation for both platforms.

## Problem Statement / Motivation

Currently, HZL only supports Claude Code via a marketplace structure in `packages/hzl-marketplace/`. OpenAI's Codex CLI supports an identical SKILL.md format, but there's no installation path for Codex users.

Additionally:
- The skill name `hzl-task-management` is redundant (HZL IS task management)
- The marketplace structure is overly nested for a single skill
- The `packages/hzl-marketplace/` approach doesn't follow the proven [obra/superpowers](https://github.com/obra/superpowers) pattern

## Proposed Solution

1. **Restructure**: Move `.claude-plugin/` and skill to repo root, delete `packages/hzl-marketplace/`
2. **Rename**: `hzl-task-management` → `hzl`
3. **Add Codex**: Create `.codex/INSTALL.md` with bootstrap instructions
4. **Update docs**: README, snippets, and OpenClaw skill with updated guidance

## Technical Considerations

### Directory Structure Conflict

The root `/skills/` directory currently contains documentation files (not Claude Code skills):
- `skills/orchestrator.md`
- `skills/worker.md`
- `skills/planning.md`
- etc.

**Decision**: Move these to `skills_backup/` to avoid any potential conflict with Claude Code skill discovery. The Claude Code skill goes in `skills/hzl/SKILL.md`.

### Migration for Existing Claude Code Users (Minor)

Most users won't need migration. For the few with the old plugin installed (`hzl@hzl-marketplace`):

**Migration steps** (brief note in README):
```bash
# Remove old installation
/plugin uninstall hzl@hzl-marketplace
/plugin marketplace remove hzl-marketplace

# Install new structure
/plugin marketplace add tmchow/hzl
/plugin install hzl@hzl
```

### Install Command Change

| Before | After |
|--------|-------|
| `/plugin marketplace add tmchow/hzl` | `/plugin marketplace add tmchow/hzl` |
| `/plugin install hzl@hzl-marketplace` | `/plugin install hzl@hzl` |

The marketplace name changes from `hzl-marketplace` to `hzl` (matching plugin name).

## Acceptance Criteria

### Core Functionality
- [x] Single `skills/hzl/SKILL.md` serves both Claude Code and Codex
- [ ] Claude Code install works: `/plugin marketplace add tmchow/hzl && /plugin install hzl@hzl`
- [x] Codex install works via prompt injection (fetch INSTALL.md)
- [x] Codex install works via manual curl command
- [x] Skill name in frontmatter is `hzl` (not `hzl-task-management`)
- [x] `.claude-plugin/plugin.json` version synced with CLI via release script
- [x] Existing `skills/*.md` files moved to `skills_backup/`

### Documentation
- [x] README has Claude Code and Codex install sections
- [x] README has brief migration note for existing users (minor)
- [x] `.codex/INSTALL.md` has security warning about prompt injection
- [x] `docs/snippets/coding-agent-setup.md` updated for both platforms
- [x] OpenClaw skill has stronger "when to use" guidance
- [x] AGENTS.md documentation table updated with new paths

### Cleanup
- [x] `packages/hzl-marketplace/` directory deleted
- [x] No broken links in documentation

### Verification
- [x] Snippet sync passes: `node scripts/sync-snippets.js --check`
- [x] `npm run lint` passes
- [x] `npm run typecheck` passes

## Success Metrics

- Codex users can install HZL skill in < 2 minutes
- No duplicate skill content between Claude Code and Codex
- Existing Claude Code users can migrate with documented steps

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| Breaking existing Claude Code installations | Document migration path prominently |
| Codex prompt injection security concerns | Clear security warning in docs |
| Users confused by install command change | Migration section in README |

## Implementation Phases

### Phase 1: Restructure (Core Changes)

**Files to create:**

1. `.claude-plugin/marketplace.json`
```json
{
  "name": "hzl",
  "description": "HZL task tracking for coding agents",
  "owner": {
    "name": "Trevin Chow",
    "url": "https://github.com/tmchow"
  },
  "plugins": [
    {
      "name": "hzl",
      "description": "HZL task management skill for multi-session, multi-agent workflows",
      "source": "./"
    }
  ]
}
```

2. `.claude-plugin/plugin.json`
```json
{
  "name": "hzl",
  "version": "1.12.5",
  "description": "HZL task management skill for multi-session, multi-agent workflows",
  "author": {
    "name": "Trevin Chow",
    "url": "https://github.com/tmchow"
  },
  "repository": "https://github.com/tmchow/hzl",
  "license": "MIT",
  "keywords": ["hzl", "tasks", "agents", "tracking"],
  "skills": "./skills/"
}
```

**Note:** Version must stay in sync with CLI releases. Update `scripts/release.js` or equivalent to bump `.claude-plugin/plugin.json` version alongside `packages/hzl-cli/package.json`.

3. `skills/hzl/SKILL.md`
   - Copy from `packages/hzl-marketplace/plugins/hzl/skills/hzl-task-management/SKILL.md`
   - Change frontmatter `name:` from `hzl-task-management` to `hzl`
   - Add enhanced "When to use HZL" section with encourage-not-force philosophy

**Files to move:**
- `skills/*.md` → `skills_backup/` (orchestrator.md, worker.md, planning.md, etc.)

**Files to delete:**
- `packages/hzl-marketplace/` (entire directory)

**Files to modify:**
- Update existing root `.claude-plugin/marketplace.json` (already exists, needs new content)
- Update release script to bump `.claude-plugin/plugin.json` version

### Phase 2: Codex Support

**Create `.codex/INSTALL.md`:**

```markdown
# Installing HZL Skill for Codex

Add HZL task tracking capabilities to OpenAI Codex CLI.

## Quick Install (Prompt Injection)

Tell Codex:

> Fetch and follow instructions from https://raw.githubusercontent.com/tmchow/hzl/main/.codex/INSTALL.md

**Security note:** This uses prompt injection to instruct Codex to modify your
`~/.codex/AGENTS.md` file. Review the steps below if you prefer manual installation.

## Manual Installation

### Step 1: Download the skill

```bash
mkdir -p ~/.codex/skills/hzl
curl -o ~/.codex/skills/hzl/SKILL.md \
  https://raw.githubusercontent.com/tmchow/hzl/main/skills/hzl/SKILL.md
```

### Step 2: Update ~/.codex/AGENTS.md

Append this section to your `~/.codex/AGENTS.md` (place it where it makes sense in your existing structure):

```markdown
## HZL Task Tracking

<EXTREMELY_IMPORTANT>
You have the HZL skill (`$hzl`) for persistent, structured task tracking.

**HZL excels at (strongly consider using it for):**
- Complex plans with **nesting** (parent tasks + subtasks)
- Tasks with **dependencies** (task B waits for task A)
- Need **visibility** into progress (web dashboard at `hzl serve`)
- **Long-running work** where checkpoints help track progress
- Work spanning **multiple sessions** or days
- **Multi-agent** coordination

**Your native tools (`update_plan`) may be fine for:**
- Simple flat checklists
- Quick ephemeral notes within a short session
- Trivial tasks that don't need persistence

**Key differences:**
- HZL persists across sessions; `update_plan` is session-local
- HZL supports nesting and dependencies; native tools are flat
- HZL has a web dashboard; native tools are context-only

Use your judgment. For anything non-trivial, HZL is usually the better choice.

Skill location: ~/.codex/skills/hzl/SKILL.md
Invoke with `$hzl` to load full instructions.
</EXTREMELY_IMPORTANT>
```

## Verification

Check the skill is installed:

```bash
cat ~/.codex/skills/hzl/SKILL.md | head -10
```

You should see the HZL skill frontmatter with `name: hzl`.

## Updating

To get the latest skill version:

```bash
curl -o ~/.codex/skills/hzl/SKILL.md \
  https://raw.githubusercontent.com/tmchow/hzl/main/skills/hzl/SKILL.md
```

## Usage

In Codex, invoke with: `$hzl`

Or Codex will auto-select the skill when you mention task tracking, checkpoints,
or multi-agent coordination.

## Prerequisites

HZL CLI must be installed separately:

```bash
# Via npm
npm install -g hzl-cli

# Via Homebrew
brew install hzl
```
```

### Phase 3: Documentation Updates

**README.md changes:**

1. Update Claude Code marketplace section (lines ~409-421):
   - Change command from `/plugin install hzl@hzl-marketplace` to `/plugin install hzl@hzl`
   - Add brief migration note for existing users (most won't need this)

2. Add new Codex section after Claude Code:
   - Manual install steps first (preferred)
   - Quick install (prompt injection) with security note second
   - Link to `.codex/INSTALL.md`

**docs/snippets/coding-agent-setup.md changes:**
- Add Codex installation instructions
- Reference README for migration (don't duplicate)

**docs/openclaw/skills/hzl/SKILL.md changes:**
- Update "When to use HZL" section with stronger stance:
  - Explicitly state OpenClaw has NO native task tools (unlike Claude Code's TodoWrite or Codex's update_plan)
  - Make HZL the **default choice** for any non-trivial task tracking
  - Keep escape hatch only for truly trivial cases

**AGENTS.md changes:**
- Update "Documentation to Update When CLI Changes" table with new paths:
  - Change `packages/hzl-marketplace/plugins/hzl-skills/skills/hzl-task-management/SKILL.md` to `skills/hzl/SKILL.md`

### Phase 4: Verification

1. Run snippet sync check: `node scripts/sync-snippets.js --check`
2. Run linting: `npm run lint`
3. Run typecheck: `npm run typecheck`
4. Manually test Claude Code install flow (if possible)
5. Verify no broken internal links

## File Summary

| Action | Path | Notes |
|--------|------|-------|
| Modify | `.claude-plugin/marketplace.json` | Update to new structure |
| Create | `.claude-plugin/plugin.json` | New plugin manifest (version synced via release script) |
| Create | `skills/hzl/SKILL.md` | Move + rename + enhance |
| Create | `.codex/INSTALL.md` | Codex bootstrap |
| Move | `skills/*.md` → `skills_backup/` | Avoid skill discovery conflict |
| Delete | `packages/hzl-marketplace/` | Entire directory |
| Modify | `README.md` | Install instructions + migration (single location) |
| Modify | `docs/snippets/coding-agent-setup.md` | Both platforms (reference README for migration) |
| Modify | `docs/openclaw/skills/hzl/SKILL.md` | Stronger stance (no native tools) |
| Modify | `AGENTS.md` | Documentation table |
| Modify | Release script | Add plugin.json version bump |

## References & Research

### Internal References
- Brainstorm: `docs/brainstorms/2026-02-02-codex-skill-support-brainstorm.md`
- Current skill: `packages/hzl-marketplace/plugins/hzl/skills/hzl-task-management/SKILL.md`
- Snippet sync: `scripts/sync-snippets.js`
- Existing marketplace: `.claude-plugin/marketplace.json`

### External References
- [Codex Skills Documentation](https://developers.openai.com/codex/skills/)
- [obra/superpowers pattern](https://github.com/obra/superpowers)
- [Jesse Vincent's Codex skills blog](https://blog.fsck.com/2025/10/27/skills-for-openai-codex/)

### Related Work
- OpenClaw skill: `docs/openclaw/skills/hzl/SKILL.md` (kept separate, stronger stance)
