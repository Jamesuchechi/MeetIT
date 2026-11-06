# MeetIT Deployment & Environment Configuration

This guide details how to deploy the MeetIT full-stack application across **Vercel** (Frontend PWA), **Fly.io** (Signaling Server), and **Upstash Redis** (Cluster Pub/Sub & Presence).

---

## 1. Upstash Redis Setup

1. Create a free account at [console.upstash.com](https://console.upstash.com).
2. Create a new Redis database (select standard regional database, e.g. `us-east-1` or closest to your users).
3. Copy the **Redis Connect URL** (`rediss://default:...@...upstash.io:6379`).
4. This URL is passed as the `REDIS_URL` environment variable to the signaling server.
   > **Note:** If `REDIS_URL` is omitted, the signaling server seamlessly operates in standalone in-memory mode for zero-config local development.

---

## 2. Deploy Backend Signaling to Fly.io

### Prerequisites

- Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
- Log in: `fly auth login`

### Steps

1. Navigate to repository root:
   ```bash
   cd MeetIT
   ```
2. Initialize or launch the app:

   ```bash
   fly launch --no-deploy
   ```

   _(Select your region, e.g., `iad` or `ams`)._

3. Set production secrets on Fly:

   ```bash
   # Upstash Redis URL (with TLS)
   fly secrets set REDIS_URL="rediss://default:your-token@your-db.upstash.io:6379"

   # Allowed frontend origins (your Vercel domains)
   fly secrets set ALLOWED_ORIGINS="https://meetit.vercel.app,https://your-custom-domain.com"

   # Optional: Supabase credentials for meeting persistence
   fly secrets set SUPABASE_URL="https://your-supabase-project.supabase.co"
   fly secrets set SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

   # Optional: Turn credentials (if using Metered.ca, Twilio, or Coturn)
   fly secrets set TURN_URLS="turn:turn.metered.ca:443"
   fly secrets set TURN_SHARED_SECRET="your-turn-secret"
   ```

4. Deploy the signaling container:

   ```bash
   fly deploy
   ```

5. Verify deployment:
   ```bash
   curl https://meetit-signaling.fly.dev/healthz
   # Returns: {"status":"ok","time":"..."}
   ```

---

## 3. Deploy Frontend Web to Vercel

1. Import the `MeetIT` repository into Vercel.
2. Configure project settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `apps/web`
   - **Build Command**: `pnpm --filter @meetit/web build`
   - **Output Directory**: `dist`
3. Add Environment Variables in Vercel:
   - `VITE_SIGNALING_URL`: `wss://meetit-signaling.fly.dev`
   - `VITE_SUPABASE_URL`: `https://your-project.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `your-anon-public-key`
4. Click **Deploy**. Vercel will build and distribute the PWA with `vercel.json` SPA rewrites and Service Worker cache headers.

---

## 4. Environment Variables Reference

| Variable                 | Target    | Description                                      | Example                                   |
| :----------------------- | :-------- | :----------------------------------------------- | :---------------------------------------- |
| `REDIS_URL`              | Signaling | Upstash / standard Redis connection URL with TLS | `rediss://default:xxx@...upstash.io:6379` |
| `ALLOWED_ORIGINS`        | Signaling | Comma-separated CORS origins                     | `https://meetit.vercel.app`               |
| `STUN_URLS`              | Signaling | STUN servers (defaults to Google STUN)           | `stun:stun.l.google.com:19302`            |
| `TURN_URLS`              | Signaling | Optional TURN relay servers                      | `turn:turn.metered.ca:443`                |
| `TURN_SHARED_SECRET`     | Signaling | Shared HMAC secret for ephemeral credentials     | `secret-token`                            |
| `VITE_SIGNALING_URL`     | Web       | WebSocket URL of deployed signaling server       | `wss://meetit-signaling.fly.dev`          |
| `VITE_SUPABASE_URL`      | Web & Sig | Supabase Project URL                             | `https://xyz.supabase.co`                 |
| `VITE_SUPABASE_ANON_KEY` | Web       | Supabase public anon key                         | `eyJhbG...`                               |
