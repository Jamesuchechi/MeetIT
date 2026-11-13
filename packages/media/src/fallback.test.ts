import { describe, expect, it, vi } from 'vitest';
import {
  AgoraTransport,
  JitsiTransport,
  LiveKitTransport,
  applyProviderConfigToConnectOptions,
  connectTransportWithTimeout,
  createTransportForProvider,
  type MediaTransport,
} from './index.js';

describe('media provider factory and fallback', () => {
  it('creates the right transport instance per provider', () => {
    expect(createTransportForProvider('livekit')).toBeInstanceOf(
      LiveKitTransport,
    );
    expect(createTransportForProvider('jitsi')).toBeInstanceOf(JitsiTransport);
    expect(createTransportForProvider('agora')).toBeInstanceOf(AgoraTransport);
  });

  it('maps provider config onto ConnectOptions', () => {
    const base = {
      roomId: 'abc-defg-hij',
      selfId: 'self-1',
      iceServers: [],
    };
    const agoraOpts = applyProviderConfigToConnectOptions(base, {
      provider: 'agora',
      appId: 'app-1',
      channel: 'abc-defg-hij',
      token: 'tok-1',
      uid: 'self-1',
    });
    expect(agoraOpts.agora?.token).toBe('tok-1');

    const jitsiOpts = applyProviderConfigToConnectOptions(base, {
      provider: 'jitsi',
      domain: 'meet.example.com',
      roomName: 'abc-defg-hij',
      jwt: 'jwt-1',
    });
    expect(jitsiOpts.jitsi?.jwt).toBe('jwt-1');
  });

  it('disconnects and rejects when connect times out', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const hangingTransport = {
      connect: () => new Promise<void>(() => {}),
      disconnect,
    } as unknown as MediaTransport;

    await expect(
      connectTransportWithTimeout(
        hangingTransport,
        { roomId: 'r1', selfId: 'u1', iceServers: [] },
        30,
      ),
    ).rejects.toThrow(/timed out/i);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
