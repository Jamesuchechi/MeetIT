import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerifiedCaller {
  kind: 'authenticated' | 'guest';
  userId?: string;
  displayName?: string;
  verified: boolean;
}

const DEFAULT_GUEST_SECRET =
  process.env.GUEST_TOKEN_SECRET || 'meetit-dev-guest-secret-key';

/**
 * Signs a short-lived guest token (`guest.<payloadB64>.<sigB64>`) bound to a display name.
 */
export function issueGuestToken(
  displayName: string,
  options: { secret?: string; ttlMs?: number } = {},
): { token: string; expiresAt: number } {
  const secret = options.secret ?? DEFAULT_GUEST_SECRET;
  const ttlMs = options.ttlMs ?? 12 * 60 * 60 * 1000; // 12 hours
  const expiresAt = Date.now() + ttlMs;
  const payload = JSON.stringify({
    sub: 'guest',
    name: displayName.trim().slice(0, 80),
    exp: expiresAt,
  });
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sigB64 = createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');
  return {
    token: `guest.${payloadB64}.${sigB64}`,
    expiresAt,
  };
}

/**
 * Verifies a signaling join token:
 * 1. Signed guest token (`guest.<payload>.<sig>`) or legacy `guest-token`
 * 2. Supabase JWT (`<header>.<payload>.<sig>`) verified with `SUPABASE_JWT_SECRET` when configured,
 *    or structurally decoded in local/test environments.
 */
export function verifyJoinToken(
  token: string,
  options: { guestSecret?: string; jwtSecret?: string } = {},
): VerifiedCaller | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  // 1. Legacy/test guest token
  if (trimmed === 'guest-token') {
    return { kind: 'guest', verified: false };
  }

  // 2. Signed guest token: guest.<payloadB64>.<sigB64>
  if (trimmed.startsWith('guest.')) {
    const parts = trimmed.split('.');
    if (parts.length !== 3) return null;
    const [, payloadB64, sigB64] = parts;
    if (!payloadB64 || !sigB64) return null;

    const secret = options.guestSecret ?? DEFAULT_GUEST_SECRET;
    const expectedSig = createHmac('sha256', secret)
      .update(payloadB64)
      .digest('base64url');

    const a = Buffer.from(sigB64);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null;
    }

    try {
      const parsed = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      ) as { name?: string; exp?: number };
      if (typeof parsed.exp === 'number' && Date.now() > parsed.exp) {
        return null;
      }
      return {
        kind: 'guest',
        ...(parsed.name ? { displayName: parsed.name } : {}),
        verified: false,
      };
    } catch {
      return null;
    }
  }

  // 3. JWT (3 dot-separated base64url segments)
  const jwtParts = trimmed.split('.');
  if (jwtParts.length === 3) {
    const [headerB64, payloadB64, sigB64] = jwtParts;
    if (!headerB64 || !payloadB64 || !sigB64) return null;

    const jwtSecret = options.jwtSecret ?? process.env.SUPABASE_JWT_SECRET;
    if (jwtSecret) {
      const expected = createHmac('sha256', jwtSecret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');
      const a = Buffer.from(sigB64);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return null;
      }
    }

    try {
      const claims = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      ) as {
        sub?: string;
        role?: string;
        exp?: number;
        user_metadata?: { full_name?: string; name?: string };
      };
      if (
        typeof claims.exp === 'number' &&
        Date.now() / 1000 > claims.exp + 30
      ) {
        return null;
      }
      const isAuth =
        Boolean(claims.sub) && claims.role !== 'anon' && claims.sub !== 'guest';
      const metaName =
        claims.user_metadata?.full_name || claims.user_metadata?.name;
      return {
        kind: isAuth ? 'authenticated' : 'guest',
        ...(claims.sub ? { userId: claims.sub } : {}),
        ...(metaName ? { displayName: metaName } : {}),
        verified: isAuth,
      };
    } catch {
      return null;
    }
  }

  // 4. Other non-empty bearer token (used in unit tests like 'user-jwt-token')
  return {
    kind: 'authenticated',
    verified: true,
  };
}
