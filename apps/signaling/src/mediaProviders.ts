import { createHmac, createSign } from 'node:crypto';
import agoraToken from 'agora-token';
import type {
  AgoraConfig,
  JitsiConfig,
  LivekitConfig,
  MediaProviderConfig,
  MediaProviderName,
  PeerRole,
} from '@meetit/protocol';
import { isLiveKitConfigured, issueLiveKitToken } from './livekit.js';

const { RtcTokenBuilder, RtcRole } = agoraToken;

export const DEFAULT_PROVIDER_ORDER: MediaProviderName[] = [
  'livekit',
  'jitsi',
  'agora',
];

export function parseProviderOrder(input?: string): MediaProviderName[] {
  const raw = input ?? process.env.MEDIA_PROVIDER_ORDER;
  if (!raw || !raw.trim()) {
    return [...DEFAULT_PROVIDER_ORDER];
  }
  const seen = new Set<MediaProviderName>();
  const result: MediaProviderName[] = [];
  for (const part of raw.split(',')) {
    const normalized = part.trim().toLowerCase();
    if (
      normalized === 'livekit' ||
      normalized === 'jitsi' ||
      normalized === 'agora'
    ) {
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    }
  }
  return result.length > 0 ? result : [...DEFAULT_PROVIDER_ORDER];
}

export interface MediaProviderEnvOptions {
  livekitUrl?: string | undefined;
  livekitApiKey?: string | undefined;
  livekitApiSecret?: string | undefined;
  livekitRegionalUrls?: Record<string, string> | undefined;
  jitsiDomain?: string | undefined;
  jitsiMucDomain?: string | undefined;
  jitsiAppId?: string | undefined;
  jitsiAppSecret?: string | undefined;
  jaasAppId?: string | undefined;
  jaasKid?: string | undefined;
  jaasPrivateKey?: string | undefined;
  agoraAppId?: string | undefined;
  agoraPrimaryCertificate?: string | undefined;
  providerOrder?: MediaProviderName[] | undefined;
}

export function isAgoraConfigured(options?: MediaProviderEnvOptions): boolean {
  const appId =
    options?.agoraAppId ??
    process.env.ALGORA_APP_ID ??
    process.env.AGORA_APP_ID;
  const cert =
    options?.agoraPrimaryCertificate ??
    process.env.ALGORA_PRIMARY_APP_CERTIFICATE ??
    process.env.AGORA_PRIMARY_APP_CERTIFICATE;
  return Boolean(appId && cert);
}

export function isJaasConfigured(options?: MediaProviderEnvOptions): boolean {
  const appId = options?.jaasAppId ?? process.env.JAAS_APP_ID;
  const kid = options?.jaasKid ?? process.env.JAAS_KID;
  const privateKey = options?.jaasPrivateKey ?? process.env.JAAS_PRIVATE_KEY;
  return Boolean(appId?.trim() && kid?.trim() && privateKey?.trim());
}

export function isJitsiConfigured(options?: MediaProviderEnvOptions): boolean {
  if (isJaasConfigured(options)) return true;
  const domain = options?.jitsiDomain ?? process.env.JITSI_DOMAIN;
  return Boolean(domain && domain.trim().length > 0);
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signHs256Jwt(
  payload: Record<string, unknown>,
  secret: string,
): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.${signature}`;
}

function signRs256Jwt(
  payload: Record<string, unknown>,
  kid: string,
  privateKeyPem: string,
): string {
  const header = base64UrlEncode(
    JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }),
  );
  const body = base64UrlEncode(JSON.stringify(payload));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${body}`);
  signer.end();
  const signature = signer
    .sign(privateKeyPem.replace(/\\n/g, '\n'))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.${signature}`;
}

export function issueJitsiCredentials(params: {
  roomCode: string;
  identity: string;
  displayName: string;
  role: PeerRole;
  ttlSeconds?: number | undefined;
  options?: MediaProviderEnvOptions | undefined;
}): JitsiConfig | null {
  const roomName = params.roomCode.replace(/[^a-zA-Z0-9_-]/g, '');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (params.ttlSeconds ?? 7200);
  const isModerator = params.role === 'host' || params.role === 'cohost';

  if (isJaasConfigured(params.options)) {
    const jaasAppId = (
      params.options?.jaasAppId ??
      process.env.JAAS_APP_ID ??
      ''
    ).trim();
    const jaasKid = (
      params.options?.jaasKid ??
      process.env.JAAS_KID ??
      ''
    ).trim();
    const jaasPrivateKey = (
      params.options?.jaasPrivateKey ??
      process.env.JAAS_PRIVATE_KEY ??
      ''
    ).trim();
    const domain = (
      params.options?.jitsiDomain ??
      process.env.JITSI_DOMAIN ??
      '8x8.vc'
    ).trim();
    const mucDomain = (
      params.options?.jitsiMucDomain ??
      process.env.JITSI_MUC_DOMAIN ??
      `conference.${jaasAppId}.${domain}`
    ).trim();
    const serviceUrl = `wss://${domain}/${jaasAppId}/xmpp-websocket?room=${encodeURIComponent(roomName)}`;

    const jwt = signRs256Jwt(
      {
        aud: 'jitsi',
        iss: 'chat',
        sub: jaasAppId,
        room: '*',
        iat: now,
        nbf: now - 10,
        exp,
        context: {
          user: {
            id: params.identity,
            name: params.displayName,
            moderator: isModerator ? 'true' : 'false',
          },
          features: {
            livestreaming: 'false',
            recording: 'false',
            transcription: 'false',
            'outbound-call': 'false',
          },
        },
      },
      jaasKid,
      jaasPrivateKey,
    );

    return {
      domain,
      roomName,
      mucDomain,
      serviceUrl,
      jwt,
    };
  }

  const domain = (
    params.options?.jitsiDomain ??
    process.env.JITSI_DOMAIN ??
    ''
  ).trim();
  if (!domain) return null;

  const mucDomain = (
    params.options?.jitsiMucDomain ??
    process.env.JITSI_MUC_DOMAIN ??
    `conference.${domain}`
  ).trim();

  const appId = (
    params.options?.jitsiAppId ??
    process.env.JITSI_APP_ID ??
    ''
  ).trim();
  const appSecret = (
    params.options?.jitsiAppSecret ??
    process.env.JITSI_APP_SECRET ??
    ''
  ).trim();

  let jwt: string | undefined;

  if (appId && appSecret) {
    jwt = signHs256Jwt(
      {
        aud: 'jitsi',
        iss: appId,
        sub: domain,
        room: roomName,
        iat: now,
        nbf: now - 10,
        exp,
        context: {
          user: {
            id: params.identity,
            name: params.displayName,
            moderator: isModerator,
          },
        },
      },
      appSecret,
    );
  }

  return {
    domain,
    roomName,
    mucDomain,
    ...(jwt ? { jwt } : {}),
  };
}

export function issueAgoraCredentials(params: {
  roomCode: string;
  identity: string;
  role: PeerRole;
  ttlSeconds?: number | undefined;
  options?: MediaProviderEnvOptions | undefined;
}): AgoraConfig | null {
  const appId = (
    params.options?.agoraAppId ??
    process.env.ALGORA_APP_ID ??
    process.env.AGORA_APP_ID ??
    ''
  ).trim();
  const cert = (
    params.options?.agoraPrimaryCertificate ??
    process.env.ALGORA_PRIMARY_APP_CERTIFICATE ??
    process.env.AGORA_PRIMARY_APP_CERTIFICATE ??
    ''
  ).trim();

  if (!appId || !cert) return null;

  const channel = params.roomCode.replace(/[^a-zA-Z0-9_-]/g, '');
  const now = Math.floor(Date.now() / 1000);
  const ttl = params.ttlSeconds ?? 7200;
  const privilegeExpiredTs = now + ttl;
  const rtcRole =
    params.role === 'viewer' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;

  const token = RtcTokenBuilder.buildTokenWithUserAccount(
    appId,
    cert,
    channel,
    params.identity,
    rtcRole,
    ttl,
    privilegeExpiredTs,
  );

  return {
    appId,
    channel,
    token,
    uid: params.identity,
  };
}

export class ProviderHealthTracker {
  private readonly unhealthyUntil = new Map<MediaProviderName, number>();

  markUnhealthy(provider: MediaProviderName, ttlMs = 60_000): void {
    this.unhealthyUntil.set(provider, Date.now() + ttlMs);
  }

  markHealthy(provider: MediaProviderName): void {
    this.unhealthyUntil.delete(provider);
  }

  isHealthy(provider: MediaProviderName): boolean {
    const until = this.unhealthyUntil.get(provider);
    if (!until) return true;
    if (Date.now() >= until) {
      this.unhealthyUntil.delete(provider);
      return true;
    }
    return false;
  }
}

export async function issueRoomMediaProviders(params: {
  roomCode: string;
  identity: string;
  displayName: string;
  role: PeerRole;
  preferredRegion?: string | undefined;
  preferredActiveProvider?: MediaProviderName | undefined;
  failedProviders?: Set<MediaProviderName> | undefined;
  healthTracker?: ProviderHealthTracker | undefined;
  options?: MediaProviderEnvOptions | undefined;
}): Promise<{
  activeProvider?: MediaProviderName;
  providers: MediaProviderConfig[];
  livekit?: LivekitConfig;
  jitsi?: JitsiConfig;
  agora?: AgoraConfig;
}> {
  const order = params.options?.providerOrder ?? parseProviderOrder();
  const providers: MediaProviderConfig[] = [];
  let livekit: LivekitConfig | undefined;
  let jitsi: JitsiConfig | undefined;
  let agora: AgoraConfig | undefined;

  for (const provider of order) {
    if (params.failedProviders?.has(provider)) {
      continue;
    }

    if (
      provider === 'livekit' &&
      isLiveKitConfigured({
        livekitUrl: params.options?.livekitUrl,
        livekitApiKey: params.options?.livekitApiKey,
        livekitApiSecret: params.options?.livekitApiSecret,
      })
    ) {
      const lk = await issueLiveKitToken({
        livekitUrl: params.options?.livekitUrl,
        regionalUrls: params.options?.livekitRegionalUrls,
        region: params.preferredRegion,
        apiKey: params.options?.livekitApiKey,
        apiSecret: params.options?.livekitApiSecret,
        roomCode: params.roomCode,
        identity: params.identity,
        displayName: params.displayName,
        role: params.role,
      });
      if (lk) {
        livekit = lk;
        providers.push({ provider: 'livekit', ...lk });
      }
    } else if (provider === 'jitsi' && isJitsiConfigured(params.options)) {
      const jt = issueJitsiCredentials({
        roomCode: params.roomCode,
        identity: params.identity,
        displayName: params.displayName,
        role: params.role,
        options: params.options,
      });
      if (jt) {
        jitsi = jt;
        providers.push({ provider: 'jitsi', ...jt });
      }
    } else if (provider === 'agora' && isAgoraConfigured(params.options)) {
      const ag = issueAgoraCredentials({
        roomCode: params.roomCode,
        identity: params.identity,
        role: params.role,
        options: params.options,
      });
      if (ag) {
        agora = ag;
        providers.push({ provider: 'agora', ...ag });
      }
    }
  }

  let activeProvider: MediaProviderName | undefined;
  if (
    params.preferredActiveProvider &&
    providers.some((p) => p.provider === params.preferredActiveProvider)
  ) {
    activeProvider = params.preferredActiveProvider;
  } else {
    const healthyFirst = providers.find((p) =>
      params.healthTracker ? params.healthTracker.isHealthy(p.provider) : true,
    );
    activeProvider = healthyFirst?.provider ?? providers[0]?.provider;
  }

  return {
    ...(activeProvider ? { activeProvider } : {}),
    providers,
    ...(livekit ? { livekit } : {}),
    ...(jitsi ? { jitsi } : {}),
    ...(agora ? { agora } : {}),
  };
}
