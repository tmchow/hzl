---
title: "feat: HZL Documentation Site"
type: feat
date: 2026-02-01
deepened: 2026-02-01
simplified: 2026-02-01
---

# feat: HZL Documentation Site (Simplified)

## Overview

Create a documentation site for HZL using GitHub Pages with Jekyll. The site provides scenario tutorials and dashboard documentation while keeping the README as the authoritative CLI reference.

**Key insight from reviews:** The original plan was over-engineered. GitHub Pages gives us navigation, search, and dark mode with zero build infrastructure.

## Problem Statement

Developers need:
- Scenario-based tutorials for common workflows (multi-agent coordination, session handoffs)
- Documentation for the web dashboard (`hzl serve`)
- A browsable structure beyond the single README

The README (590 lines) is already excellent for CLI reference - we keep it as-is.

## Proposed Solution

```
/docs/
  _config.yml           # Jekyll config (enables search, navigation)
  index.md              # Welcome page with links
  concepts/
    index.md            # Concepts overview
    projects.md         # What projects are, when to create them
    tasks.md            # Task lifecycle, statuses, claiming
    subtasks.md         # Parent/child relationships, when to use
    dependencies.md     # How --depends-on works, vs subtasks
  dashboard.md          # hzl serve documentation
  scenarios/
    index.md            # Scenarios overview
    multi-agent-coordination.md
    session-handoffs.md
    project-organization.md
    dependency-sequencing.md
  CNAME                 # Custom domain: hzl-tasks.com

README.md               # Keep as-is (CLI reference, architecture)
```

**Total: 14 files, ~700 lines of content**

## Technical Approach

### GitHub Pages + Jekyll

GitHub Pages has Jekyll built-in. Adding `_config.yml` enables:
- **Navigation sidebar** via `just-the-docs` theme
- **Search** (client-side, no setup)
- **Dark mode** (theme toggle)
- **Mobile responsive**

### Implementation

#### Step 1: Create Jekyll Config

```yaml
# /docs/_config.yml
title: HZL Documentation
description: External task ledger for coding agents
remote_theme: just-the-docs/just-the-docs

# Navigation
nav_enabled: true

# Search
search_enabled: true
search:
  heading_level: 2
  previews: 3

# Footer
aux_links:
  "View on GitHub": "https://github.com/tmchow/hzl"
  "CLI Reference (README)": "https://github.com/tmchow/hzl#cli-reference"

# Color scheme
color_scheme: dark
```

#### Step 2: Create Welcome Page

```markdown
<!-- /docs/index.md -->
---
layout: home
title: Home
nav_order: 1
---

# HZL Documentation

HZL is an external task ledger for coding agents. It provides event-sourced task coordination for multi-session, multi-agent workflows.

## Quick Links

- [Getting Started](https://github.com/tmchow/hzl#quick-start) - Install and run your first commands
- [CLI Reference](https://github.com/tmchow/hzl#cli-reference) - Complete command documentation
- [Web Dashboard](./dashboard) - Visual task management with `hzl serve`
- [Scenarios](./scenarios/) - Real-world workflow tutorials

## Why HZL?

- **Event-sourced** - Full history, never lose data
- **Multi-agent** - Claude Code, Codex, Gemini can all coordinate
- **CLI-first** - Works in any terminal, any environment
```

#### Step 3: Create Dashboard Documentation

```markdown
<!-- /docs/dashboard.md -->
---
layout: default
title: Web Dashboard
nav_order: 2
---

# Web Dashboard

The HZL web dashboard provides a visual Kanban board for managing tasks.

## Starting the Dashboard

```bash
hzl serve
# Server running at http://localhost:3456
```

## Features

### Kanban Board
- Tasks organized by status: Ready, In Progress, Blocked, Done
- Drag and drop to change status
- Click tasks to see details

### Filtering
- Filter by project
- Filter by date range
- Show/hide archived tasks

### Real-time Updates
- Dashboard polls for changes
- Multiple users can view simultaneously

## Remote Access

To access from another machine:

```bash
hzl serve --host 0.0.0.0
```

⚠️ **Security note:** This exposes the dashboard on your network. Use with caution.

## Programmatic Usage

The dashboard is also available as a library:

```typescript
import { createWebServer } from 'hzl-web';

const server = createWebServer({
  port: 3456,
  taskService,
  eventStore,
});

server.listen();
```
```

#### Step 4: Create Concept Pages (Primitives/Nouns)

Each concept page explains one core primitive:

**`docs/concepts/projects.md`**
- What is a project? (Stable container for related work)
- When to create a project (per feature, per repo, per initiative)
- Project lifecycle (create → active → archive)
- Listing and filtering projects

**`docs/concepts/tasks.md`**
- Task statuses: `ready`, `in_progress`, `blocked`, `done`, `archived`
- Claiming tasks (`hzl task claim`)
- The `--author` flag for multi-agent attribution
- Checkpoints for recording progress
- Completing vs archiving

**`docs/concepts/subtasks.md`**
- Parent/child relationship (`--parent` flag)
- Max 1 level of nesting (tasks → subtasks only)
- When to use subtasks vs separate tasks
- Parent task completion rules

**`docs/concepts/dependencies.md`**
- How `--depends-on` works
- Blocked status (when dependencies aren't done)
- `hzl task next` respects dependencies
- Dependencies vs subtasks (sequencing vs breakdown)

#### Step 5: Create Scenario Pages

Each scenario page follows this structure:

```markdown
---
layout: default
title: Multi-Agent Coordination
parent: Scenarios
nav_order: 1
---

# Multi-Agent Coordination

How to coordinate work between Claude Code, Codex, and other AI agents.

## The Pattern

1. Create a project for the feature
2. Break work into tasks with clear boundaries
3. Each agent claims tasks with `--author` attribution
4. Use checkpoints to record progress
5. Complete tasks when done

## Example Workflow

### Setup (Human)
```bash
hzl project create auth-feature
hzl task add "Design auth schema" -P auth-feature
hzl task add "Implement login endpoint" -P auth-feature --depends-on 1
hzl task add "Add session middleware" -P auth-feature --depends-on 2
```

### Claude Code Claims Task
```bash
hzl task claim 1 --author claude-code
# ... does work ...
hzl task checkpoint 1 "Schema designed: users table with email, password_hash"
hzl task complete 1
```

### Codex Picks Up Next
```bash
hzl task next -P auth-feature  # Returns task 2 (now unblocked)
hzl task claim 2 --author codex
```

## Tips

- Use `--author` consistently for attribution
- Keep tasks small (1-2 hours of work)
- Use dependencies to enforce ordering
- Checkpoint frequently for context
```

#### Step 6: Enable GitHub Pages

1. Go to repo Settings → Pages
2. Source: "Deploy from a branch"
3. Branch: `main`
4. Folder: `/docs`
5. Save

#### Step 7: Configure Custom Domain

1. Create `/docs/CNAME` containing `hzl-tasks.com`
2. In DNS provider, add CNAME record: `hzl-tasks.com` → `tmchow.github.io`
3. GitHub Pages auto-provisions HTTPS

## Files to Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| `docs/_config.yml` | Jekyll configuration | 25 |
| `docs/index.md` | Welcome page | 40 |
| `docs/concepts/index.md` | Concepts overview | 30 |
| `docs/concepts/projects.md` | What projects are, when to create | 60 |
| `docs/concepts/tasks.md` | Task lifecycle, statuses, claiming | 80 |
| `docs/concepts/subtasks.md` | Parent/child relationships | 60 |
| `docs/concepts/dependencies.md` | How --depends-on works | 60 |
| `docs/dashboard.md` | hzl serve documentation | 80 |
| `docs/scenarios/index.md` | Scenarios overview | 30 |
| `docs/scenarios/multi-agent-coordination.md` | Tutorial | 100 |
| `docs/scenarios/session-handoffs.md` | Tutorial | 80 |
| `docs/scenarios/project-organization.md` | Tutorial | 80 |
| `docs/scenarios/dependency-sequencing.md` | Tutorial | 80 |
| `docs/CNAME` | Custom domain | 1 |

**Total: ~806 lines**

## What We're NOT Doing

| Removed | Why |
|---------|-----|
| VitePress | Jekyll is built into GitHub Pages, zero setup |
| CLI extraction script | README has the CLI reference, keep it there |
| Zod schemas | No extraction = no schemas needed |
| Workspace package | Just a `/docs` folder |
| Separate CI workflow | GitHub Pages deploys automatically |
| Bundle size monitoring | No build = no bundle |

## Acceptance Criteria

- [ ] `docs/_config.yml` enables just-the-docs theme
- [ ] Site accessible at hzl-tasks.com
- [ ] Navigation sidebar shows all pages
- [ ] Search finds content across all pages
- [ ] Dark mode toggle works
- [ ] All 5 scenario/dashboard pages written
- [ ] Links to README for CLI reference work

## Timeline

| Task | Estimate |
|------|----------|
| Create Jekyll config | 15 min |
| Write index.md | 15 min |
| Write 4 concept pages (projects, tasks, subtasks, dependencies) | 1.5 hours |
| Write dashboard.md | 30 min |
| Write 4 scenario pages | 2 hours |
| Enable GitHub Pages | 5 min |
| Configure DNS | 15 min |
| **Total** | ~5 hours |

## Success Metrics

- Site live at hzl-tasks.com
- Navigation works
- Search works
- Dashboard documented
- 4 scenario tutorials available
- README unchanged (still the CLI reference)

## References

- [just-the-docs theme](https://just-the-docs.com/)
- [GitHub Pages documentation](https://docs.github.com/en/pages)
- [GitHub Pages custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
