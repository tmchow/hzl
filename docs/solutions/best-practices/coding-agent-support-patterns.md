# Supporting Multiple Coding Agents: Claude Code, Codex, and OpenClaw

**Date:** 2026-02-02
**Module:** skills, docs
**Category:** best-practices
**Tags:** [coding-agents, claude-code, codex, openclaw, skills, installation, DRY, versioning, marketplace-json, plugin-json]

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

### 8. Claude Code Plugin JSON Structure and Versioning

**Key insight:** Claude Code plugins have TWO JSON files with different purposes.

| File | Purpose | Has Version? |
|------|---------|--------------|
| `marketplace.json` | Index/registry that lists available plugins | No (optional) |
| `plugin.json` | Plugin manifest with metadata | Yes (required) |

**marketplace.json** is like a package registry index:

```json
{
  "name": "hzl",
  "description": "HZL task tracking for coding agents",
  "owner": { "name": "Trevin Chow", "url": "..." },
  "plugins": [
    {
      "name": "hzl",
      "description": "...",
      "version": "1.12.5",  // ← Version REQUIRED in plugin entry
      "source": "./"
    }
  ]
}
```

**plugin.json** is the actual plugin manifest:

```json
{
  "name": "hzl",
  "version": "1.12.5",
  "description": "...",
  "skills": "./skills/"
}
```

**Critical discovery:** The `plugins[]` array entries in `marketplace.json` MUST include `version`. Both [Anthropic's official marketplace](https://github.com/anthropics/claude-code/blob/main/.claude-plugin/marketplace.json) and [obra/superpowers](https://github.com/obra/superpowers) include version in plugin entries.

**Version synchronization strategy:**

Keep all versions in sync automatically via release scripts:

```
CLI version (packages/hzl-cli/package.json)
    ↓ sync-versions.js
    ├── .claude-plugin/plugin.json → version
    └── .claude-plugin/marketplace.json → plugins[0].version
```

**Verification in CI:**

```javascript
// scripts/verify-marketplace-versions.js
const versionFiles = [
  { path: './packages/hzl-cli/package.json', versionPath: 'version' },
  { path: './.claude-plugin/plugin.json', versionPath: 'version' },
  { path: './.claude-plugin/marketplace.json', versionPath: 'plugins.0.version' }
];
// All must match
```

**Why this matters:** Version drift between files causes:
- Install/update failures
- Users getting stale skills
- Confusion about which version is deployed

### 9. Snippet Sync with Edit Warnings

**Problem:** Synced snippets look like regular content when viewing source. Easy to accidentally edit inline (changes get overwritten).

**Solution:** Add warning comments after START markers:

```markdown
<!-- START docs/snippets/agent-policy.md -->
<!-- ⚠️ DO NOT EDIT - Auto-generated from docs/snippets/agent-policy.md -->
[synced content here]
<!-- END docs/snippets/agent-policy.md -->
```

**CI enforcement:**

```yaml
- name: Verify snippets in sync
  run: node scripts/sync-snippets.js --check
```

This fails PRs if someone edited inline instead of editing the source snippet.

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
- `.claude-plugin/marketplace.json` - Plugin marketplace index with version
- `.claude-plugin/plugin.json` - Plugin manifest with version
- `scripts/sync-versions.js` - Syncs versions across JSON files on release
- `scripts/sync-snippets.js` - Syncs snippets with DO NOT EDIT warnings
- `scripts/verify-marketplace-versions.js` - CI check for version consistency
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
| Version in both marketplace.json and plugin.json | Claude Code schema requires version in plugin entries |
| Auto-sync all JSON versions with CLI | Prevents version drift, automated via release script |
| CI check for version consistency | Catches mismatches before merge |
| DO NOT EDIT warnings in synced snippets | Prevents accidental inline edits that get overwritten |
