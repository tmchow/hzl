# OpenClaw Cron Job Management — PRD

**Date:** 2026-03-10
**Status:** Brainstorming

## Goal

Give HZL dashboard operators full lifecycle management of OpenClaw cron jobs — list, create, edit, delete, and trigger — directly from the Agents view. This is HZL's first direct integration with the OpenClaw gateway, making the dashboard a control plane for agent scheduling without leaving the browser or touching the CLI.

## Scope

### In Scope

- WebSocket RPC client connecting to the co-located OpenClaw gateway (`ws://127.0.0.1:18789`)
- Full gateway handshake implementation: challenge-response with Ed25519 device identity, token auth, and device token persistence for subsequent connects
- Gateway connection configuration via in-dashboard setup UI (primary path) with sensible defaults
- Cron jobs section in the Agent Detail panel (top position, before metrics), showing jobs associated with the selected agent
- Cron job list: name, schedule expression, enabled/disabled status, last run status, next run time, last duration
- Cron job detail/edit modal with commonly-changed fields prominent and advanced fields in a collapsible section
- Create new cron job via the same modal
- Quick actions: enable/disable toggle, run now, delete
- Graceful empty/disconnected state with in-dashboard gateway configuration UI
- `cron.status` check to detect disabled scheduler vs. no jobs
- Server-side REST API endpoints that proxy browser requests to the gateway WebSocket

### Boundaries

- **Agent Detail scoped only.** No standalone "all cron jobs" view. Jobs are shown per-agent, where a job is "associated with" an agent by either `agentId` match or `sessionTarget` match (see Job Ownership below).
- **No cron run history view.** The `cron.runs` method exists but displaying run logs is deferred. Last run status and consecutive errors are visible from the job state.
- **No real-time cron event streaming.** The cron list is fetched on demand and via manual refresh. Live WebSocket events for cron state changes are a future enhancement.
- **No payload editor intelligence.** The message/text field in the create/edit modal is a plain textarea, not a syntax-highlighted code editor. Good enough for v1.
- **No cron schedule builder.** Users enter cron expressions directly (e.g., `0 8 * * *`). Invalid expressions are submitted to the gateway and errors displayed inline. A visual schedule builder is a nice-to-have for later.
- **No fallback to CLI wrapper.** WebSocket RPC is the only transport.

## Gateway Connection Protocol

The OpenClaw gateway uses a challenge-response WebSocket protocol, not simple token headers:

1. **Open WebSocket** to `ws://127.0.0.1:18789` (local loopback, no TLS)
2. **Receive `connect.challenge`** — gateway sends a nonce
3. **Sign nonce** with Ed25519 device keypair and send `connect` request:
   ```json
   {
     "type": "req", "method": "connect",
     "params": {
       "auth": { "token": "<gateway_token>" },
       "role": "operator",
       "scopes": ["operator.read", "operator.write"],
       "device": { "id": "...", "publicKey": "...", "signature": "...", "nonce": "..." }
     }
   }
   ```
4. **Receive `hello-ok`** — gateway issues a **device token** that can be persisted for future connects (replaces the gateway token on subsequent connections)

**Local loopback advantage:** Same-host connects can auto-approve device pairing, simplifying the first-connect experience.

**Device identity management:** HZL auto-generates an Ed25519 keypair on first gateway connection and persists it alongside the device token in HZL config. The operator never manages keys directly — they only provide the gateway token on first connect.

## Requirements

| ID | Priority | Requirement |
|----|----------|-------------|
| R1 | Core | Operator can view all cron jobs associated with a selected agent in the Agent Detail panel, seeing at minimum: name, schedule expression, enabled status, last run status, next run time, last duration. "Associated with" means `agentId` match OR `sessionTarget` match (see Job Ownership) |
| R2 | Core | Operator can create, edit, and delete cron jobs through the dashboard UI via modal dialogs |
| R3 | Core | HZL web server connects to OpenClaw gateway via WebSocket RPC, implementing the full challenge-response handshake: receive nonce, sign with Ed25519 device keypair, send connect with device identity + token, persist issued device token for future connects |
| R4 | Must | Gateway URL defaults to `ws://127.0.0.1:18789`; configurable via the in-dashboard setup UI (R5) which persists to HZL config. Also accepts `hzl serve` flags (`--gateway-url`, `--gateway-token`) for headless/scripted startup |
| R5 | Must | When gateway is unreachable or unconfigured, the cron section shows a graceful empty state with inline gateway configuration UI (URL + token fields, connect button). On successful connect, persist URL, token, and auto-generated device identity to HZL config |
| R6 | Must | Cron job list shows operational state: last run status (ok/error), consecutive errors count, last duration, and `cron.status` scheduler health |
| R7 | Must | Enable/disable toggle on each job calls `cron.update` with `{ enabled: true/false }` |
| R8 | Must | "Run Now" action calls `cron.run` with `{ mode: "force" }` and shows a success/failure notification with the gateway response |
| R9 | Must | Delete action calls `cron.remove` with confirmation dialog |
| R10 | Must | Create/edit modal exposes job fields in two tiers: **Primary** (name, schedule expr + tz, payload message, model, enabled) and **Advanced** (description, schedule kind, sessionTarget, wakeMode, timeout, delivery mode/channel/to/bestEffort, agentId). Advanced fields in a collapsible section |
| R11 | Must | After any mutation (create/edit/delete/toggle/run), refresh the cron list to show current state |
| R12 | Nice | Human-readable schedule descriptions alongside cron expressions (e.g., "Every 2 minutes", "Tuesdays at 3 PM PT") |
| R13 | Nice | Cron job list sortable by name, next run time, or last status |
| R14 | Nice | Connection status indicator showing WebSocket state (connected/connecting/disconnected) in the cron section header |
| R15 | Out | Run history / log viewer (`cron.runs`) — deferred |
| R16 | Out | Visual cron schedule builder — users type expressions directly |
| R17 | Out | Syntax-highlighted payload editor — plain textarea for v1 |
| R18 | Out | Real-time cron event streaming — manual/on-action refresh for v1 |

## Chosen Direction

**Agent Detail extension with WebSocket RPC.** Cron jobs appear as the topmost section in the Agent Detail panel, scoped to the selected agent. The HZL web server maintains a WebSocket connection to the OpenClaw gateway and proxies cron RPC calls from the browser via REST API endpoints (`/api/gateway/cron/*`). The proxy is thin — it forwards method + params to the gateway and returns the response. No domain-specific endpoint design; the proxy maps 1:1 to gateway RPC methods.

This was chosen over:
- **Cron tab in Agents view** — rejected because it couples two distinct concepts in one view and adds tab management complexity.
- **Dedicated top-level Cron view** — rejected because it separates cron from the agent context it belongs to and adds a 5th nav item.
- **CLI wrapper transport** — rejected because each call spawns a new Node.js process (200-500ms overhead), making the dashboard feel sluggish for interactive operations. HZL and OpenClaw are co-located, so the CLI is available, but the latency cost is unacceptable.

## Key Decisions

- **WebSocket RPC over CLI wrapper:** Persistent connection gives 10-50ms RPC latency vs 200-500ms per CLI call. HZL and OpenClaw are always co-located (agents use the `hzl` CLI directly), so both transports are viable — WebSocket wins on responsiveness for interactive dashboard use.
- **Server-side proxy, not browser WebSocket:** The browser talks to HZL's HTTP API; the HZL server maintains the WebSocket connection to the gateway. This keeps auth credentials and device identity server-side.
- **Thin RPC proxy:** The REST API is a generic pass-through to gateway RPC methods, not domain-specific endpoints. This minimizes the API surface to maintain and extends naturally to future OpenClaw integrations.
- **Lazy connect with auto-reconnect:** WebSocket connects on first cron request, not at server startup. Auto-reconnects on disconnect with exponential backoff. Gateway unavailability is isolated from existing dashboard functionality (tasks, events, agents all work independently).
- **Auto-managed device identity:** HZL generates an Ed25519 keypair on first connect and persists it + the device token in HZL config. Operators never interact with keys — they only provide the gateway token. Local loopback auto-approves device pairing.
- **In-dashboard config UI as primary setup path:** Since this is HZL's first OpenClaw integration, the in-dashboard configuration is the main DX. CLI flags (`--gateway-url`, `--gateway-token`) exist for headless/scripted startup but aren't the primary path.
- **Cron section at top of Agent Detail:** Cron jobs are the agent's scheduled work — the most operationally relevant info after the agent's identity and status.
- **Gateway token in plaintext config:** Acceptable for v1. The gateway token is a local credential, same sensitivity as the webhook URL/headers already stored in HZL config. Future enhancement: environment variable override.
- **Server-side validation for cron expressions:** No client-side cron parser. Invalid expressions are submitted to the gateway; errors are displayed inline in the modal. Keeps the client thin.

## Job Ownership

A cron job is "associated with" an agent based on this rule:

1. If a job has `agentId`, it belongs to that agent
2. If a job has no `agentId` but has `sessionTarget: "main"`, it belongs to the agent that owns the main session (typically "main")
3. If a job has neither `agentId` nor a recognized `sessionTarget`, it appears under a synthetic "unassigned" group (edge case)

This reflects the OpenClaw session model:
- `sessionTarget: "isolated"` + `agentId` → dedicated agent turn in a fresh session
- `sessionTarget: "main"` + no `agentId` → injects into the agent's live main session

When viewing an agent, the cron section shows all jobs matching rule 1 or 2 for that agent.

## Next Steps

→ Create technical plan
