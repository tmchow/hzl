# HZL Documentation Site Brainstorm

**Date:** 2026-02-01
**Status:** Design complete, simplified after review

## What We're Building

A documentation site for HZL using GitHub Pages with Jekyll. The site provides:

1. **Concept pages** - Explain core primitives (Projects, Tasks, Subtasks, Dependencies)
2. **Dashboard documentation** - How to use `hzl serve` and the Kanban UI
3. **Scenario tutorials** - Real-world workflows (multi-agent coordination, session handoffs)

The README remains the authoritative CLI reference - no duplication.

### Structure

```
/docs/
  _config.yml           # Jekyll config (just-the-docs theme)
  index.md              # Welcome page
  concepts/
    projects.md         # What projects are, when to create
    tasks.md            # Task lifecycle, claiming, checkpoints
    subtasks.md         # Parent/child relationships
    dependencies.md     # How --depends-on works
  dashboard.md          # hzl serve documentation
  scenarios/
    multi-agent-coordination.md
    session-handoffs.md
    project-organization.md
    dependency-sequencing.md
  CNAME                 # hzl-tasks.com

README.md               # Keep as-is (CLI reference)
```

## Why This Approach

**GitHub Pages + Jekyll** was chosen after review feedback that VitePress was over-engineering:

1. **Zero build infrastructure** - Jekyll is built into GitHub Pages
2. **Navigation + search included** - just-the-docs theme provides both
3. **No custom scripts** - README already has CLI reference
4. **Ships in hours, not days** - ~5 hours of content writing

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | GitHub Pages + Jekyll | Zero setup, built-in to GitHub |
| Theme | just-the-docs | Navigation, search, dark mode included |
| CLI reference | Keep in README | Already comprehensive, no duplication |
| Content approach | Hand-written | 14 pages in ~5 hours vs infrastructure |
| Deployment | GitHub Pages | Automatic on push to main |
| Custom domain | hzl-tasks.com | CNAME file + DNS configuration |

## What We Removed (After Review)

The original plan included infrastructure that reviewers flagged as over-engineering:

| Removed | Why |
|---------|-----|
| VitePress | Jekyll is simpler, built into GitHub Pages |
| packages/hzl-docs workspace | Just need a /docs folder |
| CLI extraction script | README has CLI reference already |
| Zod schemas | No extraction = no validation needed |
| AI generation script | Writing 4 scenarios manually is faster |
| Separate CI workflow | GitHub Pages deploys automatically |
| TypeScript tooling | No build step needed |

## Resolved Questions

| Question | Decision |
|----------|----------|
| Domain | `hzl-tasks.com` via GitHub Pages custom domain |
| Search | just-the-docs built-in search |
| Versioning | Latest only |
| Dark mode | just-the-docs theme toggle |
| CLI docs | Stay in README, link from docs site |

## Next Steps

See `docs/plans/2026-02-01-feat-documentation-site-plan.md` for implementation details.
