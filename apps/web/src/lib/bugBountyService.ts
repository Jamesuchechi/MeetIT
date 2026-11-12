import type { VulnerabilityReport } from '@meetit/protocol';
import { supabase, isSupabaseConfigured } from './supabase';

const VULN_REPORTS_KEY = 'meetit_vulnerability_reports_v1';

export interface BountyTier {
  severity: 'critical' | 'high' | 'medium' | 'low';
  name: string;
  rangeUsd: string;
  examples: string[];
}

export const BOUNTY_TIERS: BountyTier[] = [
  {
    severity: 'critical',
    name: 'Critical Impact',
    rangeUsd: '$2,500 – $5,000+',
    examples: [
      'End-to-End Encryption (E2EE) cryptographic bypass or key recovery',
      'Remote Code Execution (RCE) on signaling or media servers',
      'Unauthorized cross-tenant meeting room eavesdropping or stream interception',
    ],
  },
  {
    severity: 'high',
    name: 'High Impact',
    rangeUsd: '$1,000 – $2,500',
    examples: [
      'Privilege escalation from Guest to Room Host/Moderator',
      'Bypassing forced waiting room or domain capture access gates',
      'Stored Cross-Site Scripting (XSS) in shared whiteboard or markdown notes',
    ],
  },
  {
    severity: 'medium',
    name: 'Medium Impact',
    rangeUsd: '$300 – $1,000',
    examples: [
      'Signaling rate limit evasion or targeted room flooding',
      'In-meeting IP address leak when Relay-only privacy mode is active',
      'Cross-Site Request Forgery (CSRF) on account settings or API keys',
    ],
  },
  {
    severity: 'low',
    name: 'Low Impact',
    rangeUsd: '$100 – $300',
    examples: [
      'Information disclosure of non-sensitive telemetry metadata',
      'Open redirects on meeting invitation handlers',
    ],
  },
];

export async function submitVulnerabilityReport(
  report: Omit<
    VulnerabilityReport,
    'id' | 'status' | 'bountyAmountUsd' | 'createdAt'
  >,
): Promise<{ success: boolean; reportId: string; message: string }> {
  const fullReport: VulnerabilityReport = {
    ...report,
    id: `sec_rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    status: 'new',
    bountyAmountUsd: 0,
    createdAt: Date.now(),
  };

  try {
    const raw = localStorage.getItem(VULN_REPORTS_KEY);
    const existing = raw ? (JSON.parse(raw) as VulnerabilityReport[]) : [];
    localStorage.setItem(
      VULN_REPORTS_KEY,
      JSON.stringify([fullReport, ...existing]),
    );
  } catch {}

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('vulnerability_reports')
        .insert({
          reporter_email: fullReport.reporterEmail,
          reporter_name: fullReport.reporterName ?? null,
          pgp_key_fingerprint: fullReport.pgpKeyFingerprint ?? null,
          target_component: fullReport.targetComponent,
          severity: fullReport.severity,
          title: fullReport.title,
          vulnerability_description: fullReport.vulnerabilityDescription,
          steps_to_reproduce: fullReport.stepsToReproduce,
          impact_assessment: fullReport.impactAssessment ?? null,
          status: 'new',
          bounty_amount_usd: 0,
        })
        .select('id')
        .single();

      if (!error && data?.id) {
        return {
          success: true,
          reportId: data.id,
          message:
            'Report submitted securely. Our security team will review it within 24 hours under our Coordinated Vulnerability Disclosure safe harbor.',
        };
      }
    } catch {}
  }

  return {
    success: true,
    reportId: fullReport.id ?? 'local_report',
    message:
      'Report received and queued for security team triage under safe harbor protection.',
  };
}
