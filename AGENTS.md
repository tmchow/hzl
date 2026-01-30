# HZL Integration

Copy this section into your project's CLAUDE.md or AGENTS.md:

---

````markdown
## Task Coordination (HZL)

This project uses `hzl` for task coordination.

### Core Commands
```bash
hzl next                        # Show next available task  
hzl claim <id>                  # Take ownership of a task
hzl complete <id>               # Mark task done
hzl release <id>                # Give up task (let others claim it)
```

### During Work
```bash
hzl comment <id> "progress..."  # Add progress note
hzl checkpoint <id> "name"      # Save recovery point for long tasks
```

### Discovery
```bash
hzl list                        # All tasks
hzl list --status=ready         # Available tasks
hzl show <id>                   # Task details + history
```

### Workflow
1. `hzl next` → see what's available
2. `hzl claim <id>` → take ownership
3. Do the work (add comments/checkpoints as needed)
4. `hzl complete <id>` or `hzl release <id>` if blocked

### Rules
- Claim before working (prevents duplicate effort)
- One task at a time
- Always complete or release—never abandon silently
````
