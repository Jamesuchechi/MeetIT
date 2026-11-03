# ADR-0001: AGPL-3.0 with commercial licensing

- Status: Accepted
- Date: 2026-11-03
- Decision owners: MeetIT maintainers

## Context

MeetIT should remain available for community use while allowing organizations
that cannot comply with AGPL network-use obligations to obtain a separate
commercial license. The previous MIT license did not match that open-core
direction.

## Decision

License the public repository under GNU Affero General Public License version 3
(AGPL-3.0-only). Commercial licensing may be offered separately by the copyright
holder. The repository's `LICENSE` file is authoritative for the open-source
grant.

## Consequences

- Network users who modify and provide the software as a service must follow
  AGPL-3.0 source-disclosure requirements.
- A commercial license can offer alternative terms, but requires a separate
  agreement and is not included in this repository.
- Contributions need clear copyright/licensing provenance before release.
