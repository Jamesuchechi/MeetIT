import { AccessToken } from 'livekit-server-sdk';
import type { PeerRole } from '@meetit/protocol';

export interface LiveKitTokenParams {
  apiKey?: string | undefined;
  apiSecret?: string | undefined;
  livekitUrl?: string | undefined;
  roomCode: string;
  identity: string;
  displayName: string;
  role: PeerRole;
  ttl?: string | number | undefined;
}

export function isLiveKitConfigured(options?: {
  apiKey?: string | undefined;
  apiSecret?: string | undefined;
  livekitUrl?: string | undefined;
}): boolean {
  const url = options?.livekitUrl ?? process.env.LIVEKIT_URL;
  const key = options?.apiKey ?? process.env.LIVEKIT_API_KEY;
  const secret = options?.apiSecret ?? process.env.LIVEKIT_API_SECRET;
  return Boolean(url && key && secret);
}

export async function issueLiveKitToken(
  params: LiveKitTokenParams,
): Promise<{ url: string; token: string } | null> {
  const url = params.livekitUrl ?? process.env.LIVEKIT_URL;
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
  };
}
