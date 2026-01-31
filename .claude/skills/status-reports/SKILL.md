---
name: status-reports
description: How to format status reports for humans
---

# Status Reports Skill

When a human asks "how's it going?", query the ledger and format a clear response.

## Template

```markdown
## Project: {PROJECT_NAME}
**Updated**: {TIMESTAMP}

### Progress
Done:    ████████░░░░   8/12 (67%)
Active:  ██░░░░░░░░░░   2/12
Ready:   ░░░░░░░░░░░░   0/12
Blocked: ██░░░░░░░░░░   2/12

### 🔄 In Progress
| Task | Worker | Time | Lease |
|------|--------|------|-------|
| Implement /users | worker-003 | 5m | 25m left |
| Build login UI | worker-007 | 12m | 18m left |

### 🚧 Blocked
- "Add password reset" → waiting on: email integration
- "Deploy to staging" → waiting on: users, login UI

### ✅ Recently Completed
- Database schema (worker-003, 45m ago)
- API scaffolding (worker-001, 30m ago)

### ⚠️ Issues
- None (or list stuck/failed tasks)

### 📋 Next Up
- Add pagination to /posts
- Create user profile page
```

## Queries to Run

```bash
# Get stats
hzl project stats api-v2

# Active tasks with timing
hzl task list --status=in_progress --project=api-v2

# Recent completions
hzl task list --status=done --project=api-v2 --since=1h

# Stuck tasks
hzl task list --stuck --project=api-v2
```

## Tips

- Lead with progress percentage
- Show active workers by name
- Highlight blockers explicitly
- Keep it scannable (tables, bullets)
