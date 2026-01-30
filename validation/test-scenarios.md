# HZL Test Scenarios

## Ideal End-to-End Test Case: "Multi-Agent API Build"

This scenario exercises the full coordination system: orchestration, worker behavior, dependency resolution, status reporting, and error recovery.

---

## Scenario Overview

**Goal**: Build a small REST API with 3 endpoints, coordinated by HZL.

**Why this is the ideal test**:
1. **Multiple agents** — Tests concurrent database access
2. **Dependencies** — Tests "ready" logic and blocking behavior
3. **Full lifecycle** — Tests create → claim → comment → complete flow
4. **Error paths** — Tests release, stuck detection, and troubleshooting
5. **Reporting** — Tests status report generation

---

## Phase 1: Orchestrator Creates Task Tree

The orchestrator agent breaks down the work:

```bash
# Create the independent task first
hzl task create "Define user schema" \
  --project=api-build \
  --description="Create TypeScript interfaces in src/types/user.ts" \
  --tags=backend,schema \
  --priority=3
# Returns: TASK_SCHEMA

# Create dependent endpoint tasks
hzl task create "Implement GET /users endpoint" \
  --project=api-build \
  --description="Read all users from database. File: src/routes/users.ts" \
  --depends-on=TASK_SCHEMA \
  --tags=backend,api \
  --priority=2
# Returns: TASK_GET

hzl task create "Implement POST /users endpoint" \
  --project=api-build \
  --description="Create new user. Validate input per schema." \
  --depends-on=TASK_SCHEMA \
  --tags=backend,api \
  --priority=2
# Returns: TASK_POST

hzl task create "Implement DELETE /users/:id endpoint" \
  --project=api-build \
  --description="Delete user by ID. Return 404 if not found." \
  --depends-on=TASK_SCHEMA \
  --tags=backend,api \
  --priority=1
# Returns: TASK_DELETE

# Create final integration task
hzl task create "Write API integration tests" \
  --project=api-build \
  --description="Test all endpoints with Jest. File: src/__tests__/api.test.ts" \
  --depends-on=TASK_GET,TASK_POST,TASK_DELETE \
  --tags=testing \
  --priority=1
# Returns: TASK_TESTS

# Move schema task to ready (it has no deps)
hzl task ready TASK_SCHEMA
```

**Verification Points**:
- [ ] 5 tasks created in `tasks_current`
- [ ] 5 `task_created` events in event store
- [ ] Dependency edges in `task_dependencies` table
- [ ] Only TASK_SCHEMA is claimable (others have incomplete deps)

---

## Phase 2: Worker Agents Execute

### Worker 1 Claims Schema Task

```bash
# Worker-1 finds available work
hzl task list --status=ready --project=api-build
# Shows: TASK_SCHEMA (only one available)

# Worker-1 claims it
hzl task claim TASK_SCHEMA --lease-minutes=30

# Worker-1 adds progress comment
hzl task comment TASK_SCHEMA "Created User interface with id, email, name fields"

# Worker-1 completes
hzl task complete TASK_SCHEMA
```

**Verification Points**:
- [ ] Task transitioned: backlog → ready → in_progress → done
- [ ] `claimed_at`, `claimed_by_author` populated during in_progress
- [ ] Comment stored in `task_comments`
- [ ] After completion: TASK_GET, TASK_POST, TASK_DELETE become claimable

### Workers 2, 3, 4 Race for Tasks

```bash
# Worker-2
hzl task list --status=ready --project=api-build
# Shows: GET, POST, DELETE (all now have deps satisfied)

hzl task claim TASK_GET
# Success!

# Worker-3 (simultaneously)
hzl task claim TASK_POST
# Success!

# Worker-4 (simultaneously)
hzl task claim TASK_DELETE
# Success!
```

**Verification Points**:
- [ ] All three claims succeed (no race condition conflicts)
- [ ] Each task has different `claimed_by_agent_id`
- [ ] TASK_TESTS still not claimable (waiting on 3 deps)

### Worker-2 Gets Blocked and Releases

```bash
# Worker-2 realizes they need something
hzl task comment TASK_GET "Missing database connection module"
hzl task release TASK_GET --reason="Need database module first"
# Task goes back to ready
```

**Verification Points**:
- [ ] Task status: in_progress → ready
- [ ] `claimed_at` cleared
- [ ] Release event with reason in event store
- [ ] Task can be claimed by another worker

### Worker-5 Claims Released Task

```bash
hzl task list --status=ready --project=api-build
# Shows: TASK_GET (released)

hzl task claim TASK_GET
hzl task complete TASK_GET
```

---

## Phase 3: Lease Expiration (Stuck Task Simulation)

```bash
# Worker-3 crashes without completing TASK_POST
# (Simulate by doing nothing for lease duration)

# Orchestrator checks for stuck tasks
hzl task list --stuck --project=api-build
# Shows: TASK_POST (lease expired)

# Orchestrator releases it
hzl task release TASK_POST
```

**Verification Points**:
- [ ] `--stuck` flag correctly identifies expired leases
- [ ] Released task becomes claimable again

---

## Phase 4: All Dependencies Complete

```bash
# After all endpoint tasks complete:
hzl task list --status=ready --project=api-build
# Shows: TASK_TESTS (all 3 deps now done)

hzl task claim TASK_TESTS
hzl task complete TASK_TESTS
```

---

## Phase 5: Status Report

```bash
hzl project stats api-build
```

**Expected Output**:
```
Project: api-build
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done:     ██████████████████  5/5  (100%)
Active:   ░░░░░░░░░░░░░░░░░░  0/5
Ready:    ░░░░░░░░░░░░░░░░░░  0/5
Blocked:  ░░░░░░░░░░░░░░░░░░  0/5

Recent Completions:
- Write API integration tests    (2m ago)
- Implement GET /users endpoint  (4m ago)
- Implement POST /users endpoint (3m ago)
- Implement DELETE /users        (5m ago)
- Define user schema             (7m ago)
```

---

## CLI Commands to Verify (Checklist)

Run these commands to validate the system works end-to-end:

| Command | Expected Behavior |
|---------|-------------------|
| `hzl task create ... --depends-on=X` | Creates task with dependency |
| `hzl task list --status=ready` | Only shows tasks with deps satisfied |
| `hzl task claim <id>` | Transitions to in_progress |
| `hzl task claim <id>` (another agent) | Fails with "already claimed" |
| `hzl task comment <id> "..."` | Adds comment to task history |
| `hzl task complete <id>` | Unblocks dependent tasks |
| `hzl task release <id>` | Goes back to ready |
| `hzl task list --stuck` | Shows expired leases |
| `hzl project stats <project>` | Shows progress breakdown |

---

## Database State Assertions

After the full scenario, verify:

```sql
-- All tasks done
SELECT COUNT(*) FROM tasks_current WHERE status = 'done';
-- Expected: 5

-- Event history preserved
SELECT COUNT(*) FROM events;
-- Expected: ~15-20 events (create, claim, complete, comments, releases)

-- Dependencies intact
SELECT COUNT(*) FROM task_dependencies;
-- Expected: 4 (schema→GET, schema→POST, schema→DELETE, GET+POST+DELETE→tests)

-- Comments captured
SELECT COUNT(*) FROM task_comments;
-- Expected: 2
```

---

## Stress Test Variation

For concurrency testing, spawn 5 workers simultaneously:

```bash
# Terminal 1-5 (parallel)
while true; do
  TASK=$(hzl task claim-next --project=api-build)
  if [ -z "$TASK" ]; then break; fi
  sleep 2  # Simulate work
  hzl task complete $TASK
done
```

**Expected**: No database locks, no duplicate claims, orderly completion.
