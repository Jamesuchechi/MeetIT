import type { MediaProviderConfig, MediaProviderName } from '@meetit/protocol';
import { AgoraTransport } from './agora.js';
import { JitsiTransport } from './jitsi.js';
import { LiveKitTransport } from './livekit.js';
import type { ConnectOptions, MediaTransport } from './index.js';

export function createTransportForProvider(
  provider: MediaProviderName,
): MediaTransport {
  switch (provider) {
    case 'livekit':
      return new LiveKitTransport();
    case 'jitsi':
      return new JitsiTransport();
    case 'agora':
      return new AgoraTransport();
  }
}

export function applyProviderConfigToConnectOptions(
  base: ConnectOptions,
  config: MediaProviderConfig,
): ConnectOptions {
  if (config.provider === 'livekit') {
    return {
      ...base,
      livekit: {
        url: config.url,
        token: config.token,
      },
    };
  }
  if (config.provider === 'jitsi') {
    return {
      ...base,
      jitsi: {
        domain: config.domain,
        roomName: config.roomName,
        ...(config.jwt ? { jwt: config.jwt } : {}),
        ...(config.mucDomain ? { mucDomain: config.mucDomain } : {}),
        ...(config.serviceUrl ? { serviceUrl: config.serviceUrl } : {}),
      },
    };
  }
  return {
    ...base,
    agora: {
      appId: config.appId,
      channel: config.channel,
      token: config.token,
      uid: config.uid,
    },
  };
}

export async function connectTransportWithTimeout(
  transport: MediaTransport,
  options: ConnectOptions,
  timeoutMs = 8000,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      transport.connect(options),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(`Media transport connect timed out after ${timeoutMs}ms`),
          );
        }, timeoutMs);
      }),
    ]);
  } catch (err) {
    try {
      await transport.disconnect();
    } catch {
      // ignore disconnect errors during failed connect cleanup
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
