import type { WebinarRegistration, WebinarState } from '@meetit/protocol';

export interface WebinarTicketTier {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: 'USD' | 'NGN' | 'EUR' | 'GBP';
  badge?: string;
}

export interface PaymentSimulationResult {
  success: boolean;
  provider: 'stripe' | 'paystack' | 'flutterwave' | 'free';
  transactionRef: string;
  amount: number;
  currency: string;
}

const WEBINAR_PASSES_STORAGE_KEY = 'meetit_webinar_passes';

export function getSavedWebinarPasses(): Record<string, WebinarRegistration> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(WEBINAR_PASSES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveWebinarPass(reg: WebinarRegistration): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getSavedWebinarPasses();
    current[reg.roomCode] = reg;
    localStorage.setItem(WEBINAR_PASSES_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
}

export async function registerForWebinarApi(
  roomCode: string,
  payload: {
    name: string;
    email: string;
    role?: 'panelist' | 'viewer';
    paymentProvider?: 'free' | 'stripe' | 'paystack' | 'flutterwave';
    paymentStatus?: 'free' | 'paid' | 'pending';
    ticketPrice?: number;
    currency?: 'USD' | 'NGN' | 'EUR' | 'GBP';
    transactionRef?: string;
    responses?: Record<string, string>;
  },
  baseUrl = '',
): Promise<{
  success: boolean;
  registration: WebinarRegistration;
  joinToken: string;
  webinar: WebinarState;
}> {
  const url = `${baseUrl}/api/webinars/${roomCode}/register`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Registration failed: ${res.statusText}`);
  }

  const data = (await res.json()) as {
    success: boolean;
    registration: WebinarRegistration;
    joinToken: string;
    webinar: WebinarState;
  };
  saveWebinarPass(data.registration);
  return data;
}

export async function verifyWebinarTokenApi(
  roomCode: string,
  token: string,
  baseUrl = '',
): Promise<{
  valid: boolean;
  registration?: WebinarRegistration;
  webinar: WebinarState;
}> {
  const url = `${baseUrl}/api/webinars/${roomCode}/verify?token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Token verification failed: ${res.statusText}`);
  }
  return res.json() as Promise<{
    valid: boolean;
    registration?: WebinarRegistration;
    webinar: WebinarState;
  }>;
}

export async function fetchWebinarAnalyticsApi(
  roomCode: string,
  baseUrl = '',
): Promise<{
  report: Array<{
    peerId: string;
    displayName: string;
    role: string;
    joinTime: number;
    leaveTime?: number;
    durationSeconds: number;
    chatCount: number;
    pollVotesCount: number;
    qaCount: number;
    engagementScore: number;
  }>;
  peakViewers: number;
}> {
  const url = `${baseUrl}/api/webinars/${roomCode}/analytics`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Analytics fetch failed: ${res.statusText}`);
  }
  return res.json() as Promise<{
    report: Array<{
      peerId: string;
      displayName: string;
      role: string;
      joinTime: number;
      leaveTime?: number;
      durationSeconds: number;
      chatCount: number;
      pollVotesCount: number;
      qaCount: number;
      engagementScore: number;
    }>;
    peakViewers: number;
  }>;
}

export async function simulatePayment(
  provider: 'stripe' | 'paystack' | 'flutterwave',
  amount: number,
  currency: 'USD' | 'NGN' | 'EUR' | 'GBP',
): Promise<PaymentSimulationResult> {
  // Simulate network latency of checkout process
  await new Promise((resolve) => setTimeout(resolve, 600));

  const prefix =
    provider === 'stripe'
      ? 'ch_stripe_'
      : provider === 'paystack'
        ? 'pstk_tx_'
        : 'flw_ref_';
  const transactionRef = `${prefix}${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;

  return {
    success: true,
    provider,
    transactionRef,
    amount,
    currency,
  };
}

export function exportAnalyticsToCsv(
  report: Array<{
    peerId: string;
    displayName: string;
    role: string;
    joinTime: number;
    leaveTime?: number;
    durationSeconds: number;
    chatCount: number;
    pollVotesCount: number;
    qaCount: number;
    engagementScore: number;
  }>,
  roomCode: string,
): void {
  const headers = [
    'Peer ID',
    'Display Name',
    'Role',
    'Join Time',
    'Leave Time',
    'Duration (seconds)',
    'Chat Messages',
    'Poll Votes',
    'Q&A Questions',
    'Engagement Score (%)',
  ];

  const rows = report.map((r) => [
    r.peerId,
    `"${r.displayName.replace(/"/g, '""')}"`,
    r.role,
    new Date(r.joinTime).toISOString(),
    r.leaveTime ? new Date(r.leaveTime).toISOString() : 'Active',
    r.durationSeconds,
    r.chatCount,
    r.pollVotesCount,
    r.qaCount,
    r.engagementScore,
  ]);

  const csvContent =
    'data:text/csv;charset=utf-8,' +
    [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute(
    'download',
    `webinar_analytics_${roomCode}_${Date.now()}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
