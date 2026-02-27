---
layout: doc
title: Workflows
nav_order: 3
has_children: true
---

# Workflows

Workflows are the default operating surface for stateless agent loops.

Use workflow commands first, then drop to primitive task commands when needed.

## Command Discovery

```bash
hzl workflow list
hzl workflow show start
hzl workflow show handoff
hzl workflow show delegate
```

## Session Decision Table

| Session state | Command | Outcome |
|---|---|---|
| Agent already has in-progress work | `hzl workflow run start --agent <id>` | Resumes one task and reports alternates |
| Agent has no in-progress work | `hzl workflow run start --agent <id> -P <project>` | Claims next eligible task |
| Work is complete and should continue elsewhere | `hzl workflow run handoff ...` | Completes source, creates follow-on with carried context |
| Work needs another agent/subtask | `hzl workflow run delegate ...` | Creates delegated task, adds dependency by default |

## Core Workflows

### Session start

```bash
hzl workflow run start --agent clara --project writing
```

### Handoff with context carry

```bash
hzl workflow run handoff \
  --from <task-id> \
  --title "Publish final copy" \
  --project marketing
```

### Delegation with parent gating

```bash
hzl workflow run delegate \
  --from <task-id> \
  --title "Research competitor claims" \
  --project research \
  --pause-parent
```

## Hook delivery model

Completion hooks are outbox-based and non-blocking.

A host scheduler must run:

```bash
hzl hook drain
```

Recommended cadence: every 1-5 minutes.

## More workflow guides

- [Single Agent](./single-agent)
- [Multi-Agent Coordination](./multi-agent)
- [Session Handoffs](./session-handoffs)
- [Blocking & Unblocking](./blocking-unblocking)
- [Human Oversight](./human-oversight)
- [Project Organization](./project-organization)
