# HZO: Hypersand Orchestrator Brainstorm

> **Status**: Early Design Exploration  
> **Date**: 2026-01-30  

---

## The Vision

```bash
/hzo "build user authentication feature"
```

That's it. One command. It figures everything out:
- Uses `hzl` CLI to manage tasks in the ledger
- Knows how to brainstorm, plan, spawn subagents
- No new architecture—just a skill/workflow

---

## Superpowers Framework (Research)

[obra/superpowers](https://github.com/obra/superpowers) provides the pattern we want:

```
brainstorming → writing-plans → subagent-driven-development
```

| Skill | What It Does |
|-------|--------------|
| **brainstorming** | One question at a time → design doc |
| **writing-plans** | Bite-sized tasks (2-5 min), exact code in plan |
| **subagent-driven-development** | Fresh subagent per task + two-stage review |

Key patterns:
- **Fresh context per task**: Subagent starts clean
- **Two-stage review**: Spec compliance first, then code quality
- **Complete code in plans**: Not descriptions—actual code

---

## What HZO Does

```
/hzo "build feature xyz"
         │
         ▼
┌─────────────────────────────────────────┐
│            HZO Skill/Workflow           │
├─────────────────────────────────────────┤
│ 1. BRAINSTORM (optional)                │
│    Ask questions, refine idea           │
│    Save design doc                      │
├─────────────────────────────────────────┤
│ 2. PLAN                                 │
│    Break into bite-sized tasks          │
│    Include exact code, file paths       │
├─────────────────────────────────────────┤
│ 3. LOAD TO LEDGER                       │
│    hzl task create ...                  │
│    hzl task set-deps ...                │
├─────────────────────────────────────────┤
│ 4. SPAWN WORKERS                        │
│    Dispatch subagents (platform-dep)    │
│    Each gets worker skill + task        │
├─────────────────────────────────────────┤
│ 5. MONITOR                              │
│    hzl task list --status=in_progress   │
│    Handle stuck, review completions     │
├─────────────────────────────────────────┤
│ 6. REPORT                               │
│    Done! Here's what was built.         │
└─────────────────────────────────────────┘
```

---

## HZO + HZL = Durable Superpowers

| Superpowers | HZO + HZL |
|-------------|-----------|
| In-memory tracking | Durable SQLite ledger |
| Single session | Survives crashes, resumes |
| Subagent dispatch | CLI task claims (`hzl task claim`) |
| Manual monitoring | `hzl task list --stuck` |

**HZL is the durable backbone.** HZO is the skill that knows how to use it.

---

## What We Need to Build

### The HZO Skill (`skills/hzo.md`)

```markdown
---
description: End-to-end orchestration - from idea to implemented feature
---

# HZO Skill

When invoked with `/hzo "goal"`, you:

1. **Brainstorm** (use brainstorming patterns if needed)
2. **Plan** (use writing-plans patterns)
3. **Load to HZL** (hzl task create with deps)
4. **Spawn workers** (generate prompts or dispatch subagents)
5. **Monitor** (watch for stuck tasks)
6. **Report** (summarize what was done)

## Loading to HZL

For each task in your plan:
- hzl task create "title" --project=<project> --description="..."
- hzl task add-dep <task-id> <depends-on-id>
- hzl task ready <task-id>  # when deps satisfied

## Spawning Workers

Generate a worker prompt:
- Include agent_id, database path
- Reference worker.md skill
- Tell them which project to claim from

## Monitoring

- hzl task list --status=in_progress --project=<project>
- hzl task list --stuck --project=<project>
- Handle failures: release, reassign, escalate
```

---

## Open Questions

1. **Task granularity**: Superpowers says 2-5 min. Our planning.md says 15-60 min. Which for HZO?
   - Thought: Smaller is better for parallelism and fresh context

2. **Subagent dispatch**: How does HZO actually spawn agents?
   - Platform specific (Claude Code, Gemini, etc.)
   - For now: generate prompts, human pastes

3. **Review gates**: Superpowers has two-stage review. Add to HZL or keep in skill?
   - Thought: Skill can orchestrate, no new HZL features needed

4. **Plan format**: Should HZO parse existing plans, or always generate fresh?
   - Both: `/hzo "goal"` generates, `/hzo load plan.md` parses

---

## Next Steps

1. [ ] Draft `skills/hzo.md` with full workflow
2. [ ] Test: manually run HZO workflow on a small feature
3. [ ] Iterate on task granularity and spawning
4. [ ] Consider CLI helpers (`hzl plan load`, `hzl worker prompt`)

---

## Related

- [superpowers/brainstorming](https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md)
- [superpowers/writing-plans](https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md)
- [superpowers/subagent-driven-development](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/SKILL.md)
- `skills/orchestrator.md` - Existing (simpler) orchestrator
- `skills/planning.md` - Task sizing
- `skills/worker.md` - Worker behavior
