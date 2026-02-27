---
layout: doc
title: Project Organization
parent: Workflows
nav_order: 7
---

# Project Organization

How to use optional project scopes effectively.

## Start With a Simple Rule

Treat projects as long-lived domain queues.

Good examples:
- `research`
- `writing`
- `checkout`
- `platform`

If you do not need boundaries, use `inbox` and skip projects.

## Choosing a Strategy

### Strategy A: No Projects

Best for ad hoc or low-volume work.

```bash
hzl task add "Investigate alert noise"
hzl task claim --next --agent ops-1
```

### Strategy B: Domain Scopes

Best for multiple agents sharing one area.

```bash
hzl project create research
hzl task add "Summarize paper set" -P research
hzl task claim --next -P research --agent research-1
```

### Strategy C: Product/Repo-Aligned Scopes

Useful when a long-lived code area maps cleanly to one scope.

```bash
hzl project create api-service
hzl task add "Refactor auth endpoints" -P api-service
```

## Anti-Pattern: Scope Proliferation

Avoid creating a project for every tiny feature or one-off task.

Prefer parent tasks/subtasks inside an existing domain scope.

## Best Practices

1. Keep project names stable and domain-oriented.
2. Use projects for shared multi-agent pools.
3. Use `inbox` for ad hoc intake.
4. Review project list periodically and merge redundant scopes.
