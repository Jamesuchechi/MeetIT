import { createHmac } from 'node:crypto';
import type { IceServerConfig } from '@meetit/protocol';

export interface TurnCredential {
  username: string;
  credential: string;
  ttl: number;
}

/**
 * Generates short-lived coturn REST API credentials using HMAC-SHA1.
 */
export function turnCredentials(
  userId: string,
  secret: string,
  ttlSeconds = 3600,
  nowMs: number = Date.now(),
): TurnCredential {
  const expiresAt = Math.floor(nowMs / 1000) + ttlSeconds;
  const username = `${expiresAt}:${userId}`;
  const credential = createHmac('sha1', secret)
    .update(username)
    .digest('base64');
  return { username, credential, ttl: ttlSeconds };
}

export interface IceServerEnvConfig {
  stunUrls?: string[];
  turnUrls?: string[];
  turnSecret?: string;
  turnUsername?: string;
  turnCredential?: string;
  ttlSeconds?: number;
}

export function buildIceServers(
  userId: string,
  config: IceServerEnvConfig = {},
): IceServerConfig[] {
  const stunUrls =
    config.stunUrls && config.stunUrls.length > 0
      ? config.stunUrls
      : ['stun:stun.l.google.com:19302'];

  const servers: IceServerConfig[] = [{ urls: stunUrls }];

  if (config.turnUrls && config.turnUrls.length > 0) {
    if (config.turnSecret) {
      const creds = turnCredentials(
        userId,
        config.turnSecret,
        config.ttlSeconds ?? 3600,
      );
      servers.push({
        urls: config.turnUrls,
        username: creds.username,
        credential: creds.credential,
      });
    } else if (config.turnUsername && config.turnCredential) {
      servers.push({
        urls: config.turnUrls,
        username: config.turnUsername,
        credential: config.turnCredential,
      });
    }
  }

  return servers;
}
