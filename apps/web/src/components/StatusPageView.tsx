import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Server,
  Globe,
  Radio,
  ShieldCheck,
  Video,
  Database,
  ArrowLeft,
  Clock,
  ExternalLink,
} from 'lucide-react';

export interface ServiceComponentStatus {
  id: string;
  name: string;
  group: 'core' | 'sfu' | 'infra';
  status: 'operational' | 'degraded' | 'outage';
  uptimePct: number;
  latencyMs?: number;
  region?: string;
  description: string;
}

export const SYSTEM_SERVICES: ServiceComponentStatus[] = [
  {
    id: 'signaling-global',
    name: 'Signaling Gateway (WebSocket)',
    group: 'core',
    status: 'operational',
    uptimePct: 99.99,
    latencyMs: 18,
    description:
      'Real-time room negotiation, presence, and chat synchronization',
  },
  {
    id: 'sfu-us-east',
    name: 'Media SFU — US East (Virginia)',
    group: 'sfu',
    status: 'operational',
    uptimePct: 99.97,
    latencyMs: 22,
    region: 'us-east',
    description: 'Cascaded WebRTC video and audio distribution cluster',
  },
  {
    id: 'sfu-us-west',
    name: 'Media SFU — US West (Oregon)',
    group: 'sfu',
    status: 'operational',
    uptimePct: 99.98,
    latencyMs: 38,
    region: 'us-west',
    description: 'Hydro-powered low-carbon regional media cluster',
  },
  {
    id: 'sfu-eu-central',
    name: 'Media SFU — Europe Central (Frankfurt)',
    group: 'sfu',
    status: 'operational',
    uptimePct: 99.99,
    latencyMs: 25,
    region: 'eu-central',
    description: 'European GDPR-compliant media forwarding mesh',
  },
  {
    id: 'sfu-eu-north',
    name: 'Media SFU — Europe North (Stockholm)',
    group: 'sfu',
    status: 'operational',
    uptimePct: 100.0,
    latencyMs: 28,
    region: 'eu-north',
    description: 'Zero-emission Nordic hydro/wind media edge',
  },
  {
    id: 'sfu-ap-southeast',
    name: 'Media SFU — Asia Pacific (Singapore)',
    group: 'sfu',
    status: 'operational',
    uptimePct: 99.95,
    latencyMs: 65,
    region: 'ap-southeast',
    description: 'Southeast Asia and Australasia routing hub',
  },
  {
    id: 'stun-turn-fleet',
    name: 'STUN & CoTURN Global Relay Network',
    group: 'infra',
    status: 'operational',
    uptimePct: 99.98,
    latencyMs: 20,
    description: 'NAT traversal, UDP direct SRFLX, and TLS 443 fallback relays',
  },
  {
    id: 'enterprise-auth',
    name: 'Enterprise SSO, SAML & SCIM Gateway',
    group: 'core',
    status: 'operational',
    uptimePct: 100.0,
    latencyMs: 32,
    description:
      'Identity federation (Okta, Azure AD, Google) and user lifecycle',
  },
  {
    id: 'recordings-storage',
    name: 'Recording Pipeline & Cloud Storage',
    group: 'infra',
    status: 'operational',
    uptimePct: 99.96,
    description: 'Encrypted meeting recording transcoding and storage egress',
  },
];

export interface StatusIncidentItem {
  id: string;
  title: string;
  status: 'resolved' | 'monitoring' | 'investigating';
  severity: 'sev1' | 'sev2' | 'sev3';
  timestamp: string;
  impact: string;
  resolution: string;
}

export const RECENT_INCIDENTS: StatusIncidentItem[] = [
  {
    id: 'inc-2026-11-08',
    title: 'Elevated Latency on Europe Central Media SFU',
    status: 'resolved',
    severity: 'sev2',
    timestamp: 'Nov 8, 2026 — 14:15 UTC',
    impact:
      'Transient 3-minute video stutter for Frankfurt participants during upstream transit reroute.',
    resolution:
      'Automated client RTT probing successfully cascaded traffic to Stockholm (EU North).',
  },
  {
    id: 'inc-2026-10-24',
    title: 'Scheduled CoTURN Ephemeral Port Scaling',
    status: 'resolved',
    severity: 'sev3',
    timestamp: 'Oct 24, 2026 — 02:00 UTC',
    impact: 'None. Maintenance window executed with zero packet drop.',
    resolution:
      'Upgraded CoTURN socket buffer limits and expanded UDP port allocation pool.',
  },
];

export interface StatusPageViewProps {
  onBackToApp?: () => void;
}

export const StatusPageView: React.FC<StatusPageViewProps> = ({
  onBackToApp,
}) => {
  const allOperational = SYSTEM_SERVICES.every(
    (s) => s.status === 'operational',
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Banner Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBackToApp && (
              <button
                onClick={onBackToApp}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center gap-1.5 text-xs font-medium"
                aria-label="Back to MeetIT"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to App</span>
              </button>
            )}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white text-sm">
                M
              </div>
              <span className="font-semibold text-white tracking-tight">
                MeetIT Operations
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">30-day Availability:</span>
            <span className="text-xs font-semibold text-emerald-400 font-mono">
              99.98%
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-5xl mx-auto px-4 py-8 flex-1 w-full space-y-8">
        {/* System Health Status Hero Banner */}
        <div
          className={`rounded-2xl p-6 border flex items-center justify-between ${
            allOperational
              ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
              : 'bg-amber-950/20 border-amber-500/30 text-amber-300'
          }`}
        >
          <div className="flex items-center gap-4">
            <div
              className={`p-3 rounded-xl ${
                allOperational
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              {allOperational ? (
                <CheckCircle2 className="w-7 h-7" />
              ) : (
                <AlertTriangle className="w-7 h-7" />
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">
                {allOperational
                  ? 'All Systems Operational'
                  : 'Active System Notice'}
              </h1>
              <p className="text-xs text-slate-300 mt-1">
                Global signaling, regional media SFU cascades, and TURN relays
                are running within normal SLA targets.
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Refreshed live</span>
          </div>
        </div>

        {/* Services Status Table */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">
              System Components &amp; Edge Clusters
            </h2>
            <span className="text-xs text-slate-400">
              {SYSTEM_SERVICES.length} monitored edges
            </span>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-xl divide-y divide-slate-800/80 overflow-hidden shadow-lg">
            {SYSTEM_SERVICES.map((svc) => (
              <div
                key={svc.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/30 transition"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-slate-800 text-slate-300 shrink-0 mt-0.5 sm:mt-0">
                    {svc.group === 'sfu' ? (
                      <Video className="w-4 h-4 text-indigo-400" />
                    ) : svc.group === 'core' ? (
                      <Globe className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Radio className="w-4 h-4 text-amber-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {svc.name}
                      </span>
                      {svc.latencyMs && (
                        <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                          {svc.latencyMs}ms
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {svc.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-center">
                  <span className="text-xs font-mono text-slate-400">
                    {svc.uptimePct.toFixed(2)}% uptime
                  </span>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="capitalize">{svc.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Past Incidents & Maintenance */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">
              Recent Incidents &amp; Maintenance
            </h2>
            <span className="text-xs text-slate-400">Past 90 days</span>
          </div>

          <div className="space-y-3">
            {RECENT_INCIDENTS.map((inc) => (
              <div
                key={inc.id}
                className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-medium capitalize">
                      {inc.status}
                    </span>
                    <h3 className="text-sm font-semibold text-white">
                      {inc.title}
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400">
                    {inc.timestamp}
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  <strong className="text-slate-400 font-medium">
                    Impact:{' '}
                  </strong>
                  {inc.impact}
                </p>
                <p className="text-xs text-slate-300">
                  <strong className="text-slate-400 font-medium">
                    Resolution:{' '}
                  </strong>
                  {inc.resolution}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/40 py-6 text-center text-xs text-slate-500">
        <p>
          MeetIT Global Distributed Media SFU &amp; WebRTC Telemetry • Status
          updates refreshed continuously
        </p>
      </footer>
    </div>
  );
};
