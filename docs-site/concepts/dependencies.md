---
layout: doc
title: Dependencies
parent: Concepts
nav_order: 4
---

# Dependencies

Dependencies model task prerequisites.

A task is available when:
1. task status is `ready`, and
2. all dependency targets are `done`.

## Cross-project dependencies

Dependencies can connect tasks across projects.

Example:

```bash
hzl task add "Write landing page" -P writing -s ready
hzl task add "Research source quotes" -P research -s ready
hzl task add-dep <writing-task-id> <research-task-id>
```

## Create dependencies

At task creation:

```bash
hzl task add "Implement endpoints" -P backend --depends-on <design-id>
```

After creation:

```bash
hzl task add-dep <task-id> <depends-on-id>
hzl task remove-dep <task-id> <depends-on-id>
```

## Query dependency edges

Use `dep list` to inspect relationships:

```bash
hzl dep list
hzl dep list --project research
hzl dep list --from-project writing --to-project research
hzl dep list --agent clara
hzl dep list --blocking-only
hzl dep list --cross-project-only
```

## Validation rules

HZL enforces:
- no cycles,
- no self-dependency,
- dependency target task must exist for new edges.

Use:

```bash
hzl validate
```

## Patterns

### Fan-out

One task unlocks many:

```bash
hzl task add "Finalize API contract" -P backend
hzl task add "Implement frontend integration" -P web --depends-on <contract-id>
hzl task add "Implement backend handlers" -P backend --depends-on <contract-id>
```

### Fan-in

Many tasks unlock one:

```bash
hzl task add "Frontend complete" -P web
hzl task add "Backend complete" -P backend
hzl task add "End-to-end test pass" -P qa --depends-on <frontend-id>,<backend-id>
```

## Blocking semantics

- `dep list --blocking-only` shows edges currently blocking work.
- Dependency blocking and `blocked` status are separate concepts:
  - dependency blocking controls availability,
  - `blocked` status signals external blockers.
