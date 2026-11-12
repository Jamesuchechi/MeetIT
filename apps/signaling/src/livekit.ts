import { AccessToken } from 'livekit-server-sdk';
import type { LiveKitRegion, PeerRole } from '@meetit/protocol';

export interface LiveKitTokenParams {
  apiKey?: string | undefined;
  apiSecret?: string | undefined;
  livekitUrl?: string | undefined;
  regionalUrls?: Record<string, string> | undefined;
  region?: string | undefined;
  roomCode: string;
  identity: string;
  displayName: string;
  role: PeerRole;
  ttl?: string | number | undefined;
}

export function parseRegionalUrls(
  input?: string | Record<string, string>,
): Record<string, string> {
  if (!input) return {};
  if (typeof input === 'object') return input;
  try {
    const parsed = JSON.parse(input);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, string>;
    }
  } catch {
    // Comma-separated fallback: "us-east=wss://...,eu-west=wss://..."
    const result: Record<string, string> = {};
    for (const pair of input.split(',')) {
      const [key, val] = pair.split('=').map((s) => s.trim());
      if (key && val) {
        result[key] = val;
      }
    }
    return result;
  }
  return {};
}

export function formatRegionName(id: string): string {
  const names: Record<string, string> = {
    'us-east': 'US East (N. Virginia)',
    'us-west': 'US West (Oregon)',
    'eu-west': 'Europe (Frankfurt)',
    'eu-central': 'Europe (Frankfurt)',
    'ap-southeast': 'Asia Pacific (Singapore)',
    'ap-northeast': 'Asia Pacific (Tokyo)',
    'sa-east': 'South America (São Paulo)',
    'af-south': 'Africa (Cape Town)',
  };
  return names[id] ?? id.toUpperCase();
}

export function getCascadingTargetsForRegion(
  regionId: string,
  availableRegionIds: string[],
): string[] {
  const defaultCascades: Record<string, string[]> = {
    'us-east': ['us-west', 'eu-west', 'eu-central', 'sa-east'],
    'us-west': ['us-east', 'ap-southeast', 'ap-northeast'],
    'eu-west': ['eu-central', 'us-east', 'af-south'],
    'eu-central': ['eu-west', 'us-east', 'af-south'],
    'ap-southeast': ['ap-northeast', 'eu-central', 'us-west'],
    'ap-northeast': ['ap-southeast', 'us-west'],
    'af-south': ['eu-central', 'eu-west', 'us-east'],
    'sa-east': ['us-east', 'us-west'],
  };

  const targets =
    defaultCascades[regionId] ??
    availableRegionIds.filter((id) => id !== regionId);
  return targets.filter((id) => availableRegionIds.includes(id));
}

export function getSupportedRegions(options?: {
  livekitUrl?: string | undefined;
  regionalUrls?: Record<string, string> | undefined;
}): LiveKitRegion[] {
  const baseDefaultUrl = options?.livekitUrl ?? process.env.LIVEKIT_URL;
  const regionalUrls =
    options?.regionalUrls ?? parseRegionalUrls(process.env.LIVEKIT_REGIONS);

  if (Object.keys(regionalUrls).length > 0) {
    const availableIds = Object.keys(regionalUrls);
    return Object.entries(regionalUrls).map(([id, url], idx) => {
      const pingUrl =
        url
          .replace(/^wss:\/\//i, 'https://')
          .replace(/^ws:\/\//i, 'http://')
          .replace(/\/$/, '') + '/health';
      return {
        id,
        name: formatRegionName(id),
        pingUrl,
        isDefault: idx === 0,
        cascadesTo: getCascadingTargetsForRegion(id, availableIds),
      };
    });
  }

  if (baseDefaultUrl) {
    const pingUrl =
      baseDefaultUrl
        .replace(/^wss:\/\//i, 'https://')
        .replace(/^ws:\/\//i, 'http://')
        .replace(/\/$/, '') + '/health';
    return [
      {
        id: 'default',
        name: 'Auto (Global Edge)',
        pingUrl,
        isDefault: true,
      },
    ];
  }

  return [
    {
      id: 'default',
      name: 'Auto (Global Edge)',
      pingUrl: 'https://meetit.livekit.cloud/health',
      isDefault: true,
    },
  ];
}

export function isLiveKitConfigured(options?: {
  apiKey?: string | undefined;
  apiSecret?: string | undefined;
  livekitApiKey?: string | undefined;
  livekitApiSecret?: string | undefined;
  livekitUrl?: string | undefined;
}): boolean {
  const url = options?.livekitUrl ?? process.env.LIVEKIT_URL;
  const key =
    options?.livekitApiKey ?? options?.apiKey ?? process.env.LIVEKIT_API_KEY;
  const secret =
    options?.livekitApiSecret ??
    options?.apiSecret ??
    process.env.LIVEKIT_API_SECRET;
  return Boolean(url && key && secret);
}

export async function issueLiveKitToken(
  params: LiveKitTokenParams,
): Promise<{ url: string; token: string; region: string } | null> {
  const regionalUrls =
    params.regionalUrls ?? parseRegionalUrls(process.env.LIVEKIT_REGIONS);
  const selectedRegion =
    params.region && regionalUrls[params.region] ? params.region : undefined;

  const url =
    (selectedRegion ? regionalUrls[selectedRegion] : undefined) ??
    params.livekitUrl ??
    process.env.LIVEKIT_URL;
  const key = params.apiKey ?? process.env.LIVEKIT_API_KEY;
  const secret = params.apiSecret ?? process.env.LIVEKIT_API_SECRET;

  if (!url || !key || !secret) {
    return null;
  }

  const isHost = params.role === 'host' || params.role === 'cohost';

  const at = new AccessToken(key, secret, {
    identity: params.identity,
    name: params.displayName,
    ttl: params.ttl ?? '2h',
  });

  at.addGrant({
    room: params.roomCode,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: isHost,
  });

  const token = await at.toJwt();
  return {
    url,
    token,
    region: selectedRegion ?? 'default',
  };
}
