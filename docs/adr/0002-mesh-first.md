# ADR-0002: Start with mesh transport

- Status: Accepted
- Date: 2026-11-03
- Decision owners: MeetIT maintainers

## Context

MeetIT needs an early working call product without taking on SFU operating
complexity before its user experience and signaling model are validated.

## Decision

Start with browser WebRTC mesh for one-to-one and small calls. Keep the media
implementation behind the `MediaTransport` interface so an SFU can be added
without coupling the UI to a specific transport. Use LiveKit as the planned SFU
candidate; record its deployment choice separately in ADR-0003.

## Consequences

- Mesh keeps the initial infrastructure small but limits room size and increases
  client uplink usage as participants are added.
- The product must enforce small-room limits before mesh capacity is exceeded.
- Transport abstractions must remain capability-aware rather than assuming that
  every feature behaves identically on mesh and an SFU.
