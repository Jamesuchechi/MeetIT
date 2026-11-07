# MeetIT TODO

Legend: `[ ]` todo, `[x]` done, `[~]` in progress. Tags: **[P0]** must ship, **[P1]** should ship, **[P2]** nice, **[R]** research/spike.

Every phase has an **exit criteria** block. Do not start the next phase until exit criteria pass.

---

## Phase 0 - Foundations (week 1)

### Repo and tooling

- [~] [P0] Create GitHub repo `Jamesuchechi/MeetIT`, protect `main`, require PR + CI (repo exists; `main` is not protected yet)
- [x] [P0] pnpm workspace + Turborepo (`apps/*`, `packages/*`)
- [x] [P0] Shared `tsconfig` (strict, `noUncheckedIndexedAccess`), ESLint, Prettier, `.editorconfig`
- [x] [P0] Husky + lint-staged + commitlint (Conventional Commits)
- [x] [P0] GitHub Actions: install, lint, typecheck, unit, build (cache pnpm + turbo)
- [x] [P1] Renovate or Dependabot, `pnpm audit` job
- [x] [P1] `docs/adr/` with template and ADR-0001 (license), ADR-0002 (mesh first)
- [x] [P2] Devcontainer with Node, pnpm, Docker-in-Docker

### Packages scaffolding

- [x] [P0] `packages/protocol`: envelope, join/leave/signal/state/chat schemas (Zod), exported types
- [x] [P0] `packages/media`: `MediaTransport` interface, `FakeTransport`
- [x] [P0] `packages/ui`: design tokens (color, spacing, radius, motion), Tailwind preset
- [x] [P1] Storybook for `packages/ui`

### Infra (local)

- [x] [P0] `infra/docker-compose.yml` with Redis and coturn
- [x] [P0] coturn config with `use-auth-secret`, denied private ranges, quotas
- [x] [P0] Supabase local project, migration `0001_init.sql`, seed script
- [x] [P0] `.env.example` files for web and signaling

**Exit criteria:** `pnpm dev` boots web + signaling; CI is green on an empty-but-typed monorepo; `docker compose up` gives a reachable TURN server (verified with `turnutils_uclient` or Trickle ICE page). `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and the UI Storybook build pass locally. Redis is healthy; coturn accepts a short-lived credential and local allocation, but a successful external relay peer has not been verified. GitHub `main` is currently unprotected, and the local changes have not been pushed, so Phase 0 exit criteria are not fully complete.

---

## Phase 1 - Core 1:1 call (v0.1, weeks 2 to 3)

### Signaling server

- [x] [P0] Fastify app, `/healthz`, `/readyz`
- [x] [P0] WebSocket endpoint with 5 s auth timeout, Origin check
- [x] [P0] Zod validation on every inbound frame, drop + count invalid
- [x] [P0] In-memory `Room` and `Peer` classes; join, leave, relay offer/answer/ice
- [x] [P0] Slot reclaim: same `selfId` rejoin within 30 s
- [x] [P0] Keepalive ping/pong, dead-socket reaping
- [x] [P0] Per-connection token-bucket rate limiter, max frame size
- [x] [P0] TURN credential generator (HMAC, TTL)
- [x] [P0] `POST /rooms` (create room, returns code), `GET /rooms/:code` (exists/locked)
- [x] [P0] Room code generator (`xxx-xxxx-xxx`), collision retry
- [x] [P1] Structured logging (pino), request IDs, no SDP in logs
- [x] [P1] Integration tests: two fake clients exchange signaling

### Mesh transport

- [x] [P0] `MeshTransport` with perfect negotiation (polite/impolite)
- [x] [P0] ICE candidate queueing before remote description
- [x] [P0] Track add/remove, `replaceTrack` for device switches
- [x] [P0] Connection state mapping + events
- [x] [P0] ICE restart on `disconnected` after 3 s grace
- [x] [P0] Full renegotiation fallback after 15 s
- [x] [P1] Opus tuning (DTX, FEC), bitrate caps per participant count
- [x] [P1] `getStats()` normalizer into `TransportStats`

### Web app

- [x] [P0] Routing: `/`, `/m/:code` (lobby then call), `/ended`, `/404`
- [x] [P0] Landing: "New meeting" and "Join with code"
- [x] [P0] Device manager: enumerate, select, persist choice, handle `devicechange`
- [x] [P0] Lobby: camera preview, mic level meter, display name, join button
- [x] [P0] Permission denied / no device flows with clear recovery steps
- [x] [P0] Call screen: local + remote tile, mute, camera, leave
- [x] [P0] Responsive layout (desktop and mobile portrait)
- [x] [P1] Connection status toasts (reconnecting, restored, failed)
- [x] [P1] Copy invite link button

### Quality

- [~] [P0] Playwright e2e: two contexts join, verify remote video `videoWidth > 0` and inbound bytes increase
- [x] [P1] Unit tests: protocol schemas, backoff, credential generator

**Exit criteria:** two people on different networks (one behind a mobile hotspot) hold a stable 15-minute call; kill Wi-Fi for 5 s and the call recovers; e2e passes in CI.

---

## Phase 2 - Multi-party mesh (v0.2, weeks 4 to 5)

- [x] [P0] Full-mesh up to 4 participants, hard cap and clear "room full" UX
- [x] [P0] Dynamic grid layout (`computeLayout`, unit tested for 1 to 4)
- [x] [P0] Remote participant state sync (audio/video/hand) via `state.update`
- [x] [P0] Screen sharing (`getDisplayMedia`), separate track, pin-on-share layout
- [x] [P0] Stop-sharing from browser UI detected and synced
- [x] [P0] In-call chat panel (text only), unread badge, server-ordered IDs
- [x] [P1] Active speaker detection (AnalyserNode, hysteresis) and highlight ring
- [x] [P1] Raise hand + reactions (rate limited, ephemeral)
- [x] [P1] Per-participant bitrate adaptation by peer count
- [x] [P1] Pin / spotlight a participant locally
- [x] [P1] Keyboard shortcuts + help overlay
- [x] [P1] Join/leave sounds (toggle), `aria-live` announcements
- [x] [P2] Picture-in-Picture for remote video
- [x] [P2] Mirror self-view toggle

**Exit criteria:** 4-person call for 30 minutes with screen share, no tile freezes; CPU on a mid laptop stays under 60%; chat ordering identical for all peers.

---

## Phase 3 - Accounts, persistence, meeting management (v0.3, weeks 6 to 7)

### Identity

- [x] [P0] Supabase Auth: email magic link + Google
- [x] [P0] Profile page (name, avatar upload)
- [x] [P0] Guest flow: signed guest token, display name required
- [x] [P0] JWT verification in signaling (JWKS or shared secret)
- [x] [P1] Verified badge vs guest label on tiles

### Rooms and meetings

- [x] [P0] Persist rooms, meetings, participants (service role writes only)
- [x] [P0] Personal room (permanent code) per user
- [x] [P0] Meeting history page (date, duration, attendees)
- [x] [P1] Scheduled meetings with calendar `.ics` download
- [x] [P1] Recurring meetings (RRULE)
- [x] [P1] Room title and description, shown in lobby
- [x] [P2] Room passcode option

### Meeting Notes & Action Items Hub

- [x] [P0] Dedicated Notes view in web dashboard (search, filter by meeting, view summaries)
- [x] [P1] Action items manager: track open/completed tasks from past meetings with checkbox sync
- [x] [P1] Markdown export and quick-copy for notes & meeting summaries
- [x] [P1] Mobile bottom navigation and sidebar link for instant 1-tap Notes access

### Host controls

- [x] [P0] Roles: host, cohost, attendee, guest (server authoritative)
- [x] [P0] Mute participant, mute all, remove participant
- [x] [P0] Lock / unlock room
- [x] [P0] Waiting room with admit / deny / admit all
- [x] [P0] Host transfer on host leave; end meeting for all
- [x] [P1] Disable guest chat / screen share / reactions per room
- [x] [P1] Remove-and-block (per-room blocklist by user ID or token fingerprint)
- [x] [P1] Ask-to-unmute request from host

### Resilience and UX

- [x] [P0] Signaling reconnect with backoff + jitter, state resync, chat backfill
- [x] [P0] Network quality indicator per tile (bars from `getStats()`)
- [x] [P1] Data saver and audio-only modes
- [x] [P1] Pre-call network and device test (loopback + bandwidth probe)
- [x] [P1] Safari and iOS workarounds pass; real-device test matrix
- [x] [P1] PWA: installable, offline shell, share target

### Ops

- [x] [P0] Deploy: web on Vercel, signaling + coturn + Redis on Fly/VPS
- [x] [P0] Sentry, uptime checks, basic dashboards
- [x] [P1] Staging environment + preview deployments per PR

**Exit criteria:** Public alpha. Strangers can sign in, schedule, host with waiting room, and recover from network drops. Join success rate above 97% in telemetry. _(Achieved)_

---

## Phase 4 - SFU migration (v1.0 beta, weeks 8 to 11)

- [x] [R] Spike: LiveKit Cloud vs self-hosted; cost model at 1k, 10k, 100k participant-minutes/day
- [x] [P0] ADR-0003 decision recorded
- [x] [P0] `LiveKitTransport` implementing `MediaTransport`, mapped events
- [x] [P0] Signaling issues LiveKit access tokens per join, role-scoped grants
- [x] [P0] Room-level `transport` field: `mesh` for 2 to 4, `sfu` above; configurable override
- [x] [P0] Simulcast publish (3 layers), adaptive stream + dynacast
- [x] [P0] Subscription quality by tile size and visibility
- [x] [P0] Server-side active speaker events
- [x] [P1] Seamless mesh to SFU promotion mid-call (research complexity first)
- [x] [P1] Grid virtualization, gallery pagination, speaker view
- [x] [P1] Screen share with audio, high-res mode for slides and code
- [x] [P1] Region selection and latency-based routing
- [ ] [P1] Load test: 100 participants (30 publishers) per room with LiveKit loadtester
- [ ] [P2] Self-host LiveKit on dedicated nodes, Terraform module

**Exit criteria:** 50-person meeting with stable audio, p75 time-to-first-frame under 5 s, node CPU under 70% at target load.

---

## Phase 5 - Recording, captions, transcripts (v1.1)

### Recording

- [ ] [P0] Start/stop recording (host only), persistent indicator, join-time consent notice
- [ ] [P0] LiveKit Egress composite layout to object storage
- [ ] [P0] Recording library page: list, play, download, delete
- [ ] [P1] Speaker-view vs grid-view recording layouts
- [ ] [P1] Audio-only recording option
- [ ] [P1] Per-workspace retention policies + scheduled hard delete
- [ ] [P2] Separate per-participant (ISO) tracks for editors

### Captions and transcripts

- [ ] [P0] Live captions via streaming STT (Deepgram or Whisper streaming), caption overlay
- [ ] [P0] Caption language selector, font size, position
- [ ] [P1] Post-meeting transcript with speaker labels and timestamps
- [ ] [P1] Searchable transcripts across meetings
- [ ] [P1] Transcript export: TXT, SRT, VTT, DOCX
- [ ] [P2] Custom vocabulary (names, jargon)

### AI meeting notes & intelligence

- [ ] [P0] Automated post-meeting notes generation (executive summary, key decisions, action items with owners)
- [ ] [P1] Summary, decisions, action items with owners (LLM over transcript)
- [ ] [P1] Chapters and highlights with timestamp links
- [ ] [P1] Searchable notes memory across all meetings in dashboard
- [ ] [P1] Email summary and action items digest to attendees after meeting
- [ ] [P2] "Ask the meeting": Q&A over transcript with citations to timestamps
- [ ] [P2] Auto-create tasks in integrations (Linear, Notion, Asana, Google Docs - see Phase 9)

**Exit criteria:** Recording available within 5 minutes of meeting end; caption word error rate under 12% on a mixed-accent test set; summary accuracy rated 4/5 or better by internal reviewers.

---

## Phase 6 - Collaboration features (v1.2)

- [ ] [P0] Breakout rooms: host creates N rooms, manual and auto assignment, timer, broadcast message to all, recall
- [ ] [P0] Polls and quizzes in-call, results live, export
- [ ] [P1] **FormIT integration:** launch a FormIT form as a poll or post-meeting survey, embed responses in the meeting summary
- [ ] [P0] Q&A panel with upvotes, answered state
- [ ] [P1] Shared whiteboard (tldraw or custom canvas over data channel/Yjs), save as PNG/PDF
- [ ] [P1] Shared notes (collaborative doc via Yjs), attached to meeting record
- [ ] [P1] Hand-raise queue with ordering
- [ ] [P1] Emoji reactions with animation, custom reaction packs
- [ ] [P1] File sharing in chat (Supabase Storage, virus scan, size limits)
- [ ] [P1] Threaded chat, mentions, message reactions
- [ ] [P2] Co-browsing / shared remote cursor for presentations
- [ ] [P2] Presenter notes and slide control (Google Slides / PowerPoint link)
- [ ] [P2] Timer, stopwatch, and agenda tracker for hosts

**Exit criteria:** 100-person class with 10 breakout rooms runs end-to-end; poll results match the server tally exactly.

---

## Phase 7 - Webinar and broadcast (v1.3)

- [ ] [P0] Webinar mode: panelists (publish) vs viewers (subscribe only), viewers capped at 1,000+
- [ ] [P0] Registration page with custom fields, approval flow, unique join links
- [ ] [P0] Practice session (panelists only) before going live
- [ ] [P1] Live stream out: RTMP to YouTube/Facebook/custom, HLS for large audiences
- [ ] [P1] Audience Q&A moderation queue
- [ ] [P1] Attendee analytics: join time, duration, engagement, poll responses
- [ ] [P1] Branded waiting screen, custom logo, colors, background
- [ ] [P2] Paid webinars (Stripe, Paystack, Flutterwave)
- [ ] [P2] On-demand replay with gated access
- [ ] [P2] Simulive (pre-recorded played as live)

**Exit criteria:** 1,000 viewers on HLS with under 10 s latency; registration to join conversion funnel visible.

---

## Phase 8 - Media intelligence and effects (v1.4)

- [ ] [P0] Background blur and virtual backgrounds (MediaPipe selfie segmentation, WebGL, Worker)
- [ ] [P0] AI noise suppression (RNNoise via WASM `AudioWorklet`)
- [ ] [P1] Auto-framing / face tracking crop
- [ ] [P1] Low-light enhancement, touch-up filters
- [ ] [P1] Echo and feedback detection with auto-mute suggestion
- [ ] [P1] Gesture reactions (thumbs up, raised hand detection)
- [ ] [P1] **Live translation:** translated captions in 30+ languages
- [ ] [P2] **Live voice translation / dubbing** with cloned or neutral voice per listener language
- [ ] [P2] Sign-language mode: pin interpreter, prioritize their video bitrate
- [ ] [P2] Eye-contact correction
- [ ] [P2] Spatial audio: position participants in stereo field by tile layout
- [ ] [P2] Adaptive "voice-first" mode: ultra-low-bandwidth speech codec fallback

**Exit criteria:** Background blur holds 30 fps on a 2019 mid-range laptop and a mid-range Android phone; translated captions latency under 3 s.

---

## Phase 9 - Integrations and platform (v1.5)

### Calendar and productivity

- [ ] [P0] Google Calendar and Outlook: create meeting with MeetIT link, two-way sync
- [ ] [P1] Gmail / Outlook add-ins: "Add MeetIT meeting" button
- [ ] [P1] Slack and Microsoft Teams: `/meetit` slash command, instant room link, post summaries
- [ ] [P1] Notion, Linear, Jira, GitHub: push action items and notes
- [ ] [P2] CRM (HubSpot, Salesforce): log calls, attach transcripts
- [ ] [P2] Zapier and Make connectors

### Developer platform

- [ ] [P0] Public REST API: rooms, meetings, participants, recordings, transcripts
- [ ] [P0] Webhooks: `meeting.started`, `participant.joined`, `recording.ready`, `transcript.ready` (signed, retried)
- [ ] [P0] **Embeddable SDK** (`@meetit/sdk`): React components + vanilla JS, iframe and headless modes
- [ ] [P1] API keys, scopes, usage dashboard, rate limits
- [ ] [P1] OpenAPI spec + generated clients (TS, Python)
- [ ] [P1] Docs site with live playground and example apps
- [ ] [P2] **Apps marketplace:** in-meeting apps (whiteboards, games, polls) via sandboxed iframes and a postMessage SDK
- [ ] [P2] Bots and agents as participants (join via API, speak and listen), including an AI note-taker bot

**Exit criteria:** Third party embeds a meeting in under 30 minutes using only the docs; webhooks delivered at-least-once with a 99.9% success rate.

---

## Phase 10 - Security, privacy, compliance (v1.6, runs in parallel from Phase 3)

- [ ] [P0] E2EE for small meetings: Encoded Transform + group key exchange, verification codes/emoji
- [ ] [P0] Security review + external penetration test before public launch
- [ ] [P0] Audit logs (host actions, recording start/stop, admin changes)
- [ ] [P0] Data deletion and export (GDPR/NDPR/CCPA style)
- [ ] [P1] Relay-only privacy mode (hide IPs)
- [ ] [P1] Sign-in security: passkeys, 2FA, session management
- [ ] [P1] Abuse reporting, moderation tools, content policy
- [ ] [P1] SOC 2 readiness checklist; data residency options (EU, Africa, US)
- [ ] [P1] DPA, subprocessor list, privacy policy, terms
- [ ] [P2] SSO (SAML, OIDC) and SCIM provisioning
- [ ] [P2] Enterprise controls: domain capture, forced waiting room, retention, DLP hooks
- [ ] [P2] Bug bounty program

**Exit criteria:** Pen test with zero criticals/highs open; E2EE interoperability tested across Chrome, Firefox, Safari.

---

## Phase 11 - Clients everywhere (v2.0)

- [ ] [P0] PWA polish: background audio, wake lock, screen share where supported, push notifications
- [ ] [P1] Desktop app (Tauri): global shortcuts, tray, system audio capture, auto-launch from calendar
- [ ] [P1] Mobile apps (React Native or Flutter with LiveKit SDKs): CallKit/ConnectionService, background mode, PiP
- [ ] [P1] Browser extension: one-click "Start MeetIT" on any page, calendar link detection
- [ ] [P2] Smart-TV and conference-room mode (kiosk web app, QR join, room booking)
- [ ] [P2] Wearables: join audio-only from a watch, mute toggle
- [ ] [P2] Car mode: audio-only, voice commands
- [ ] [P2] Chromecast / AirPlay sharing

**Exit criteria:** Same account, same meeting, seamless handoff between phone and laptop without rejoining (device switching).

---

## Phase 12 - Scale, reliability, cost (continuous)

- [ ] [P0] Multi-region SFU with cascading; client picks nearest by RTT probe
- [ ] [P0] Autoscaling signaling and SFU on CPU + participant count
- [ ] [P0] Chaos testing in staging: kill nodes, drop regions, TURN outage
- [ ] [P0] Runbooks and on-call rotation, incident templates, status page
- [ ] [P1] Cost dashboards per meeting minute; relay ratio optimization
- [ ] [P1] Prefer UDP direct paths, TCP/TLS 443 fallback tuning, QUIC/WebTransport evaluation
- [ ] [P1] Congestion control tuning, FEC and RED for audio, SVC (AV1/VP9) rollout
- [ ] [P1] Edge-hosted lightweight signaling (Cloudflare Durable Objects) evaluation
- [ ] [P2] P2P direct for 1:1 even in SFU rooms to cut cost, automatic fallback
- [ ] [P2] Carbon-aware routing and reporting

**Exit criteria:** 99.95% monthly availability; incident detection under 2 minutes; cost per participant-minute below target set in PRODUCT.md.

---

## Phase 13 - Beyond imagination (research bets)

Each bet starts as an `[R]` spike with a one-page writeup and a kill criterion.

- [ ] [R] **Persistent virtual spaces:** drop-in "rooms" with proximity audio (walk up to people to talk), like a virtual office
- [ ] [R] **3D / spatial meetings:** WebXR on Quest and Vision Pro with spatial audio, volumetric avatars
- [ ] [R] **Photoreal avatars:** send a few kbps of face landmarks/Gaussian-splat parameters instead of video, near-zero bandwidth video presence
- [ ] [R] **Neural audio codec:** ultra-low-bitrate speech (under 3 kbps) for terrible networks
- [ ] [R] **AI proxy attendee:** an agent that attends, answers within your pre-approved context, and reports back
- [ ] [R] **Real-time moderator agent:** detects harassment, off-topic drift, and talk-time imbalance; nudges host
- [ ] [R] **Meeting memory graph:** cross-meeting knowledge base; "what did we decide about X across the last 12 meetings?"
- [ ] [R] **Agenda-aware meetings:** AI keeps time, parks tangents, auto-generates follow-up agenda
- [ ] [R] **Meeting-to-code/doc:** turn a design discussion directly into a PR draft, spec, or ticket tree
- [ ] [R] **Holographic / lightfield telepresence** with commodity cameras
- [ ] [R] **Decentralized mode:** fully peer-to-peer rooms with no central server (libp2p / WebTransport), self-sovereign identity
- [ ] [R] **Offline-first mesh:** local-network calls over Wi-Fi Direct / Bluetooth when internet is down
- [ ] [R] **Emotion and engagement analytics** (opt-in only, privacy-first, on-device) for presenters
- [ ] [R] **Universal translator rooms:** every participant speaks and hears their own language with preserved voice and timing
- [ ] [R] **Accessibility-first modes:** real-time sign-language avatar rendering, haptic cues for hard-of-hearing users, cognitive-load simplification

---

## Phase 14 - Expansion bets (after Phase 4 exit criteria pass)

Do not start any bet until the SFU is stable (Phase 4). Every bet begins as a one-week `[R]` spike with a one-page writeup, a success metric, and a kill criterion. Work tiers in order, keep at most two bets in flight, and remove a shipped bet that misses its metric 90 days after launch.

### Tier A: reinforce reliability (the differentiator)

- [ ] [R] **Slides as data:** upload a PDF or PPTX and present it as a synced document (pages rendered once, page changes sent over the data channel) instead of screen share; viewers can flip back on their own; fall back to screen share if rendering fails
  - Success: 40% of presenter sessions with a deck use it; page-change latency under 300 ms. Kill: under 10% adoption after 90 days.
- [ ] [R] **Catch me up:** late joiners and anyone who dropped for 30 s or more get a short live summary of what they missed, with timestamp links (builds on Phase 5 captions and summaries)
  - Success: 60% of late joiners open it and 70% rate it helpful. Kill: helpfulness under 50% after two prompt and model iterations.
- [ ] [R] **Local double-ender recording:** each participant's browser records its own audio and video locally and uploads it after the call, so the recording stays clean even when the live call degraded (builds on Phase 5 ISO tracks)
  - Success: upload success above 95%; used for 20% of recordings. Kill: upload failures above 15% or support load too high.
- [ ] [R] **Dial-in and call-me-back:** phone number for audio-only participants (SIP trunk into LiveKit) plus a "call me" option when data fails
  - Success: 5% of meetings include a phone participant; cost per dial-in minute stays under what it earns. Kill: under 1% usage or cost per minute above revenue.
- [ ] [R] **Async-first meetings:** record a short video message or a meeting, then let people reply with video comments and reactions pinned to transcript moments
  - Success: 25% of hosts send an async message monthly; reply rate above 50%. Kill: under 5% of hosts try it within 60 days.

### Tier B: revenue and workflow

- [ ] [R] **Booking pages with payments:** Calendly-style page where clients pick a slot and pay to book (Stripe, Paystack, Flutterwave); reuses Phase 3 scheduling and Phase 7 payments
  - Success: 15% of Pro hosts publish a page; paid-booking conversion above 20%. Kill: under 3% adoption.
- [ ] [R] **FormIT intake in the waiting room:** guests complete a FormIT form before the host admits them; answers show next to their name and attach to the meeting record (extends the Phase 6 FormIT integration)
  - Success: 20% of hosts using a waiting room attach a form. Kill: under 5%.
- [ ] [R] **Meeting templates:** presets for standups, 1:1s, retros, and client calls, each with agenda, timers, and a notes scaffold
  - Success: 30% of scheduled meetings use a template. Kill: under 8%.
- [ ] [R] **Action-item tracking across meetings:** the next meeting with the same people opens with the unfinished items from the last one
  - Success: 50% of action items are acknowledged or closed within 7 days. Kill: under 15% of items ever touched.
- [ ] [R] **Meeting analytics:** talk-time balance, meeting load per person, total time spent, and a "should this be a meeting?" nudge when scheduling
  - Success: 30% of hosts view analytics monthly; nudge accepted above 10% of the time. Kill: under 5% view it.

### Tier C: vertical bets (pick at most one, validate with pilots first)

- [ ] [R] **Interviews:** shared code editor with execution, scorecards, question banks, ATS export
- [ ] [R] **Telehealth and tutoring:** consent flows, session notes, payments, whiteboard
- [ ] [R] **Creator studio:** backstage rooms, guest links, multi-destination streaming (builds on Phase 7)
- [ ] [R] **Support:** embeddable click-to-call widget with co-browsing and annotations (builds on Phase 9 SDK)
  - Success for any vertical: 10 paying accounts within 90 days of a pilot. Kill: fewer than 3 after the pilot.

### Tier D: accessibility and language

- [ ] [R] **Human interpreter channels:** separate audio channels per language with a "listen in" selector, alongside the AI translation planned in Phase 8
- [ ] [R] **Local-language captions:** support under-served languages with a fine-tuned or specialist STT model
  - Success: word error rate under 20% on a held-out set per language. Kill: cannot reach 25% after two model attempts.
- [ ] [R] **Live human captioner (CART) and sign-interpreter slots:** invite roles with a dedicated caption input and pinned interpreter video
- [ ] [R] **Whisper mode:** private side audio and text between two participants, for coaching and interpreters

### Tier E: trust and platform

- [ ] [R] **MCP server for meeting memory:** let AI agents query transcripts, decisions, and action items with scoped, revocable permission (extends Phase 9 API and bots)
  - Success: 100 active connected agents or keys. Kill: under 10 after 90 days.
- [ ] [R] **Signed, tamper-evident recordings and transcripts:** hash chain plus signatures with a public verify page, for legal, HR, and arbitration use
  - Success: 3 pilot organizations adopt it; verification works 100% of the time. Kill: no pilot demand.
- [ ] [R] **Verified identity and impersonation protection:** verified-org badges, voice-clone scam warnings, and a "confirm this is really them" check
- [ ] [R] **One-command self-hosting:** Docker Compose and a Helm chart for NGOs and institutions that need their own infrastructure
  - Success: fresh install running in under 15 minutes by someone outside the project. Kill: maintenance burden exceeds one day a month.
- [ ] [R] **Watermarked and view-only shares:** visible and invisible watermarks on shared screens and recordings for leak deterrence

### Deliberately deferred (parking lot, revisit only with evidence)

- Gamification and meeting "wellness scores": novelty without retention.
- Bonding Wi-Fi and cellular connections: browsers cannot do it, so it only works in native apps (revisit after Phase 11).
- Federation between MeetIT instances: high effort, no demand yet.

**Exit criteria:** every shipped bet meets its success metric within 90 days of launch or is removed; no more than two bets in flight at once; core SLOs from PRODUCT.md stay green while bets ship.

---

## Cross-cutting work (every phase)

### Design and UX

- [ ] Design system: tokens, components, dark/light/high-contrast, motion guidelines
- [ ] Usability testing every phase (5 users, recorded)
- [ ] Empty/error/loading states for every screen
- [ ] Onboarding checklist and in-product tips
- [ ] i18n framework (ICU messages), RTL support, translations for top languages

### Accessibility (WCAG 2.2 AA)

- [ ] Keyboard-only audit, screen-reader audit (NVDA, VoiceOver, TalkBack)
- [ ] Contrast, focus rings, reduced motion, captions default option
- [ ] Accessible name and live-region coverage in call UI

### Quality

- [ ] Coverage gates (unit 80% on `protocol` and `media`)
- [ ] Visual regression (Playwright snapshots / Chromatic)
- [ ] Browser/device lab matrix run nightly
- [ ] Synthetic monitoring: scripted call every 5 minutes from 3 regions

### Analytics and growth

- [ ] Privacy-first product analytics (PostHog self-hosted), event taxonomy doc
- [ ] Funnel: landing, create, lobby, join, 2+ participants, 5+ minutes
- [ ] In-call feedback prompt (1-5 stars + reason tags) feeding quality dashboards
- [ ] Referral and invite loops, shareable meeting links with previews (OG images)

### Documentation

- [ ] User help center, keyboard shortcut cheat sheet
- [ ] Admin guide, security whitepaper, status page
- [ ] Public changelog, roadmap page, ADR log

---

## Immediate next actions (this week)

1. [ ] Push repo skeleton and CI (Phase 0) - local files and workflow are in place
2. [x] Write `packages/protocol` schemas first; everything else builds on it
3. [ ] Stand up coturn locally and verify relay candidates
4. [ ] Build signaling join/relay with an integration test before touching UI
5. [ ] Get a raw two-tab call working with ugly UI, then iterate
6. [~] License decision recorded in ADR-0001; defer SFU deployment choice to ADR-0003.
