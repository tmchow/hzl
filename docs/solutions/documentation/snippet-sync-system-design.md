# Markdown Snippet Sync System Design

**Date:** 2026-02-02
**Module:** docs/snippets
**Category:** documentation
**Tags:** [documentation, DRY, CI, snippets, markdown, automation]

## Problem

Documentation was duplicated across multiple files:
- README.md (root documentation)
- AGENTS.md (agent instructions)
- docs/setup/coding-agents.md (setup guide)
- docs/openclaw/ (OpenClaw-specific docs)

When CLI commands changed, documentation became stale in some locations but not others. AI agents reading outdated docs would use incorrect commands or miss new features.

## Design Decisions

### 1. Single Source of Truth in `docs/snippets/`

All reusable documentation lives in `docs/snippets/`. Each snippet is a self-contained markdown file:

```
docs/snippets/
├── agent-policy.md           # HZL policy for coding agents
├── agent-skills-install.md   # Claude Code + Codex install instructions
├── coding-agent-setup.md     # Full setup guide (includes policy inline)
├── openclaw-setup-prompt.md  # OpenClaw quick start
└── upgrade-hzl-prompt.md     # HZL upgrade prompt
```

**Decision rationale:** Editing one file (`agent-policy.md`) updates it everywhere it's included. No manual sync required.

### 2. Marker-Based Inclusion (Not Templating)

Chose HTML comment markers over templating languages:

```markdown
<!-- START docs/snippets/agent-policy.md -->
<!-- ⚠️ DO NOT EDIT - Auto-generated from docs/snippets/agent-policy.md -->
(content injected here)
<!-- END docs/snippets/agent-policy.md -->
```

**Decision rationale:**
- Works with any markdown renderer (GitHub, MkDocs, VS Code)
- No build step required to view rendered docs
- Markers are invisible when rendered
- Content is always visible in files (not hidden in imports)

### 3. No Nested Includes

**Critical limitation:** The sync script does NOT support nested snippet markers. If `snippet-a.md` contains `<!-- START snippet-b.md -->`, that inner marker will NOT be processed.

**Solution:** Keep snippets flat. If two snippets share content:

| Approach | Example | Trade-off |
|----------|---------|-----------|
| **Duplicate content** | `coding-agent-setup.md` copies text from `agent-policy.md` | Content divergence risk |
| **Create separate snippets** | `agent-skills-install.md` for shared install steps | More files to manage |
| **Inline smaller content** | Include policy text directly in setup guide | Larger snippet files |

We chose **inline content** for `coding-agent-setup.md`: it includes the agent policy text directly rather than nesting a marker, because the setup guide is read as a standalone document.

### 4. Code Fence Wrapping with `[code:X]`

For showing snippets as copyable code blocks (e.g., in README "copy this to your CLAUDE.md"):

```markdown
<!-- START [code:md] docs/snippets/agent-policy.md -->
```

Renders as:

````markdown
```md
### HZL task ledger...
(snippet content)
```
````

**Decision rationale:** Users copying instructions to their own projects need the raw markdown, not rendered output.

### 5. GitHub Actions Auto-Sync

Workflow triggers on pushes to main that touch snippets or target files:

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'docs/snippets/**'
      - 'README.md'
      - 'AGENTS.md'
      # ... other targets
```

**Decision rationale:**
- Developers edit snippets and push
- CI fills in markers automatically
- No manual sync step required
- Commit shows what changed for review

### 6. CI Validation with `--check`

PRs run `node scripts/sync-snippets.js --check` to fail if snippets are out of sync:

```yaml
# In PR checks
- name: Check snippet sync
  run: node scripts/sync-snippets.js --check
```

**Decision rationale:** Prevents merging PRs where someone edited content between markers (which would be overwritten).

### 7. Warning Comments in Synced Content

Every synced block includes:

```markdown
<!-- ⚠️ DO NOT EDIT - Auto-generated from docs/snippets/foo.md -->
```

**Decision rationale:** Clear signal to editors that changes here will be lost. Edit the source in `docs/snippets/` instead.

### 8. Scoped Target Paths

Script only processes specific paths, not all markdown:

```javascript
const ROOT_FILES = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'CODEX.md'];
const SCAN_DIRS = ['docs'];
```

**Decision rationale:** Avoids processing user content in `examples/`, test fixtures, or generated files.

## Implementation

### `scripts/sync-snippets.js`

- Pure Node.js stdlib (no npm dependencies for CI simplicity)
- Regex-based marker detection
- Tracks code fence state to avoid processing markers inside code blocks
- Caches snippet content for efficiency
- Exit code 1 on `--check` if changes needed

### Key Patterns

**Adding a new snippet:**
1. Create `docs/snippets/your-snippet.md`
2. Add markers in target files
3. Push to main - action fills content

**Editing existing snippet:**
1. Edit source file in `docs/snippets/`
2. Push to main - all targets updated automatically

**Local preview:**
```bash
node scripts/sync-snippets.js  # Apply changes locally
```

## Alternatives Considered

### 1. MkDocs Include Plugin

```markdown
{% include 'snippets/agent-policy.md' %}
```

**Rejected:** Only works in MkDocs build output. GitHub renders raw `{% include %}` syntax.

### 2. Git Submodules for Shared Docs

**Rejected:** Adds complexity for contributors. Submodule updates are easy to miss.

### 3. Symlinks

**Rejected:** GitHub doesn't render symlinked markdown. Poor contributor experience.

### 4. No Automation (Manual Sync)

**Rejected:** Humans forget. Documentation drift is guaranteed.

## Files Involved

- `scripts/sync-snippets.js` - Sync logic
- `.github/workflows/readme-sync.yml` - CI automation
- `docs/snippets/*.md` - Source files
- `README.md`, `AGENTS.md`, `docs/**/*.md` - Target files

## Related Documentation

- [AGENTS.md § Documentation Includes](/AGENTS.md) - User-facing documentation
- [PR #60](https://github.com/tmchow/hzl/pull/60) - Original implementation
- [Commit 2fb0b05](https://github.com/tmchow/hzl/commit/2fb0b05) - Nested includes restructure

## Lessons Learned

1. **Flat is better than nested.** Nested includes add complexity and tooling limitations.
2. **Warning comments prevent confusion.** Without them, contributors edit synced content and lose changes.
3. **CI validation catches drift early.** The `--check` flag prevents merging stale documentation.
4. **Visible markers > hidden imports.** Keeping content in files (not just references) aids grep and search.
