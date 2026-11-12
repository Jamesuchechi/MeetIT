/**
 * Compliance Center, SOC 2 Readiness, and Data Residency Manager for MeetIT.
 */

import type {
  DataResidencyRegion,
  Soc2Control,
  SubprocessorInfo,
} from '@meetit/protocol';
import { logAuditEvent } from './auditService.js';

const DATA_RESIDENCY_KEY = 'meetit_data_residency_region';

export const SUBPROCESSORS_REGISTRY: SubprocessorInfo[] = [
  {
    name: 'Supabase Inc.',
    purpose:
      'PostgreSQL database, user authentication, and secure session management',
    dataLocation: 'Frankfurt (EU) / AWS us-east-1',
    privacyUrl: 'https://supabase.com/privacy',
    dpaSigned: true,
  },
  {
    name: 'LiveKit Inc.',
    purpose:
      'Selective Forwarding Unit (SFU) audio/video media routing and WebRTC TURN relays',
    dataLocation: 'Global Edge Network (Frankfurt, Johannesburg, N. Virginia)',
    privacyUrl: 'https://livekit.io/privacy',
    dpaSigned: true,
  },
  {
    name: 'Cloudflare Inc.',
    purpose:
      'DDoS mitigation, CDN asset caching, and global edge SSL termination',
    dataLocation: 'Global Anycast Edge (300+ cities)',
    privacyUrl: 'https://www.cloudflare.com/privacypolicy/',
    dpaSigned: true,
  },
  {
    name: 'Vercel Inc.',
    purpose: 'Frontend application hosting and serverless edge functions',
    dataLocation: 'Global Edge CDN',
    privacyUrl: 'https://vercel.com/legal/privacy-policy',
    dpaSigned: true,
  },
  {
    name: 'Resend Inc.',
    purpose:
      'Transactional meeting email invites, security notifications, and 2FA alerts',
    dataLocation: 'US East (N. Virginia)',
    privacyUrl: 'https://resend.com/legal/privacy-policy',
    dpaSigned: true,
  },
];

export const SOC2_CONTROLS_CHECKLIST: Soc2Control[] = [
  {
    id: 'CC6.1',
    category: 'security',
    title: 'Logical Access Controls',
    description:
      'Multi-factor authentication (MFA/TOTP), WebAuthn passkeys, and role-based permissions enforced.',
    status: 'implemented',
    evidence:
      'Supabase Auth RLS & WebAuthn / TOTP engine in apps/web/src/lib/twoFactorService.ts',
  },
  {
    id: 'CC6.3',
    category: 'security',
    title: 'Principle of Least Privilege',
    description:
      'Fine-grained API key scopes (ROOMS:READ, ROOMS:WRITE, RECORDINGS:READ) and host moderation tiers.',
    status: 'implemented',
    evidence:
      '0001_init.sql & packages/protocol/src/index.ts apiKeyScopeSchema',
  },
  {
    id: 'CC6.6',
    category: 'security',
    title: 'Encryption in Transit & at Rest',
    description:
      'TLS 1.3 for web/signaling, DTLS-SRTP for WebRTC streams, AES-GCM Encoded Transform for E2EE.',
    status: 'implemented',
    evidence:
      'packages/media/src/e2eeTransform.ts & HTTPS enforced via Vercel HSTS',
  },
  {
    id: 'CC7.2',
    category: 'availability',
    title: 'Real-time System Monitoring & Failover',
    description:
      'Dynamic WebRTC ICE restart grace periods, TURN fallback, and backend health diagnostics probes.',
    status: 'implemented',
    evidence: 'apps/web/src/lib/DiagnosticsProbe.ts & backendHealth.ts',
  },
  {
    id: 'CC7.4',
    category: 'availability',
    title: 'Data Backup & Redundancy',
    description:
      'Point-in-time PostgreSQL recovery and distributed cloud storage for recorded sessions.',
    status: 'implemented',
    evidence:
      'Supabase managed automated backups & S3/R2 multi-region replication',
  },
  {
    id: 'PI1.2',
    category: 'processing_integrity',
    title: 'Input Validation & Rate Limiting',
    description:
      'Strict Zod schema validation across all WebRTC signaling messages and REST API endpoints.',
    status: 'implemented',
    evidence:
      'packages/protocol/src/index.ts clientMessageSchema & apiRouter.ts',
  },
  {
    id: 'C1.1',
    category: 'confidentiality',
    title: 'Data Classification & Access Boundaries',
    description:
      'Row-Level Security (RLS) ensuring strict isolation of meeting recordings, notes, and transcripts.',
    status: 'implemented',
    evidence:
      'supabase/migrations/0005_recordings.sql & 0004_meeting_notes.sql',
  },
  {
    id: 'P1.1',
    category: 'privacy',
    title: 'GDPR / NDPR / CCPA Data Subject Rights',
    description:
      'Self-serve machine-readable data export (Art. 20) and permanent account erasure (Art. 17).',
    status: 'implemented',
    evidence: 'apps/web/src/lib/dataExportService.ts & accountPurgeService.ts',
  },
  {
    id: 'P3.1',
    category: 'privacy',
    title: 'IP Address Anonymization & Relay-Only Mode',
    description:
      'Participant IP addresses can be hidden via mandatory TURN relay routing (iceTransportPolicy: relay).',
    status: 'implemented',
    evidence: 'packages/media/src/index.ts iceTransportPolicy',
  },
];

export function getDataResidencyRegion(): DataResidencyRegion {
  try {
    const saved = localStorage.getItem(DATA_RESIDENCY_KEY);
    if (
      saved === 'eu-central-1' ||
      saved === 'af-south-1' ||
      saved === 'us-east-1'
    ) {
      return saved;
    }
  } catch {
    // ignore
  }
  return 'eu-central-1';
}

export function setDataResidencyRegion(
  region: DataResidencyRegion,
  userId?: string,
): void {
  localStorage.setItem(DATA_RESIDENCY_KEY, region);

  void logAuditEvent({
    userId,
    action: 'settings.update',
    targetType: 'compliance',
    targetId: 'data_residency',
    metadata: { newRegion: region },
  });
}

export function generateStandardDpaText(
  companyName = 'Customer Organization',
): string {
  return `DATA PROCESSING AGREEMENT (DPA)
Between: MeetIT Technologies Inc. ("Data Processor")
And: ${companyName} ("Data Controller")

1. Scope and Applicability:
This DPA governs the processing of personal data in connection with the MeetIT video conferencing platform in compliance with Regulation (EU) 2016/679 (GDPR), the Nigeria Data Protection Act (NDPA/NDPR), and the California Consumer Privacy Act (CCPA).

2. Nature and Purpose of Processing:
Real-time peer-to-peer and relayed audio/video communication, ephemeral chat messaging, collaborative notes, and optional user-initiated meeting recordings and transcripts.

3. Technical and Organizational Measures (TOMs):
- End-to-End Encryption (E2EE) using WebRTC Encoded Transform (AES-GCM).
- Relay-only connection privacy mode preventing peer IP address exposure.
- Strict Row-Level Security (RLS) on all persistent databases.
- Multi-factor authentication (TOTP) and WebAuthn hardware passkeys.
- Zero-retention policy for unrecorded media streams.

4. Subprocessors:
The Data Processor maintains an active registry of authorized subprocessors (Supabase, LiveKit, Cloudflare, Resend) bound by equivalent confidentiality obligations.

5. Data Subject Rights:
Automated tools are provided directly within the user account dashboard to facilitate immediate data export (Art. 20) and irreversible cascading erasure (Art. 17).

Effective as of: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
}
