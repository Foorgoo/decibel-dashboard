# Bot API Integration Checklist

## 1. Endpoints

- `GET /api/bots`
- `POST /api/bots/:id/start`
- `POST /api/bots/:id/pause`
- `POST /api/bots/:id/trip`
- `POST /api/bots/:id/stop`
- `PUT /api/bots/:id`
- `DELETE /api/bots/:id`
- `PUT /api/bot-strategies/:id`
- `DELETE /api/bot-strategies/:id`
- `PUT /api/bot-risk-rules/:id`
- `DELETE /api/bot-risk-rules/:id`
- `POST /api/alerts/:id/ack`
- `POST /api/risk/global-kill-switch`

## 2. Request Requirements

- `Content-Type: application/json`
- `X-Idempotency-Key` header is required for all POST endpoints.
- Body includes:
  - `idempotencyKey: string` (required)
  - `action: start | pause | trip | stop` (bot action endpoints)
  - `runMode: monitor | paper | live` (bot action endpoints)
  - `bot: BotConfig` (bot action endpoints)
  - `reason?: string` (optional for bot action and kill switch)

## 3. Response Contract

Support either of these formats:

1. Direct payload:

```json
{
  "bots": [],
  "runtimes": {},
  "alerts": []
}
```

2. Envelope payload:

```json
{
  "data": {
    "bots": [],
    "runtimes": {},
    "alerts": [],
    "events": []
  },
  "error": null,
  "requestId": "req_xxx",
  "serverTime": "2026-05-14T00:00:00.000Z"
}
```

## 4. Error Contract

When failed, return `error` object with:

- `code`
- `message`
- `requestId` (recommended)
- `details` (optional)

Expected `code` values:

- `BOT_NOT_FOUND`
- `BOT_INVALID_STATUS`
- `BOT_RISK_BLOCKED`
- `BOT_IDEMPOTENCY_CONFLICT`
- `ALERT_NOT_FOUND`
- `RISK_KILL_SWITCH_LOCKED`
- `INTERNAL_ERROR`

## 5. Snapshot Data Rules

- `bots[].botId` must be globally unique.
- `runtimes` key is botId and should cover all existing bots.
- `runtimes[botId].activeRunMode` can show current runner mode: `monitor`, `paper`, or `live`.
- `runtimes[botId].marketDataStatus`: `ok`, `warning`, `down`, or `unknown`.
- `runtimes[botId].executionStatus`: `ok`, `warning`, `down`, or `unknown`.
- `runtimes[botId].latencyMs`: latest runner latency in milliseconds.
- `alerts[].id` should be unique and stable.
- `events[].id` should be unique and stable.
- `events[].botId` can be a bot id or `GLOBAL`.
- `lastHeartbeatAt` should be ISO string.

## 6. Idempotency Behavior

- Same `idempotencyKey` + same action within valid window should return same result.
- Same `idempotencyKey` + different action should return conflict (`BOT_IDEMPOTENCY_CONFLICT`).

## 6.1 Runner Behavior

- `runMode=monitor`: subscribe and calculate, but do not submit orders.
- `runMode=paper`: simulate orders and fills, but do not submit real orders.
- `runMode=live`: submit real orders. Backend should enforce stricter permission checks.
- Runner should read strategy and risk fields from `bot`.
- Runner should enforce auto-trip fields from `bot`: `heartbeatTimeoutSec`, `maxConsecutiveErrors`, `maxLatencyMs`.
- Runner should enforce `riskRules` for account, market, and global limits.
- Runner should return updated `BotSnapshot` after every state change.

## 7. Recommended Observability

- Add `requestId` to every response.
- Log: endpoint, botId, operator, idempotencyKey, result status, latency.
- Expose audit trail for status transitions and kill switch actions.

## 8. Frontend Fallback (Current)

- Local development now includes a Vite middleware backend for these endpoints.
- If endpoint is unavailable, frontend falls back to localStorage mock.
- Real backend integration can be verified by checking that network calls succeed and the Bot panel shows `真实数据`.

## 9. Strategy Management

- Strategies are editable in the Bot module.
- Strategies fill strategy and risk fields when creating or editing a bot.
- Snapshot can include `strategies`.
- If backend does not return strategies, frontend uses default local strategies.

## 10. Bulk Create

- Current frontend bulk create loops over selected subaccounts and calls `PUT /api/bots/:id`.
- Backend can later expose one bulk endpoint if needed, for example `POST /api/bots/bulk`.
- Bulk create should create each bot in `STOPPED` status by default.

## 11. Import / Export

- Current import/export is frontend local JSON.
- Export file shape: `{ version, exportedAt, bots, strategies, riskRules }`.
- Import merges bots, strategies, and risk rules by id; existing records with the same id are updated.
