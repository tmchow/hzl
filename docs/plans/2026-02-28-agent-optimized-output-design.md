# Agent-Optimized CLI Output

## Problem

HZL defaults to JSON and has solid infrastructure (exit codes, error envelopes, view tiers) but commands bypass the shared helpers. Output is inconsistent: some pretty-print, errors embed hints in message strings, and agents can't self-recover from failures.

## Decisions

- **No success envelope**: Exit codes (0-6) already signal success/failure. Wrapping success in `{ok:true,data:{...}}` wastes tokens and forces `.data` unwrapping. Errors already use envelopes — keep that asymmetry.
- **No null omission for scalars**: Missing keys vs explicit null is ambiguous. `--view` tiers handle field reduction explicitly.
- **No `--fields` flag**: `--view summary|standard|full` covers the 80% case without per-command field parsing.

## Changes

### 1. Compact JSON (all commands)

Normalize ~8 commands using `JSON.stringify(result, null, 2)` to compact `JSON.stringify(result)`. Whitespace is wasted tokens for agent consumers.

Affected: history, status, doctor, init, lock, sync, prune, hook.

### 2. Structured error suggestions

Add `suggestions?: string[]` to `CLIError` and `ErrorEnvelope`. Move `\nHint:` strings out of error messages into this field. Add suggestions to key error paths:

| Error | Suggestion |
|-------|-----------|
| Task not found | `hzl task list -P <project>` |
| Not claimable (wrong status) | `hzl task set-status <id> ready` |
| Cannot complete (not in_progress) | `hzl task claim <id> --agent <name>` |
| Dependencies not done | `hzl task show <blocker_id>` |
| Cannot block (wrong status) | `hzl task claim <id> --agent <name>` |
| Ambiguous prefix | list matching IDs |
| Parent not found | `hzl task list -P <project>` |

JSON error output becomes:
```json
{"schema_version":"v2","ok":false,"error":{"code":"invalid_input","message":"Cannot complete task abc (status: ready)","suggestions":["hzl task claim abc --agent <name>"]}}
```

Human-readable output keeps `Hint:` format for readability.

### 3. `--view` on `show` command

Add `--view summary|standard|full` (default: `full`). Agents doing status checks use `--view summary` to skip description, links, metadata, comments, checkpoints.

### 4. Strip empty collections

Strip `[]` and `{}` from optional collection fields (tags, links, metadata) during JSON serialization. Keep `null` for scalars — meaningful signal, predictable schema.

Implement as a shared `stripEmptyCollections()` utility used before serialization.
