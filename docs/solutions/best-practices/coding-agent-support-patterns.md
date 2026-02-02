# Supporting Multiple Coding Agents: Claude Code, Codex, and OpenClaw

**Date:** 2026-02-02
**Module:** skills, docs
**Category:** best-practices
**Tags:** [coding-agents, claude-code, codex, openclaw, skills, installation, DRY]

## Problem

HZL needed to work across multiple coding agents with different ecosystems:
- **Claude Code**: Uses plugins/skills via `/plugin` commands, has built-in `TodoWrite`
- **OpenAI Codex**: Uses skills in `~/.codex/skills/`, has built-in `update_plan`
- **OpenClaw**: Has no native task tracking, relies on tools via JSON metadata

Each agent has different:
- Installation mechanisms
- Skill file locations
- Native task tracking capabilities (or lack thereof)
- Policy enforcement patterns

## Key Learnings

### 1. Single SKILL.md, Multiple Installation Paths

**Decision:** Maintain ONE canonical `skills/hzl/SKILL.md` that works for both Claude Code and Codex.

```
skills/hzl/SKILL.md          # Canonical source - both agents use this
├── Claude Code: /plugin marketplace add → /plugin install
└── Codex: curl → ~/.codex/skills/hzl/SKILL.md
```

**Why it works:** Both agents use the same YAML frontmatter format:

```yaml
---
name: hzl
description: This skill should be used when working with HZL...
---
```

**What differs:** Only the *installation mechanism*, not the skill content.

### 2. Policy Snippet vs Full Skill

**Three tiers of agent integration:**

| Tier | What Agent Gets | Install Complexity |
|------|-----------------|-------------------|
| **Minimal** | Policy snippet in AGENTS.md/CLAUDE.md | Copy-paste a markdown block |
| **Standard** | Full skill file | Agent-specific install command |
| **Rich** | Skill + AGENTS.md policy | Both of the above |

**Decision:** Support all three. The minimal policy snippet (~30 lines) works for any agent that reads instruction files. The full skill (~400 lines) adds scenarios, patterns, and command reference.

### 3. Native Task Tracking Coexistence

**Critical insight:** Don't fight native tools—complement them.

| Agent | Native Tool | HZL Positioning |
|-------|-------------|-----------------|
| Claude Code | `TodoWrite` | "TodoWrite for single sessions, HZL for cross-session/multi-agent" |
| Codex | `update_plan` | "update_plan for ephemeral notes, HZL for persistent tracking" |
| OpenClaw | None | "HZL is your primary task database" |

**Policy language that works:**

```markdown
**Your native tools (TodoWrite, update_plan) may be fine for:**
- Simple flat checklists
- Quick ephemeral notes within a short session
- Trivial tasks that don't need persistence

**Key differences:**
- HZL persists across sessions; native tools are session-local
- HZL supports nesting and dependencies; native tools are flat
```

This positions HZL as complementary rather than replacement, reducing friction.

### 4. Installation UX Differences

**Claude Code:** Plugin marketplace provides discoverability and versioning.

```bash
/plugin marketplace add tmchow/hzl
/plugin install hzl@hzl
```

**Codex:** No marketplace. Two options emerged:

- **Prompt injection** (convenient but requires trust):
  ```
  "Fetch and follow instructions from https://raw.githubusercontent.com/tmchow/hzl/main/.codex/INSTALL.md"
  ```

- **Manual install** (more control):
  ```bash
  mkdir -p ~/.codex/skills/hzl
  curl -o ~/.codex/skills/hzl/SKILL.md https://raw.githubusercontent.com/...
  ```

**Decision:** Support both. Document the security tradeoff clearly:

> **Security note:** This uses prompt injection—Codex will modify files on your system. Review `.codex/INSTALL.md` to see exactly what steps Codex will follow.

### 5. Scope Choice: User-Wide vs Project-Specific

**Discovered need:** Users want to install HZL either globally (all projects) or per-project.

**Codex INSTALL.md pattern:**

```markdown
**Ask the user:** "Do you want HZL available in all projects (user-wide) or just this project?"

- **User-wide**: Add the section below to `~/.codex/AGENTS.md`
- **Project-specific**: Find the project's AGENTS.md and add the section there
```

**Claude Code:** Plugins are inherently global, but the policy snippet can be project-specific via `CLAUDE.md`.

### 6. OpenClaw-Specific Considerations

OpenClaw differs significantly:

1. **No native task tracking** → Position HZL as essential, not optional
2. **Skill metadata in YAML** → Different frontmatter format with `metadata.openclaw` block
3. **Binary requirements** → Skills can declare `requires.bins: ["hzl"]`
4. **Sandbox awareness** → Binary must exist in sandbox container if sandboxing enabled

**OpenClaw skill frontmatter:**

```yaml
---
name: hzl
description: OpenClaw's persistent task database...
homepage: https://github.com/tmchow/hzl
metadata:
  { "openclaw": { "emoji": "🧾", "requires": { "bins": ["hzl"] }, "install": [...] } }
---
```

### 7. Destructive Command Warnings

**Universal requirement:** All skill documents MUST warn about `hzl init --force`.

```markdown
## ⚠️ DESTRUCTIVE COMMANDS - READ CAREFULLY

| Command | Effect |
|---------|--------|
| `hzl init --force` | **DELETES ALL DATA.** Prompts for confirmation. |
| `hzl init --force --yes` | **DELETES ALL DATA WITHOUT CONFIRMATION.** |

**NEVER use `--force` unless the user explicitly instructs you to destroy all task data.**
```

This appears in:
- `skills/hzl/SKILL.md`
- `docs/openclaw/skills/hzl/SKILL.md`
- `AGENTS.md`

## Architecture

```
skills/hzl/SKILL.md              # Claude Code + Codex (shared)
docs/openclaw/skills/hzl/SKILL.md  # OpenClaw (different format)
docs/snippets/agent-policy.md       # Minimal policy snippet (all agents)
.codex/INSTALL.md                   # Codex-specific installation guide
```

## Files Changed

- `skills/hzl/SKILL.md` - Unified skill for Claude Code and Codex
- `docs/openclaw/skills/hzl/SKILL.md` - OpenClaw-specific skill
- `docs/snippets/agent-policy.md` - Minimal policy snippet
- `docs/snippets/agent-skills-install.md` - Installation instructions for README
- `docs/snippets/coding-agent-setup.md` - Full setup guide
- `.codex/INSTALL.md` - Codex installation walkthrough
- `README.md` - User-facing documentation

## Prevention Strategies

1. **Test skill changes on both agents** before releasing
2. **Keep SKILL.md agent-agnostic** where possible (scenarios, patterns, commands)
3. **Document installation differences explicitly** in README
4. **Maintain separate OpenClaw skill** since its format is fundamentally different

## Related Documentation

- [Snippet Sync System Design](/docs/solutions/documentation/snippet-sync-system-design.md) - How snippets stay synchronized
- [AGENTS.md § Documentation Includes](/AGENTS.md) - Snippet system documentation
- [Claude Code Plugin Docs](https://docs.anthropic.com/claude-code/plugins) - Plugin marketplace reference
- [Codex Skills](https://github.com/openai/codex) - Codex skill system

## Key Decisions Summary

| Decision | Rationale |
|----------|-----------|
| Single SKILL.md for Claude Code + Codex | Same frontmatter format, reduces maintenance |
| Separate OpenClaw skill | Different metadata format required |
| Support prompt injection for Codex | Convenience with documented security tradeoff |
| User chooses install scope | Global vs project-specific flexibility |
| "Complement, don't replace" positioning | Reduces friction with native task tools |
| Destructive command warnings everywhere | Agents must not accidentally destroy data |
