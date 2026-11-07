# Operations & Production Runbook

This document details the operational architecture, deployment pipeline, monitoring, uptime checks, and error tracking for MeetIT.

---

## 1. Deployments & Infrastructure

### 1.1 Web Application (Vercel)

- **Production URL**: [https://meet-it-mu.vercel.app](https://meet-it-mu.vercel.app)
- **Host**: Vercel
- **Build Command**: `pnpm --filter @meetit/web build`
- **Output Directory**: `apps/web/dist`
- **Environment Variables**:
  - `VITE_SIGNALING_URL`: `wss://meetit.onrender.com`
  - `VITE_SUPABASE_URL`: Supabase project URL
  - `VITE_SUPABASE_ANON_KEY`: Public anonymous API key
  - `VITE_SENTRY_DSN`: (Optional) Sentry client DSN for frontend error capture

### 1.2 Preview Deployments & Staging per PR

- Every pull request and non-main branch pushed to GitHub (`Jamesuchechi/MeetIT`) triggers an isolated Vercel Preview Deployment.
- Preview environments automatically test SPA routing, PWA manifest, and frontend builds before merging into `main`.
- CI quality gate (`.github/workflows/ci.yml`) executes on every PR:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
  - `pnpm audit --prod`

### 1.3 Signaling Server & Mesh Coordinator (Render / VPS)

- **Production URL**: [https://meetit.onrender.com](https://meetit.onrender.com) (`wss://meetit.onrender.com`)
- **Host**: Render Web Service (Node.js 20+ LTS)
- **Build Command**: `pnpm install --frozen-lockfile && pnpm --filter @meetit/signaling build`
- **Start Command**: `node apps/signaling/dist/server.js`
- **Environment Variables**:
  - `PORT`: `8787` (or injected by host)
  - `ALLOWED_ORIGINS`: `https://meet-it-mu.vercel.app,http://localhost:5173`
  - `REDIS_URL`: Redis connection URL for multi-instance state sync
  - `SENTRY_DSN`: (Optional) Sentry backend DSN for server error tracking
  - `STUN_SERVERS`: Comma-separated STUN server URLs
  - `TURN_SERVERS`: Comma-separated TURN server URLs
  - `TURN_SHARED_SECRET`: Ephemeral TURN credentials shared secret
  - `TURN_CREDENTIAL_TTL_SECONDS`: `3600`

---

## 2. Health Checks & Uptime Monitoring

MeetIT signaling server exposes dedicated public probes for uptime checkers (BetterStack, UptimeRobot, Render Health Check):

| Endpoint       | Purpose                         | Response                                                                                 |
| -------------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /health`  | Standard uptime ping            | `{ "status": "ok", "uptimeSeconds": 1234, "timestamp": "..." }`                          |
| `GET /healthz` | Kubernetes / container liveness | `{ "status": "ok" }`                                                                     |
| `GET /readyz`  | Readiness probe                 | `{ "status": "ready", "rooms": 2, "activeConnections": 4, ... }`                         |
| `GET /metrics` | Operational stats dashboard     | JSON with room count, active/total peers, frame error counts, and Node.js memory metrics |

### In-App Backend Status Indicator

The frontend client includes `apps/web/src/lib/backendHealth.ts` and `BackendStatusIndicator.tsx` which periodically probes `/healthz` and measures roundtrip latency. If Render free tier takes $\ge 1500\text{ms}$ to wake from spin-down, the UI displays a helpful "Waking server..." status indicator to ensure smooth onboarding.

---

## 3. Error Tracking & Telemetry (Sentry & Join Metrics)

### 3.1 Sentry Integration

- **Web App**: Uses `@sentry/react`. Configured conditionally in `apps/web/src/lib/telemetry.tsx` via `VITE_SENTRY_DSN`.
  - Captures unhandled exceptions and unhandled promise rejections.
  - Wrapped around the React tree via `<AppErrorBoundary>` with user-friendly crash recovery UI and reload/dashboard fallback buttons.
- **Signaling Server**: Uses `@sentry/node`. Configured in `apps/signaling/src/server.ts` via `SENTRY_DSN`.

### 3.2 WebRTC Join Success Rate Telemetry

- To verify Phase 3 exit criteria (join success rate $\ge 97\%$), the web app automatically instruments the room lifecycle:
  - `recordCallJoinAttempt(roomCode)`: Tracked on join attempt.
  - `recordCallJoinSuccess(roomCode)`: Tracked when signaling and peer connection are established.
  - `recordCallJoinFailure(roomCode, reason)`: Tracked if rejected, room full, or network connection fails.
- In browser console, inspect live stats anytime with:
  ```javascript
  window.__meetit_telemetry__.getStats();
  // Returns: { attempts: 12, successes: 12, failures: 0, successRatePct: 100 }
  ```
