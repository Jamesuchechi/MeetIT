import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ProviderHealthTracker,
  issueJitsiCredentials,
  issueRoomMediaProviders,
  parseProviderOrder,
} from './mediaProviders.js';
import { Room } from './room.js';

describe('mediaProviders', () => {
  it('defaults provider order to livekit, jitsi, agora', () => {
    expect(parseProviderOrder('')).toEqual(['livekit', 'jitsi', 'agora']);
    expect(parseProviderOrder('agora, livekit')).toEqual(['agora', 'livekit']);
  });

  it('issues credentials for all configured providers in priority order', async () => {
    const result = await issueRoomMediaProviders({
      roomCode: 'abc-defg-hij',
      identity: '11111111-1111-4111-8111-111111111111',
      displayName: 'Alice',
      role: 'host',
      options: {
        livekitUrl: 'wss://lk.example.com',
        livekitApiKey: 'devkey',
        livekitApiSecret: 'secretsecretsecretsecretsecretsecret',
        jitsiDomain: 'meet.example.com',
        jitsiAppId: 'meetit-app',
        jitsiAppSecret: 'jitsi-super-secret',
        agoraAppId: 'fea3474e7d8b45589a124dafc40da551',
        agoraPrimaryCertificate: 'ed4bdba5af634a779e49ed09ce6552ca',
        providerOrder: ['livekit', 'jitsi', 'agora'],
      },
    });

    expect(result.activeProvider).toBe('livekit');
    expect(result.providers.map((p) => p.provider)).toEqual([
      'livekit',
      'jitsi',
      'agora',
    ]);
    expect(result.livekit?.url).toBe('wss://lk.example.com');
    expect(result.jitsi?.domain).toBe('meet.example.com');
    expect(result.jitsi?.jwt).toBeTruthy();
    expect(result.agora?.appId).toBe('fea3474e7d8b45589a124dafc40da551');
    expect(result.agora?.token).toBeTruthy();
  });

  it('skips unhealthy providers via ProviderHealthTracker', async () => {
    const health = new ProviderHealthTracker();
    health.markUnhealthy('livekit', 60_000);

    const result = await issueRoomMediaProviders({
      roomCode: 'abc-defg-hij',
      identity: '11111111-1111-4111-8111-111111111111',
      displayName: 'Alice',
      role: 'host',
      healthTracker: health,
      options: {
        livekitUrl: 'wss://lk.example.com',
        livekitApiKey: 'devkey',
        livekitApiSecret: 'secretsecretsecretsecretsecretsecret',
        jitsiDomain: 'meet.example.com',
        agoraAppId: 'fea3474e7d8b45589a124dafc40da551',
        agoraPrimaryCertificate: 'ed4bdba5af634a779e49ed09ce6552ca',
        providerOrder: ['livekit', 'jitsi', 'agora'],
      },
    });

    expect(result.activeProvider).toBe('jitsi');
  });

  it('advances room media provider through fallback chain on failures', () => {
    const room = new Room('abc-defg-hij');
    expect(room.transport).toBe('sfu');

    room.activeProvider = 'livekit';
    expect(
      room.advanceMediaProvider('livekit', ['livekit', 'jitsi', 'agora']),
    ).toBe('jitsi');
    expect(
      room.advanceMediaProvider('jitsi', ['livekit', 'jitsi', 'agora']),
    ).toBe('agora');
    expect(
      room.advanceMediaProvider('agora', ['livekit', 'jitsi', 'agora']),
    ).toBeNull();
  });

  it('issues RS256 JaaS JWT and 8x8.vc serviceUrl when JaaS is configured', () => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    const jaas = issueJitsiCredentials({
      roomCode: 'abc-defg-hij',
      identity: '11111111-1111-4111-8111-111111111111',
      displayName: 'Alice',
      role: 'host',
      options: {
        jaasAppId: 'vpaas-magic-cookie-test123',
        jaasKid: 'vpaas-magic-cookie-test123/key1',
        jaasPrivateKey: privateKey,
      },
    });

    expect(jaas?.domain).toBe('8x8.vc');
    expect(jaas?.mucDomain).toBe(
      'conference.vpaas-magic-cookie-test123.8x8.vc',
    );
    expect(jaas?.serviceUrl).toBe(
      'wss://8x8.vc/vpaas-magic-cookie-test123/xmpp-websocket?room=abc-defg-hij',
    );
    expect(jaas?.jwt?.split('.')).toHaveLength(3);
  });
});
