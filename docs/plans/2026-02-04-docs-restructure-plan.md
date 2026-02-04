# Documentation Restructure Plan

**Date:** 2026-02-04
**Status:** Proposed
**Goal:** Thin README, comprehensive docs-site, reduced duplication

## Problem Statement

The current documentation has significant duplication and gaps:

1. **README is too long** (679 lines) with detailed content that belongs in dedicated docs
2. **Duplication across sources**: README, docs-site, snippets, and skills cover overlapping content
3. **CLI reference only in README** - docs-site links back instead of hosting it
4. **Key workflows scattered** - HZL-GUIDE.md, SKILL.md, scenarios all have unique content
5. **Common confusion**: Users don't understand HZL's machine-level installation model

## Key Decisions

1. **Workflows** naming (not "Scenarios")
2. **HZL-GUIDE.md stays separate** - terminal-optimized for `hzl guide` output
3. **Pruning stays in concepts/** but commands go to reference/cli.md
4. **Advanced SKILL.md content** (sizing tasks, human oversight, leases) also appears in docs-site

---

## New README.md (~120-150 lines)

The README becomes a landing page that sells and orients, not teaches.

```markdown
# HZL (Hazel)

External task ledger for coding agents and OpenClaw.

📚 **[Documentation](https://www.hzl-tasks.com)** | 🚀 **[Quick Start](https://www.hzl-tasks.com/getting-started/quickstart/)** | 📋 **[CLI Reference](https://www.hzl-tasks.com/reference/cli/)**

## What is HZL?

Claude Code has built-in task tracking. If you use Claude Code for short, self-contained work, that's probably enough.

HZL is for when work outlives a single session: days-long projects, switching between Claude Code and Codex, OpenClaw juggling parallel workstreams.

- **Cross-agent coordination** — Claim a task in Claude Code, pick it up in Codex tomorrow
- **Session persistence** — Checkpoints survive context resets and session boundaries
- **Local-first** — Fast SQLite reads/writes with optional Turso cloud sync

## How HZL Works

**One install, all projects.** HZL is installed once on your machine, not per repository. You don't clone the HZL repo—you install the CLI globally (`npm install -g hzl-cli` or `brew install hzl`).

The database lives at the user level (`~/.local/share/hzl/`), shared across all your projects. When you run `hzl task add -P my-feature`, you're writing to this central database, not to anything in your repo.

This means:
- Multiple repos share the same HZL installation
- Projects in HZL are logical containers, not tied to filesystem paths
- Agents working on different repos coordinate through the same ledger

## Quick Install

\`\`\`bash
curl -fsSL "https://raw.githubusercontent.com/tmchow/hzl/main/scripts/install.sh?$(date +%s)" | bash
\`\`\`

<details>
<summary>Alternative methods</summary>

Via Homebrew: `brew tap tmchow/hzl && brew install hzl && hzl init`
Via npm: `npm install -g hzl-cli && hzl init`

</details>

## Quick Start

\`\`\`bash
hzl project create my-feature
hzl task add "Design the API" -P my-feature
hzl task claim <id> --assignee claude-code
hzl task checkpoint <id> "Schema designed, moving to endpoints"
hzl task complete <id>
\`\`\`

See the [full quickstart tutorial](https://www.hzl-tasks.com/getting-started/quickstart/).

## Using with Coding Agents

Works with Claude Code, Codex, Gemini, and similar AI coding assistants.
See [Setup for Coding Agents](https://www.hzl-tasks.com/getting-started/coding-agents/).

## Using with OpenClaw

HZL provides durable task state that persists outside OpenClaw's context window.
See [Setup for OpenClaw](https://www.hzl-tasks.com/getting-started/openclaw/).

## Documentation

| Section | What you'll learn |
|---------|-------------------|
| [Getting Started](url) | Installation, quickstart, agent setup |
| [Concepts](url) | Projects, tasks, dependencies, checkpoints, leases |
| [Workflows](url) | Multi-agent coordination, session handoffs, task breakdown |
| [CLI Reference](url) | Complete command documentation |
| [Web Dashboard](url) | Visual Kanban board with `hzl serve` |

## Packages

| Package | Description |
|---------|-------------|
| [`hzl-cli`](npm-url) | CLI for task management |
| [`hzl-core`](npm-url) | Core library for programmatic use |
| [`hzl-web`](npm-url) | Web dashboard server |

## License

MIT
```

---

## New docs-site Structure

```
docs-site/
├── index.md                        # Landing page (updated)
│
├── getting-started/
│   ├── index.md                    # Getting started overview
│   ├── installation.md             # All install methods (uses snippet)
│   ├── quickstart.md               # NEW: 5-minute tutorial
│   ├── coding-agents.md            # Claude Code, Codex, Gemini (existing, updated)
│   └── openclaw.md                 # OpenClaw setup (existing, uses snippets)
│
├── concepts/
│   ├── index.md                    # UPDATED: Philosophy + installation model + architecture
│   ├── projects.md                 # Existing
│   ├── tasks.md                    # Existing (slimmed, links to related pages)
│   ├── subtasks.md                 # Existing
│   ├── dependencies.md             # Existing
│   ├── checkpoints.md              # NEW: Extracted from tasks.md, expanded
│   ├── claiming-leases.md          # NEW: Atomic claiming, leases, stuck recovery
│   ├── cloud-sync.md               # NEW: Turso, offline-first architecture
│   └── pruning.md                  # Existing
│
├── workflows/
│   ├── index.md                    # NEW: Workflow overview + decision tree
│   ├── single-agent.md             # NEW: Basic workflow (one agent, multiple sessions)
│   ├── multi-agent.md              # RENAMED + ENHANCED from scenarios/
│   ├── session-handoffs.md         # RENAMED from scenarios/
│   ├── breaking-down-work.md       # NEW: Sizing tasks, subtask patterns
│   ├── blocking-unblocking.md      # NEW: Blocked workflow
│   └── human-oversight.md          # NEW: From SKILL.md (monitoring, steering)
│
├── reference/
│   ├── index.md                    # NEW: Reference overview
│   ├── cli.md                      # NEW: Full CLI reference (from README)
│   └── architecture.md             # NEW: Event sourcing, packages, diagrams
│
├── dashboard.md                    # Existing (consolidated)
└── troubleshooting.md              # NEW: From HZL-GUIDE.md + common issues
```

---

## Detailed Content Plan

### Getting Started Section

| Page | Content Source | Details |
|------|---------------|---------|
| **index.md** | New | Overview with decision tree: "Using OpenClaw?" → openclaw.md, "Using coding agents?" → coding-agents.md |
| **installation.md** | `snippets/CODING-AGENT-SETUP.md` | Use marker sync. One canonical place for all install methods. |
| **quickstart.md** | New (adapted from README) | 5-minute tutorial: create project → add tasks with dependencies → claim → checkpoint → complete → view in dashboard |
| **coding-agents.md** | Existing + updates | Keep skill install, add "verify it works", link to workflows |
| **openclaw.md** | Existing | Use snippets for prompts, keep ClawHub skill install |

### Concepts Section

| Page | Content Source | Details |
|------|---------------|---------|
| **index.md** | README "Why another task tracker?" + "Where HZL fits" + installation model | Philosophy, problem statement, **installation model explanation**, architecture diagrams (mermaid), what HZL does NOT do |
| **projects.md** | Existing | Add anti-pattern emphasis (project sprawl) |
| **tasks.md** | Existing | Slim down: remove checkpoint details, remove claiming details, add links to new pages |
| **subtasks.md** | Existing | Good as-is |
| **dependencies.md** | Existing | Good as-is |
| **checkpoints.md** | Extract from tasks.md | What checkpoints are, when to create them, examples, viewing history |
| **claiming-leases.md** | README + SKILL.md | Atomic claiming, `--assignee` vs `--author`, leases (`--lease`), stuck tasks (`hzl task stuck`, `steal --if-expired`) |
| **cloud-sync.md** | README | Turso setup, `--sync-url`, architecture diagram, offline-first behavior |
| **pruning.md** | Existing | Keep in concepts, ensure commands documented in cli.md |

#### Installation Model Content (for concepts/index.md)

```markdown
## Installation Model

HZL uses a **machine-level installation** with a **user-level database**:

| What | Where | Scope |
|------|-------|-------|
| CLI binary | Global (`/usr/local/bin/hzl` or npm global) | Per machine |
| Database | `~/.local/share/hzl/` (XDG spec) | Per user account |
| Projects | Logical containers in database | Cross-repo |

**You install HZL once.** It's not cloned into each repo, not installed per-project. One global CLI serves all your work.

**The database is shared.** All projects across all your repos write to the same `~/.local/share/hzl/events.db`. This is intentional—it enables cross-repo coordination.

**Common misconceptions:**

| Misconception | Reality |
|--------------|---------|
| "I need to clone the HZL repo" | No—install the CLI package (`npm install -g hzl-cli`) |
| "Each repo gets its own HZL" | No—one HZL installation covers all your work |
| "Projects map to filesystem paths" | No—projects are logical groupings you define |
| "I need to run `hzl init` in each repo" | No—run it once per machine (or once to enable cloud sync) |

This design enables cross-repo coordination. An agent working in `repo-a` can see and claim tasks from `repo-b` because they share the same HZL database.

### What goes in repos?

The only HZL-related content in your repos is the **agent policy snippet** in your `AGENTS.md` or `CLAUDE.md`. This teaches agents when to use HZL—it doesn't install anything.

\`\`\`bash
# Add the policy to your repo's agent instructions
curl -fsSL https://raw.githubusercontent.com/tmchow/hzl/main/snippets/AGENT-POLICY.md >> AGENTS.md
\`\`\`
```

### Workflows Section

| Page | Content Source | Details |
|------|---------------|---------|
| **index.md** | New | Overview with flowchart: "Which workflow?" decision tree based on single/multi-agent, session count |
| **single-agent.md** | Adapted from HZL-GUIDE.md | Complete workflow for one agent across sessions: setup → add work → claim → work → checkpoint → complete. Status management. |
| **multi-agent.md** | scenarios/multi-agent + SKILL.md | Merge existing scenario with advanced atomic claiming, authorship tracking table, lease patterns |
| **session-handoffs.md** | scenarios/session-handoffs | Rename file, minor updates, link to checkpoints concept |
| **breaking-down-work.md** | SKILL.md "Sizing Parent Tasks" | Completability test, scope by problem not layer, when to split, adding context (`-d`, `-l`) |
| **blocking-unblocking.md** | HZL-GUIDE.md | When to block, `hzl task block --comment`, unblocking, vs dependency blocking |
| **human-oversight.md** | SKILL.md | Monitoring progress, providing guidance via comments, agents checking for comments before completing |

### Reference Section

| Page | Content Source | Details |
|------|---------------|---------|
| **index.md** | New | Brief overview linking to cli.md, architecture.md, dashboard |
| **cli.md** | README CLI reference | Full command reference with: setup commands, project commands, task commands (CRUD, workflow, coordination, cleanup), diagnostics, web dashboard. Include all flags and examples. |
| **architecture.md** | README diagrams + AGENTS.md | Event sourcing explanation, package structure (hzl-cli, hzl-core, hzl-web), database location (XDG), for developers building on HZL |

### Other Pages

| Page | Content Source | Details |
|------|---------------|---------|
| **dashboard.md** | Existing + README | Consolidate both sources, include all options, features, systemd setup, when to use |
| **troubleshooting.md** | HZL-GUIDE.md table | Expand: common errors table, diagnostic commands (`hzl status`, `hzl doctor`), FAQ format |

---

## Snippet Strategy

| Snippet | Current Usage | Proposed Usage |
|---------|--------------|----------------|
| `AGENT-POLICY.md` | AGENTS.md (embedded) | Same + optionally show on docs-site getting-started for copy/paste |
| `HZL-GUIDE.md` | `hzl guide` output | Keep separate. Docs-site has parallel content in workflows/ but HZL-GUIDE stays terminal-optimized. |
| `CODING-AGENT-SETUP.md` | docs-site/setup/coding-agents.md | Move to docs-site/getting-started/installation.md |
| `OPENCLAW-SETUP-PROMPT.md` | README, docs-site | docs-site/getting-started/openclaw.md |
| `UPGRADE-HZL-PROMPT.md` | README | docs-site/getting-started/openclaw.md |
| `AGENT-SKILLS-INSTALL.md` | README | Remove separate snippet, merge into installation.md |

---

## Files to Create/Modify/Delete

### Create (16 new files)

```
docs-site/getting-started/index.md
docs-site/getting-started/installation.md
docs-site/getting-started/quickstart.md
docs-site/concepts/checkpoints.md
docs-site/concepts/claiming-leases.md
docs-site/concepts/cloud-sync.md
docs-site/workflows/index.md
docs-site/workflows/single-agent.md
docs-site/workflows/multi-agent.md          # renamed from scenarios
docs-site/workflows/session-handoffs.md     # renamed from scenarios
docs-site/workflows/breaking-down-work.md
docs-site/workflows/blocking-unblocking.md
docs-site/workflows/human-oversight.md
docs-site/reference/index.md
docs-site/reference/cli.md
docs-site/reference/architecture.md
docs-site/troubleshooting.md
```

### Modify (8 files)

```
README.md                              # Slim down to ~120-150 lines
docs-site/index.md                     # Update links and structure
docs-site/_config.yml                  # New navigation structure
docs-site/concepts/index.md            # Add philosophy, installation model, diagrams
docs-site/concepts/tasks.md            # Slim down, add links to new pages
docs-site/concepts/projects.md         # Minor anti-pattern emphasis
docs-site/getting-started/coding-agents.md  # Moved from setup/, updated
docs-site/getting-started/openclaw.md  # Moved from setup/, updated
docs-site/dashboard.md                 # Consolidate content
```

### Delete (7 files)

```
docs-site/setup/index.md                           # Replaced by getting-started/
docs-site/setup/coding-agents.md                   # Moved to getting-started/
docs-site/setup/openclaw.md                        # Moved to getting-started/
docs-site/scenarios/index.md                       # Replaced by workflows/
docs-site/scenarios/multi-agent-coordination.md    # Moved to workflows/
docs-site/scenarios/session-handoffs.md            # Moved to workflows/
docs-site/scenarios/project-organization.md        # Merge into concepts or workflows
docs-site/scenarios/dependency-sequencing.md       # Merge into concepts/dependencies.md
```

---

## Jekyll Navigation (_config.yml)

```yaml
nav_order:
  - Home (1)
  - Getting Started (2)
    - Overview
    - Installation
    - Quickstart
    - Coding Agents
    - OpenClaw
  - Concepts (3)
    - Overview (philosophy + installation model)
    - Projects
    - Tasks
    - Subtasks
    - Dependencies
    - Checkpoints
    - Claiming & Leases
    - Cloud Sync
    - Pruning
  - Workflows (4)
    - Overview
    - Single Agent
    - Multi-Agent
    - Session Handoffs
    - Breaking Down Work
    - Blocking & Unblocking
    - Human Oversight
  - Reference (5)
    - CLI Reference
    - Architecture
  - Dashboard (6)
  - Troubleshooting (7)
```

---

## Migration Order

Recommended sequence to minimize breakage:

### Phase 1: Create New Structure
1. Create `getting-started/` directory with all pages
2. Create `workflows/` directory with all pages
3. Create `reference/` directory with cli.md and architecture.md
4. Create `troubleshooting.md`
5. Create new concept pages (checkpoints, claiming-leases, cloud-sync)

### Phase 2: Update Existing Pages
6. Update `concepts/index.md` with philosophy + installation model
7. Update `concepts/tasks.md` (slim down, add links)
8. Update `dashboard.md` (consolidate)
9. Move content from scenarios/ to workflows/

### Phase 3: Update Navigation
10. Update `_config.yml` with new navigation structure
11. Add Jekyll redirects from old URLs to new

### Phase 4: Slim README
12. Reduce README to ~120-150 lines
13. Replace detailed sections with links to docs-site
14. Verify package README copying still works

### Phase 5: Cleanup
15. Delete old setup/ and scenarios/ directories
16. Update skill files to link to new docs-site URLs
17. Verify all internal links work
18. Test docs-site build

---

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| README length | 679 lines | ~120-150 lines |
| Docs-site pages | 16 | 23 |
| Duplicate content locations | 4+ | 1-2 (docs + synced snippets) |
| CLI reference location | README only | docs-site/reference/cli.md |
| Installation model explained | Nowhere clearly | README + concepts/index.md |
| Philosophy/architecture | README only | docs-site/concepts/index.md |

---

## Open Questions

1. **Redirects:** Does Jekyll/just-the-docs support redirects for old URLs (setup/ → getting-started/)?
2. **Search:** Will the new structure improve or break docs-site search?
3. **project-organization.md and dependency-sequencing.md:** Merge into existing pages or keep as separate workflow pages?
