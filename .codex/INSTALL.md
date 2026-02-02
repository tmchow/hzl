# Installing HZL Skill for Codex

Add HZL task tracking capabilities to OpenAI Codex CLI.

## Quick Install (Prompt Injection)

Tell Codex:

> Fetch and follow instructions from https://raw.githubusercontent.com/tmchow/hzl/main/.codex/INSTALL.md

This instructs Codex to:
1. Download the HZL skill to `~/.codex/skills/hzl/SKILL.md`
2. Add HZL usage guidance to your `~/.codex/AGENTS.md`

**Security note:** This uses prompt injection to instruct Codex to modify files on your system. Review the manual steps below if you prefer to control exactly what changes are made.

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
brew tap tmchow/hzl
brew install hzl
```
