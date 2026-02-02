# Codex Skill Support Brainstorm

**Date:** 2026-02-02
**Status:** Ready for planning

## What We're Building

Add OpenAI Codex CLI support for HZL skills, restructure the repo to have a single source of truth for skills, and update documentation for both Claude Code and Codex installation.

## Why This Approach

### Research Findings

OpenAI's Codex CLI supports skills with nearly identical format to Claude Code:

| Feature | Codex CLI | Claude Code |
|---------|-----------|-------------|
| Skill format | `SKILL.md` with YAML frontmatter | `SKILL.md` with YAML frontmatter |
| Required fields | `name`, `description` | `name`, `description` |
| Invocation | `$skill-name` | `/skill-name` |
| Project instructions | `AGENTS.md` | `CLAUDE.md` |
| Skill location | `.codex/skills/` or `~/.codex/skills/` | `.claude/skills/` or marketplace |

The SKILL.md content is compatible as-is between both systems.

### Pattern from obra/superpowers

The [superpowers](https://github.com/obra/superpowers) repo demonstrates a proven pattern:
- Single `skills/` directory at repo root (single source of truth)
- `.claude-plugin/` at root with `marketplace.json` pointing to `./` (repo IS the plugin)
- `.codex/INSTALL.md` for Codex bootstrap via prompt injection
- Skills work for both platforms without duplication

### Key Difference: HZL is a Monorepo

Unlike superpowers (skills-only repo), HZL contains:
- CLI tool (`packages/hzl-cli/`)
- Core library (`packages/hzl-core/`)
- Web dashboard (`packages/hzl-web/`)
- Documentation
- AND skills

Cloning the entire repo just for a skill file is wasteful. Solution: Codex users fetch the skill file directly via curl instead of git clone.

## Key Decisions

### 1. Restructure: Skills at Repo Root

**Before:**
```
hzl/
├── packages/hzl-marketplace/
│   ├── .claude-plugin/marketplace.json
│   └── plugins/hzl/
│       ├── .claude-plugin/plugin.json
│       └── skills/hzl-task-management/SKILL.md
```

**After:**
```
hzl/
├── .claude-plugin/
│   ├── marketplace.json
│   └── plugin.json
├── skills/
│   └── hzl/
│       └── SKILL.md
├── .codex/
│   └── INSTALL.md
```

Delete `packages/hzl-marketplace/` entirely.

### 2. Rename Skill to `hzl`

Current name `hzl-task-management` is redundant—HZL IS task management.

- Directory: `skills/hzl/SKILL.md`
- Frontmatter: `name: hzl`
- Invocation: `$hzl` (Codex) or `/hzl` (Claude Code)

### 3. Single Source of Truth (No Duplication)

**Critical:** Both Claude Code and Codex use the SAME `skills/hzl/SKILL.md` file.

```
skills/hzl/SKILL.md
    │
    ├── Claude Code: Discovers via .claude-plugin/ → skills/
    │
    └── Codex: Users curl this file to ~/.codex/skills/hzl/
```

The skill content is platform-agnostic:
- Uses `hzl` CLI commands (bash/exec) - works identically on both platforms
- No Claude-specific tools (TodoWrite, Task, etc.)
- No Codex-specific tools
- One example mentions `--author "Claude Code"` but this is just an example string, not a dependency

**There is NO skill duplication between Claude Code and Codex.**

### 4. Codex Install via Direct Curl (Not Git Clone)

Since HZL is a monorepo, Codex users fetch only the skill file:

```bash
mkdir -p ~/.codex/skills/hzl
curl -o ~/.codex/skills/hzl/SKILL.md \
  https://raw.githubusercontent.com/tmchow/hzl/main/skills/hzl/SKILL.md
```

### 5. Keep OpenClaw Skill Separate

The OpenClaw skill at `docs/openclaw/skills/hzl/SKILL.md` has different context (Exec tool, sandbox considerations). This is **intentional duplication** - OpenClaw has different runtime context and the skill content reflects that.

### 6. Strongly Encourage HZL, Don't Force It

**Philosophy:** Provide enough information to make HZL the obvious choice for complex work, but give agents an escape hatch for simple tasks where native tools are fine.

**Why this approach:**
- HZL is still early - don't want to handcuff agents
- Native tools (TodoWrite, update_plan) may be better for quick, simple tasks
- Agents should have autonomy to choose the right tool
- Better to be used appropriately 80% of the time than forced 100%

**HZL excels at (strongly encourage):**
- Complex plans with **nesting** (parent tasks + subtasks)
- Tasks with **dependencies** (task B depends on task A completing)
- Need **visibility** into progress (web dashboard, human monitoring)
- **Long-running work** where checkpoints help track progress
- Work spanning **multiple sessions** or days
- **Multi-agent** coordination (different agents working on related tasks)

**Native tools may be fine for:**
- Simple flat checklists
- Quick ephemeral notes within a short session
- Trivial tasks that don't need persistence or visibility

**Platform-specific stance:**

| Platform | Native Task Tools | HZL Recommendation |
|----------|-------------------|-------------------|
| Claude Code | TodoWrite (flat, session-local) | Encourage for complex work |
| Codex | update_plan (flat, session-local) | Encourage for complex work |
| OpenClaw | **None** (memory + markdown files) | **Strongly recommend** - HZL is clearly superior |

**OpenClaw-specific guidance** (stronger stance):
OpenClaw has no native task tools. Without HZL, it relies on memory (context window) and markdown files, which are inferior for:
- Persistence (memory is lost, files require manual management)
- Structure (no nesting, no dependencies)
- Visibility (no dashboard)
- Multi-agent (no claiming, no leases)

For OpenClaw, HZL should be the **default choice** for any non-trivial task tracking. The escape hatch is only for truly trivial cases where tracking overhead isn't worth it.

This guidance should be reflected in:
1. The shared SKILL.md (affects Claude Code + Codex)
2. The Codex AGENTS.md snippet
3. The OpenClaw skill (separately maintained, stronger stance)

### 7. Documentation Updates Required

| Document | Updates Needed |
|----------|----------------|
| `README.md` | New Claude Code install commands, new Codex section |
| `docs/` site | Installation page for both platforms |
| Codex warning | Prompt injection security note |
| `skills/hzl/SKILL.md` | Enhanced "when to use" section with encourage-not-force philosophy |

## Implementation Details

### New Claude Code Commands

```bash
# Add marketplace (repo = marketplace)
/plugin marketplace add tmchow/hzl

# Install the plugin
/plugin install hzl@hzl
```

### New `.claude-plugin/marketplace.json`

```json
{
  "name": "hzl",
  "description": "HZL task tracking for coding agents",
  "owner": {
    "name": "tmchow"
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

### New `.claude-plugin/plugin.json`

```json
{
  "name": "hzl",
  "description": "HZL task management skill for multi-session, multi-agent workflows",
  "version": "1.12.5",
  "homepage": "https://github.com/tmchow/hzl",
  "repository": "https://github.com/tmchow/hzl"
}
```

### New `.codex/INSTALL.md`

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

Add this section to your `~/.codex/AGENTS.md`:

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

### README Updates

Add new "Installation" section covering both platforms:

```markdown
## Installation

### CLI Installation

```bash
# Via npm
npm install -g hzl-cli

# Via Homebrew
brew install hzl
```

### Coding Agent Skills

HZL includes skills that teach coding agents (Claude Code, Codex) how to use HZL effectively.

#### Claude Code

```bash
# Add the HZL marketplace
/plugin marketplace add tmchow/hzl

# Install the HZL skill
/plugin install hzl@hzl
```

#### OpenAI Codex

**Option A: Quick install (prompt injection)**

Tell Codex:
> Fetch and follow instructions from https://raw.githubusercontent.com/tmchow/hzl/main/.codex/INSTALL.md

**Option B: Manual install**

```bash
mkdir -p ~/.codex/skills/hzl
curl -o ~/.codex/skills/hzl/SKILL.md \
  https://raw.githubusercontent.com/tmchow/hzl/main/skills/hzl/SKILL.md
```

Then add to `~/.codex/AGENTS.md`:
```markdown
## HZL Task Tracking
You have the HZL skill (`$hzl`) for persistent task tracking.
Skill location: ~/.codex/skills/hzl/SKILL.md
```

See [Codex installation docs](.codex/INSTALL.md) for full instructions.
```

### Docs Site Updates

Update `docs/snippets/coding-agent-setup.md` to include both Claude Code and Codex instructions with the security warning for prompt injection.

## Skill File Inventory (After Restructure)

| File | Purpose | Platforms |
|------|---------|-----------|
| `skills/hzl/SKILL.md` | Main HZL skill | Claude Code, Codex (shared) |
| `docs/openclaw/skills/hzl/SKILL.md` | OpenClaw-specific skill | OpenClaw only |
| `.claude/skills/event-sourcing/SKILL.md` | Dev skill for contributors | Claude Code (repo-local) |

**Total unique skill content:** 2 (main HZL + OpenClaw variant)
**Duplication between Claude/Codex:** None

## Research Sources

- [Codex Skills Documentation](https://developers.openai.com/codex/skills/)
- [obra/superpowers GitHub](https://github.com/obra/superpowers) - Pattern reference
- [Jesse Vincent's blog: Skills for OpenAI Codex](https://blog.fsck.com/2025/10/27/skills-for-openai-codex/) - EXTREMELY_IMPORTANT tags, literal interpretation
- [Codex Changelog](https://developers.openai.com/codex/changelog/) - spawn_agent, update_plan features
- [Using PLANS.md for multi-hour problem solving](https://developers.openai.com/cookbook/articles/codex_exec_plans) - update_plan tool details

## Open Questions

1. **Version in plugin.json** - Should this be synced with CLI version (1.12.5) or have its own versioning?

2. **Skill auto-update** - Should we provide a script that checks for updates? (Probably YAGNI for now)

3. **AGENTS.md snippet** - Should we create a `docs/snippets/codex-agents-md.md` snippet for consistency?

## Files to Create/Modify

| Action | Path | Notes |
|--------|------|-------|
| Create | `.claude-plugin/marketplace.json` | |
| Create | `.claude-plugin/plugin.json` | |
| Create | `skills/hzl/SKILL.md` | Move + rename from marketplace, add "when to use" section |
| Create | `.codex/INSTALL.md` | With EXTREMELY_IMPORTANT tags |
| Delete | `packages/hzl-marketplace/` | Entire directory |
| Modify | `README.md` | Claude Code + Codex install instructions |
| Modify | `docs/snippets/coding-agent-setup.md` | Both platforms + security warning |
| Modify | `docs/openclaw/skills/hzl/SKILL.md` | Stronger "when to use" stance (no native tools) |
| Modify | AGENTS.md | Update "Documentation to Update" table |

## Next Steps

1. Run `/workflows:plan` to create implementation plan
2. Execute restructure in a feature branch
3. Test Claude Code installation with new commands
4. Test Codex installation flow
5. Update documentation
