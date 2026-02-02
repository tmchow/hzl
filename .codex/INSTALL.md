# Installing HZL Skill for Codex

Quick setup to enable HZL task tracking in Codex.

## Prerequisites

HZL CLI must be installed first:
```bash
# Via npm
npm install -g hzl-cli

# Or via Homebrew
brew tap tmchow/hzl
brew install hzl
```

Initialize the database:
```bash
hzl init
```

## Installation

1. **Download the HZL skill**:
   ```bash
   mkdir -p ~/.codex/skills/hzl
   curl -o ~/.codex/skills/hzl/SKILL.md \
     https://raw.githubusercontent.com/tmchow/hzl/main/skills/hzl/SKILL.md
   ```

2. **Update ~/.codex/AGENTS.md** to include this HZL section:
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

## Usage

In Codex, invoke with: `$hzl`

Or Codex will auto-select the skill when you mention task tracking, checkpoints, or multi-agent coordination.

## Updating

To get the latest skill version:
```bash
curl -o ~/.codex/skills/hzl/SKILL.md \
  https://raw.githubusercontent.com/tmchow/hzl/main/skills/hzl/SKILL.md
```
