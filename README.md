# MeetIT

> Fast, resilient, open video meetings. Join in one click, stay connected on bad networks, own your data.

MeetIT is a Google Meet-class video conferencing platform built on WebRTC. It starts as a lean peer-to-peer product and grows into an SFU-backed platform with recording, captions, breakout rooms, webinars, an embeddable SDK, and AI meeting intelligence.

It is the sibling product to [FormIT](https://form-it-sandy.vercel.app/), and the two are designed to integrate (polls, post-meeting surveys, attendance forms).

---

## Status

| Area            | State                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| Phase           | **0 - Foundations** (local scaffold in place; GitHub branch protection and TURN reachability verification remain) |
| Media transport | Mesh P2P (v1) behind a `MediaTransport` interface, SFU (LiveKit) in v1.0                                          |
| Stability       | Foundation scaffold; calling features have not shipped yet.                                                       |

---

## Features

**Foundation scaffold**

- pnpm/Turborepo workspace for the web app, signaling service, and shared packages
- Typed signaling protocol schemas and a media transport interface with a fake implementation
- Local Redis, coturn, and Supabase project configuration
- CI, lint/typecheck/test/build scripts, and shared UI tokens

**Planned**

- One-click rooms, pre-join lobby, and 1:1/small-group WebRTC calls (Phase 1)
- SFU-backed large meetings (50 to 500 participants) with simulcast
- Cloud recording, live captions, transcripts, AI summaries
- Breakout rooms, polls, Q&A, whiteboard
- Webinar mode, live streaming out (RTMP/HLS)
- Low-bandwidth and audio-only modes tuned for unreliable networks
- End-to-end encryption
- Embeddable SDK and public API
- Desktop (Tauri) and mobile (PWA, then native) clients

Full roadmap: [TODO.md](./TODO.md). Product thinking: [PRODUCT.md](./PRODUCT.md). System design: [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Tech stack

| Layer           | Choice                                                           |
| --------------- | ---------------------------------------------------------------- |
| Web app         | React 18, Vite, TypeScript, Zustand, Tailwind CSS                |
| Signaling       | Node.js, Fastify, `@fastify/websocket`, Zod                      |
| Media (v1)      | Browser WebRTC (mesh), coturn for TURN                           |
| Media (v1.0+)   | LiveKit (SFU), LiveKit Egress for recording                      |
| Auth and data   | Supabase (Postgres, Auth, RLS, Storage)                          |
| Cache / fan-out | Redis (pub/sub, presence, rate limits)                           |
| Tooling         | pnpm workspaces, Turborepo, ESLint, Prettier, Vitest, Playwright |
| Deploy          | Vercel (web), Fly.io or Railway (signaling, coturn)              |

---

## Repository layout

```
meetit/
├─ apps/
│  ├─ web/                 # React + Vite client
│  └─ signaling/           # Fastify WebSocket signaling server
├─ packages/
│  ├─ protocol/            # Zod schemas + TS types for signaling messages
│  ├─ media/               # MediaTransport interface + Mesh/LiveKit implementations
│  ├─ ui/                  # Shared React components and design tokens
│  └─ config/              # Shared tsconfig, eslint, tailwind presets
├─ infra/
│  ├─ docker-compose.yml   # Local redis + coturn
│  ├─ coturn/turnserver.conf
│  └─ fly/                 # Fly.io configs
├─ supabase/
│  ├─ migrations/
│  └─ seed.sql
├─ e2e/                    # Playwright multi-peer tests
├─ docs/
│  └─ adr/                 # Architecture decision records
├─ .devcontainer/          # Node + Docker development environment
├─ README.md
├─ ARCHITECTURE.md
├─ PRODUCT.md
└─ TODO.md
```

---

## Getting started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local Redis and coturn)
- A Supabase project (or the Supabase CLI for local dev)

### Setup

```bash
git clone https://github.com/Jamesuchechi/MeetIT.git
cd MeetIT
pnpm install

cp apps/web/.env.example apps/web/.env
cp apps/signaling/.env.example apps/signaling/.env

# local Redis + coturn
docker compose --env-file apps/signaling/.env -f infra/docker-compose.yml up -d

# database
supabase start
supabase db reset

# run everything
pnpm dev
```

Web runs at `http://localhost:5173`, signaling at `ws://localhost:8787`.

### Smoke testing the foundation

Calling is not implemented yet; it is Phase 1 work. For a Phase 0 smoke test,
open `http://localhost:5173`, then check
`http://localhost:8787/healthz` and `http://localhost:8787/readyz`.

---

## Environment variables

### `apps/web/.env`

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SIGNALING_URL=ws://localhost:8787
VITE_STUN_URLS=stun:stun.l.google.com:19302
VITE_LIVEKIT_URL=            # v1.0+
```

### `apps/signaling/.env`

```bash
PORT=8787
HOST=0.0.0.0
SUPABASE_URL=
SUPABASE_JWT_SECRET=
REDIS_URL=redis://localhost:6379
TURN_URLS=turn:localhost:3478
TURN_SHARED_SECRET=replace-with-a-long-random-secret
TURN_CREDENTIAL_TTL_SECONDS=3600
TURN_EXTERNAL_IP=
GUEST_TOKEN_SECRET=replace-with-a-long-random-secret
ALLOWED_ORIGINS=http://localhost:5173
LIVEKIT_API_KEY=             # v1.0+
LIVEKIT_API_SECRET=          # v1.0+
```

---

## Scripts

| Command                              | What it does                                       |
| ------------------------------------ | -------------------------------------------------- |
| `pnpm dev`                           | Run web and signaling in watch mode                |
| `pnpm build`                         | Build all packages and apps                        |
| `pnpm lint`                          | ESLint across the workspace                        |
| `pnpm typecheck`                     | `tsc --noEmit` across the workspace                |
| `pnpm test`                          | Unit tests (Vitest)                                |
| `pnpm db:reset`                      | Reset local Supabase and apply migrations and seed |
| `pnpm --filter @meetit/ui storybook` | Run the shared UI Storybook                        |

---

## Contributing

1. Create a branch from `main` (`feat/...`, `fix/...`).
2. Keep changes small and covered by tests. Protocol changes must update `packages/protocol` first.
3. Use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
4. Significant design decisions get an ADR in `docs/adr/`.
5. Open a PR. CI must pass: lint, typecheck, unit tests, e2e.

---

## Security

Please report vulnerabilities privately rather than opening a public issue. See the security section of [ARCHITECTURE.md](./ARCHITECTURE.md) for the threat model.

---

## License

This project is licensed under AGPL-3.0-only. Commercial licensing may be
available under a separate agreement. See [ADR-0001](./docs/adr/0001-license.md).
