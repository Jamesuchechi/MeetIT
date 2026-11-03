# MeetIT Product

Why MeetIT exists, who it is for, what it must be great at, and how we know it is working.

---

## 1. Vision

**Video meetings that just work, everywhere, for everyone.**

Most people can name a meeting that failed because of the tool: a link that would not open, a frozen screen, a call that died when someone walked into a lift. MeetIT treats connection reliability, speed, and openness as the product, not as plumbing.

### Mission

Make joining and staying in a meeting effortless on any device and any network, and make the meeting itself produce something useful (notes, decisions, actions).

### One-line pitch

> "Google Meet simplicity, with resilience on bad networks, built-in meeting intelligence, and an open platform you can embed and own."

---

## 2. The problem

| Problem                                                                                               | Who feels it                                                                      |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Incumbents degrade badly on weak or unstable networks, and video is dropped before audio is protected | Anyone on mobile data, shared Wi-Fi, or in regions with inconsistent connectivity |
| Joining requires accounts, installs, or confusing prompts                                             | Guests, clients, parents, patients, students                                      |
| Meetings generate no durable output; notes and action items depend on one person                      | Teams, consultants, founders                                                      |
| Embedding video in a product is expensive and complex                                                 | Product teams, edtech, telehealth, marketplaces                                   |
| Data and recordings sit in a vendor black box                                                         | Privacy-sensitive orgs, NGOs, schools, regulated industries                       |
| Per-seat pricing punishes occasional users                                                            | Freelancers, small teams, community groups                                        |

---

## 3. Target users and personas

### Primary: Small teams and freelancers ("Ada, independent consultant")

- Runs 5 to 15 client calls per week, many with guests who will not install anything.
- Needs: one-click link, reliable audio, auto-notes, a personal room, simple scheduling.
- Success: client joins in under 10 seconds; she gets a summary without typing.

### Primary: Educators and trainers ("Tunde, online instructor")

- Runs cohorts of 20 to 200 learners, some on low bandwidth.
- Needs: breakout rooms, polls, attendance, recordings, data-saver mode.
- Success: class continues even when half the room has a flaky connection.

### Secondary: Product builders ("Mei, startup CTO")

- Wants video inside her app without running infrastructure.
- Needs: SDK, API, webhooks, predictable pricing, good docs.
- Success: first embedded call in an afternoon.

### Secondary: Communities, churches, NGOs ("Pastor Daniel, community leader")

- Weekly gatherings, mixed devices and ages, mostly mobile.
- Needs: very simple UI, big-audience broadcast mode, low data use, recording replay.
- Success: elders join from a basic phone with one tap.

### Tertiary: Regulated sectors (health, legal, finance)

- Needs: E2EE or private hosting, audit logs, data residency, consent flows.

---

## 4. Product principles

1. **Audio is sacred.** If anything has to give, video degrades first. Never lose the voice.
2. **Zero to talking in under 10 seconds.** Every extra click costs us a meeting.
3. **Guests are first-class.** No account, no install, no friction to join.
4. **Honest about the network.** Show quality, explain problems, offer fixes (switch to audio, data saver).
5. **Calm UI.** Controls where hands expect them, no surprises, no modal spam.
6. **Privacy by default.** Collect less, retain less, tell people what is recorded and why.
7. **Open and embeddable.** Anything we build in the app should be reachable through the API.
8. **Useful after the call.** A meeting is not finished until the follow-up is easy.
9. **Accessible from day one.** Keyboard, screen reader, captions, reduced motion are launch requirements.

---

## 5. Positioning and competitive landscape

|                            | Google Meet      | Zoom        | Teams            | Whereby / Daily | Jitsi | **MeetIT**                                             |
| -------------------------- | ---------------- | ----------- | ---------------- | --------------- | ----- | ------------------------------------------------------ |
| Join as guest in one click | Yes              | Mostly      | Mostly           | Yes             | Yes   | **Yes**                                                |
| Resilient on poor networks | Good             | Good        | Mixed            | Mixed           | Mixed | **Core focus** (audio-first, data saver, ICE recovery) |
| Built-in AI notes          | Paid add-on      | Paid add-on | Paid add-on      | Limited         | No    | **Included in free/pro**                               |
| Embeddable SDK             | Limited          | Yes (heavy) | Limited          | Yes             | Yes   | **First-class, simple**                                |
| Open source / self-host    | No               | No          | No               | No              | Yes   | **Open-core** (decision pending)                       |
| Forms/polls ecosystem      | Forms (separate) | Basic       | Forms (separate) | No              | No    | **FormIT native integration**                          |
| Pricing model              | Seat             | Seat        | Seat             | Usage/seat      | Free  | **Generous free + usage-based**                        |

### Where we win

- Reliability under bad conditions, proven with public quality metrics.
- Cost transparency and generous free tier for small groups.
- Developer experience for embedding.
- Tight loop with FormIT (poll, survey, attendance) and meeting intelligence.

### Where we do not compete (for now)

- Full enterprise suite (phone systems, rooms hardware, enterprise chat).
- 10,000-person all-hands events.

---

## 6. Feature strategy

### Tier 1: Table stakes (must match the incumbents)

Join by link, lobby, mute/camera, screen share, chat, grid and speaker view, host controls, waiting room, recording, captions, scheduling, calendar integration, mobile web.

### Tier 2: Differentiators (why people switch)

- **Network resilience suite:** audio-first adaptation, data saver, audio-only, automatic ICE recovery, pre-call network test, live quality coaching ("Your upload is weak, switching to audio-only keeps you in the call").
- **Meeting intelligence:** live captions, transcript, summary, decisions, action items, searchable meeting memory.
- **FormIT-powered engagement:** launch forms as polls/quizzes, collect structured feedback, attach results to the meeting record.
- **Embeddable platform:** SDK, API, webhooks, bots.
- **Privacy tools:** E2EE rooms, relay-only mode, region choice, clear consent.

### Tier 3: Delighters

Spatial audio, virtual spaces, live voice translation, AI proxy attendee, offline mesh mode (see Phase 13 in TODO.md).

---

## 7. Key user journeys

### J1: Instant meeting (host, guest)

1. Host clicks "New meeting", gets a link, copies it. (Under 3 s)
2. Guest opens the link, sees preview, types a name, taps Join. (Under 10 s)
3. Both talk. If the guest's network is weak, the UI offers audio-only without ending the call.
4. Host ends meeting; guest sees a friendly "Thanks" page with optional feedback.

### J2: Scheduled meeting with summary

1. Host schedules from MeetIT or Google Calendar; attendees get an invite with the link.
2. Meeting runs; host starts recording and captions.
3. Within minutes of ending, attendees receive a summary: key points, decisions, action items with owners, link to recording and transcript.
4. Action items push to the team's task tool.

### J3: Class with breakout rooms

1. Instructor opens the room, enables waiting room, shares a registration link.
2. Learners join; instructor starts a poll (via FormIT), then splits into breakout rooms with a timer.
3. Instructor broadcasts "2 minutes left", recalls everyone, exports attendance and poll results.

### J4: Embedded call in another product

1. Developer installs `@meetit/sdk`, creates a room via API, renders `<MeetITRoom token=... />`.
2. Webhooks notify the app when the meeting ends and the recording is ready.

### J5: Unreliable network recovery

1. Participant walks from Wi-Fi to mobile data. Video freezes for 2 seconds.
2. MeetIT restarts ICE, shows "Reconnecting...", restores audio first, then video.
3. Others see a subtle "poor connection" indicator, not a drop.

---

## 8. Success metrics

### North star

**Successful meeting minutes per week**: minutes in meetings with 2+ participants where audio quality was rated good or better and nobody was dropped.

### Reliability and performance (product-quality KPIs)

| Metric                                           | Target                 |
| ------------------------------------------------ | ---------------------- |
| Join success rate                                | 99.5%                  |
| Time to first remote frame (p75)                 | under 5 s              |
| Join start to join complete for guests (p75)     | under 10 s             |
| Calls with at least one reconnect that recovered | 95%                    |
| Audio-good minutes                               | 90%                    |
| Crash/blank-screen rate                          | under 0.1% of sessions |

### Adoption and engagement

| Metric                                 | Target (first 6 months post-launch) |
| -------------------------------------- | ----------------------------------- |
| Weekly active hosts                    | 1,000                               |
| Guests per host per week               | 5+                                  |
| 7-day host retention                   | 40%                                 |
| Meetings using recording or captions   | 30%                                 |
| Share of meetings with 3+ participants | 40%                                 |

### Quality of experience (survey)

- Post-call 1 to 5 rating, goal average 4.4+
- "Would you use MeetIT again?" goal 85% yes

### Business (if monetized)

- Free to paid conversion 3 to 5%
- Gross margin above 70% after infrastructure
- Cost per participant-minute below the target defined by finance (tracked, see TODO Phase 12)

---

## 9. Business model (hypotheses to test)

### Open-core with hosted service

- **Core (open source):** client, signaling, protocol, basic SFU integration.
- **Hosted service:** managed infra, recordings, AI features, integrations.

### Pricing hypotheses

| Plan               | Price                                                                         | Includes                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Free**           | $0                                                                            | Up to 4 on mesh / 25 on SFU, 40 min group limit or unlimited 1:1, captions, basic chat, 5 recordings stored 7 days         |
| **Pro**            | ~$8 to 12 / host / month                                                      | 100 participants, unlimited duration, recording, AI notes, breakout rooms, polls, custom branding, 10 hrs transcription/mo |
| **Team**           | ~$6 to 10 / seat / month                                                      | Shared library, integrations, admin controls, SSO-lite, priority support                                                   |
| **Platform (API)** | Usage: per participant-minute, per recording-minute, per transcription-minute | SDK, webhooks, SLAs, volume discounts                                                                                      |
| **Enterprise**     | Custom                                                                        | SSO/SCIM, data residency, audit logs, DPA, dedicated regions, on-prem option                                               |

### Pricing principles

- Local-currency and mobile-money friendly payment options in emerging markets.
- Occasional hosts pay per use, not per seat, if they prefer.
- Never lock users out of exporting their own recordings and transcripts.

---

## 10. Go-to-market

### Phase A: Build in public (pre-launch)

- Devlog posts on the engineering (WebRTC recovery, perfect negotiation, adaptive bitrate) to attract technical early adopters.
- Open source the protocol and client; invite contributors.
- Waitlist with a "Test your connection" page that doubles as a lead magnet.

### Phase B: Niche wedge

- Online educators, bootcamps, and community groups where low-bandwidth reliability matters.
- Freelancers/consultants who need guest-friendly links and automatic notes.
- Partner with 5 to 10 pilot organizations; collect case studies and quality data.

### Phase C: Developer channel

- SDK launch with quickstarts for React, Next.js, vanilla JS; templates for telehealth, tutoring, interviews.
- Example apps and a hosted playground; listing in relevant marketplaces.

### Phase D: Ecosystem

- Calendar add-ons, Slack/Teams commands, browser extension, FormIT bundle.

### Distribution loops

- Every guest sees "Hosted with MeetIT" and a one-click "Start your own" (free-tier branding).
- Public "reliability report" updated monthly, building trust.
- Meeting summary emails with a soft CTA.

---

## 11. Brand and voice

- **Personality:** calm, competent, quietly confident. Never cute at the expense of clarity.
- **Voice:** short sentences, plain words, active voice. Error messages say what happened and what to do next.
- **Visual:** clean, high-contrast, generous spacing, one strong accent color, motion used to explain state changes (not to decorate).
- **Name usage:** "MeetIT" (capital M, capital IT) mirrors "FormIT" for a family of products.

### Tone examples

- Good: "Your connection is weak. Switch to audio-only to stay in the call?"
- Bad: "Oops! Something went wrong with your WebRTC connection."

---

## 12. Accessibility and inclusion commitments

- WCAG 2.2 AA across web, tested with real assistive tech.
- Captions available to everyone, not paywalled; translated captions on paid plans.
- Keyboard-only operation for all core flows.
- Plain-language UI; support for RTL and the most-used languages of our audience.
- Works on low-end phones and older browsers within the stated support policy.
- Data saver and audio-only modes always free.

---

## 13. Privacy and trust

- **Transparency:** clear indicator when recording or transcribing; consent notice on join.
- **Minimization:** no ad tracking, no selling data, analytics privacy-first and opt-out.
- **Control:** hosts decide retention; users can export and delete.
- **Security posture:** published security overview, responsible disclosure, annual third-party pen test.
- **AI usage:** meeting content is not used to train models without explicit opt-in; vendors under DPA.

---

## 14. Risks and mitigations

| Risk                                                   | Likelihood | Impact | Mitigation                                                                                         |
| ------------------------------------------------------ | ---------- | ------ | -------------------------------------------------------------------------------------------------- |
| Infrastructure cost (TURN relay, SFU) outpaces revenue | High       | High   | Cost dashboards from Phase 3, direct-path optimization, usage caps on free tier, self-host options |
| Giants bundle "good enough" video for free             | High       | Medium | Differentiate on reliability, embeddability, openness, niche focus                                 |
| WebRTC cross-browser/device bugs                       | High       | Medium | Real-device lab, telemetry-driven fixes, conservative codec choices                                |
| Abuse (zoom-bombing, illegal content)                  | Medium     | High   | Waiting room defaults, reporting, blocklists, rate limits, clear policy                            |
| AI summary errors cause harm or distrust               | Medium     | Medium | Show citations to transcript timestamps, edit-before-send, confidence cues                         |
| Regulatory (recording consent, data residency)         | Medium     | High   | Consent UX, regional hosting, legal review before enterprise push                                  |
| Scope creep from the "beyond imagination" list         | High       | Medium | Strict phase gates, kill criteria on research bets, reliability SLO before new features            |
| Solo-builder bandwidth                                 | High       | High   | Ship vertical slices, buy not build (LiveKit, STT), automate CI/CD, avoid premature platform work  |

---

## 15. Non-goals (explicit)

- Not a full UC suite (no PBX, no team chat product).
- Not a social network.
- Not building custom codecs or our own SFU (research bets excluded).
- Not chasing every integration; only those that make the meeting-to-action loop faster.

---

## 16. Release plan and milestones

| Milestone                 | Scope                                                    | Gate                                          |
| ------------------------- | -------------------------------------------------------- | --------------------------------------------- |
| **M0 Private prototype**  | Phase 0 to 1: 1:1 calls                                  | Two-person 15 min stable call across networks |
| **M1 Friends and family** | Phase 2 to 3: multi-party mesh, accounts, host controls  | Join success above 97%                        |
| **M2 Public beta**        | Phase 4: SFU, 50-person meetings                         | Time-to-first-frame p75 under 5 s             |
| **M3 v1.0 launch**        | Phase 5: recording, captions, summaries + pricing page   | Security review passed; pilot orgs onboarded  |
| **M4 Platform**           | Phase 6 to 9: collaboration, webinars, SDK, integrations | First external embed live                     |
| **M5 Trust and scale**    | Phase 10 to 12: E2EE, compliance, multi-region           | 99.95% availability                           |
| **M6 Frontier**           | Phase 13 bets                                            | Per-bet kill criteria                         |

---

## 17. Open product questions

1. Open-source license and what stays proprietary (AGPL open-core vs permissive).
2. Free-tier limits: duration cap vs participant cap vs feature gating.
3. Do we lead with the education wedge, the freelancer wedge, or the developer wedge?
4. How much of the AI layer is built vs bought, and what is the per-minute cost ceiling?
5. Is "built for unreliable networks" the headline, or does that undersell the broader product?
6. Which payment methods are required at launch for our first target markets?
7. Brand relationship with FormIT: separate brands under one umbrella, or a unified suite?
