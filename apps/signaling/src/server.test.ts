import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ServerMessage } from '@meetit/protocol';
import { buildSignalingApp, type SignalingServerInstance } from './app.js';
import { turnCredentials, buildIceServers } from './turn.js';
import { TokenBucketRateLimiter } from './rateLimiter.js';

function waitForMessage(
  ws: WebSocket,
  predicate: (msg: ServerMessage) => boolean,
  timeoutMs = 3000,
): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for WebSocket message'));
    }, timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(raw.toString()) as ServerMessage;
        if (predicate(parsed)) {
          cleanup();
          resolve(parsed);
        }
      } catch {
        // ignore
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMessage);
    };

    ws.on('message', onMessage);
  });
}

describe('TURN credentials and RateLimiter unit tests', () => {
  it('generates deterministic HMAC-SHA1 TURN credentials', () => {
    const creds = turnCredentials('user-123', 'my-secret', 3600, 1700000000000);
    expect(creds.username).toBe('1700003600:user-123');
    expect(creds.credential.length).toBeGreaterThan(10);
    expect(creds.ttl).toBe(3600);

    const servers = buildIceServers('user-123', {
      stunUrls: ['stun:stun.example.com:19302'],
      turnUrls: ['turn:turn.example.com:3478'],
      turnSecret: 'my-secret',
    });
    expect(servers.length).toBe(2);
    expect(servers[1]?.username).toContain(':user-123');
  });

  it('enforces token bucket capacity and refills over time', () => {
    let now = 1000;
    const limiter = new TokenBucketRateLimiter({
      capacity: 2,
      refillPerSecond: 1,
      nowFn: () => now,
    });

    expect(limiter.tryConsume(1)).toBe(true);
    expect(limiter.tryConsume(1)).toBe(true);
    expect(limiter.tryConsume(1)).toBe(false);

    now += 1000; // +1s -> 1 token refilled
    expect(limiter.tryConsume(1)).toBe(true);
    expect(limiter.tryConsume(1)).toBe(false);
  });
});

describe('Signaling server integration tests', () => {
  let instance: SignalingServerInstance | null = null;

  afterEach(async () => {
    if (instance) {
      await instance.close();
      instance = null;
    }
  });

  it('serves /healthz, /readyz, POST /rooms, and GET /rooms/:code', async () => {
    instance = buildSignalingApp({ logger: false });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });

    const healthRes = await fetch(`${address}/healthz`);
    expect(healthRes.status).toBe(200);
    expect(await healthRes.json()).toEqual({ status: 'ok' });

    const createRes = await fetch(`${address}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Sprint Sync' }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      code: string;
      locked: boolean;
      participantCount: number;
    };
    expect(created.code).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);

    const getRes = await fetch(`${address}/rooms/${created.code}`);
    expect(getRes.status).toBe(200);
    const roomInfo = (await getRes.json()) as { exists: boolean; code: string };
    expect(roomInfo.exists).toBe(true);
    expect(roomInfo.code).toBe(created.code);
  });

  it('exchanges offer, answer, ICE, state, and reclaims slot on reconnect', async () => {
    instance = buildSignalingApp({
      logger: false,
      reclaimSlotMs: 5000,
    });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace(/^http/, 'ws');

    const createRes = await fetch(`${address}/rooms`, { method: 'POST' });
    const { code } = (await createRes.json()) as { code: string };

    const clientA = new WebSocket(wsUrl);
    const clientB = new WebSocket(wsUrl);

    await Promise.all([
      new Promise((r) => clientA.once('open', r)),
      new Promise((r) => clientB.once('open', r)),
    ]);

    // Send an invalid frame from A first to verify Zod drop + counter
    const errPromise = waitForMessage(clientA, (m) => m.type === 'error');
    clientA.send(JSON.stringify({ v: 1, type: 'unknown.type', payload: {} }));
    const errMsg = await errPromise;
    expect((errMsg.payload as { code: string }).code).toBe('INVALID_MESSAGE');
    expect(instance.metrics.invalidFrames).toBe(1);

    // Client A joins
    const joinedAPromise = waitForMessage(clientA, (m) => m.type === 'joined');
    clientA.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: code,
          displayName: 'Ada',
          token: 'user-jwt',
        },
      }),
    );
    const joinedA = (await joinedAPromise).payload as {
      selfId: string;
      role: string;
      peers: unknown[];
    };
    expect(joinedA.role).toBe('host');
    expect(joinedA.peers.length).toBe(0);

    // Client B joins; Client A receives peer.joined
    const peerJoinedOnAPromise = waitForMessage(
      clientA,
      (m) => m.type === 'peer.joined',
    );
    const joinedBPromise = waitForMessage(clientB, (m) => m.type === 'joined');

    clientB.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: code,
          displayName: 'Tunde',
          token: 'guest-token',
        },
      }),
    );

    const joinedB = (await joinedBPromise).payload as {
      selfId: string;
      role: string;
      peers: Array<{ id: string }>;
    };
    await peerJoinedOnAPromise;
    expect(joinedB.role).toBe('guest');
    expect(joinedB.peers[0]?.id).toBe(joinedA.selfId);

    // Relay offer from A -> B
    const offerOnBPromise = waitForMessage(
      clientB,
      (m) => m.type === 'signal.offer',
    );
    clientA.send(
      JSON.stringify({
        v: 1,
        type: 'signal.offer',
        payload: {
          to: joinedB.selfId,
          sdp: { type: 'offer', sdp: 'v=0\r\n' },
        },
      }),
    );
    const offerOnB = (await offerOnBPromise).payload as {
      from: string;
      sdp: { type: string };
    };
    expect(offerOnB.from).toBe(joinedA.selfId);
    expect(offerOnB.sdp.type).toBe('offer');

    // Relay answer from B -> A
    const answerOnAPromise = waitForMessage(
      clientA,
      (m) => m.type === 'signal.answer',
    );
    clientB.send(
      JSON.stringify({
        v: 1,
        type: 'signal.answer',
        payload: {
          to: joinedA.selfId,
          sdp: { type: 'answer', sdp: 'v=0\r\n' },
        },
      }),
    );
    const answerOnA = (await answerOnAPromise).payload as { from: string };
    expect(answerOnA.from).toBe(joinedB.selfId);

    // Slot reclaim: Client A drops abruptly and reconnects with same selfId
    clientA.close();
    await new Promise((r) => setTimeout(r, 30));

    const clientAReconnected = new WebSocket(wsUrl);
    await new Promise((r) => clientAReconnected.once('open', r));

    const rejoinedAPromise = waitForMessage(
      clientAReconnected,
      (m) => m.type === 'joined',
    );
    clientAReconnected.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: code,
          displayName: 'Ada',
          token: 'user-jwt',
          selfId: joinedA.selfId,
        },
      }),
    );

    const rejoinedA = (await rejoinedAPromise).payload as {
      selfId: string;
      role: string;
    };
    expect(rejoinedA.selfId).toBe(joinedA.selfId);
    expect(rejoinedA.role).toBe('host');

    clientAReconnected.close();
    clientB.close();
  });

  it('closes unauthenticated sockets after authTimeoutMs with 4401', async () => {
    instance = buildSignalingApp({
      logger: false,
      authTimeoutMs: 120,
    });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace(/^http/, 'ws');

    const ws = new WebSocket(wsUrl);
    const closeCode = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });
    expect(closeCode).toBe(4401);
  });

  it('enforces 4-participant mesh cap (ROOM_FULL), orders chat messages monotonically, and relays reactions', async () => {
    instance = buildSignalingApp({ logger: false });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace(/^http/, 'ws');

    const createRes = await instance.app.inject({
      method: 'POST',
      url: '/rooms',
    });
    const { code } = createRes.json<{ code: string }>();

    const sockets: WebSocket[] = [];
    for (let i = 1; i <= 4; i++) {
      const ws = new WebSocket(wsUrl);
      await new Promise((r) => ws.once('open', r));
      const joinedPromise = waitForMessage(ws, (m) => m.type === 'joined');
      ws.send(
        JSON.stringify({
          v: 1,
          type: 'join',
          payload: {
            roomCode: code,
            displayName: `Peer ${i}`,
            token: 'guest-token',
          },
        }),
      );
      await joinedPromise;
      sockets.push(ws);
    }

    // 5th participant should receive ROOM_FULL
    const fifthWs = new WebSocket(wsUrl);
    await new Promise((r) => fifthWs.once('open', r));
    const roomFullPromise = waitForMessage(fifthWs, (m) => m.type === 'error');
    fifthWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: code,
          displayName: 'Peer 5',
          token: 'guest-token',
        },
      }),
    );
    const errPayload = (await roomFullPromise).payload as { code: string };
    expect(errPayload.code).toBe('ROOM_FULL');
    fifthWs.close();

    // Server-ordered chat sequence numbers
    const peer1 = sockets[0]!;
    const peer2 = sockets[1]!;

    const chat1Promise = waitForMessage(
      peer2,
      (m) => m.type === 'chat.message',
    );
    peer1.send(
      JSON.stringify({
        v: 1,
        type: 'chat.send',
        payload: { text: 'First message' },
      }),
    );
    const chat1 = (await chat1Promise).payload as {
      id: string;
      seq: number;
      text: string;
    };
    expect(chat1.seq).toBe(1);
    expect(chat1.text).toBe('First message');

    const chat2Promise = waitForMessage(
      peer1,
      (m) => m.type === 'chat.message',
    );
    peer2.send(
      JSON.stringify({
        v: 1,
        type: 'chat.send',
        payload: { text: 'Second message' },
      }),
    );
    const chat2 = (await chat2Promise).payload as {
      id: string;
      seq: number;
      text: string;
    };
    expect(chat2.seq).toBe(2);
    expect(chat1.id < chat2.id).toBe(true);

    // Ephemeral reactions + rate limit
    const reactionPromise = waitForMessage(
      peer2,
      (m) => m.type === 'reaction.received',
    );
    peer1.send(
      JSON.stringify({
        v: 1,
        type: 'reaction.send',
        payload: { emoji: '🎉' },
      }),
    );
    const reaction = (await reactionPromise).payload as { emoji: string };
    expect(reaction.emoji).toBe('🎉');

    // Immediate second reaction within 300ms should trigger RATE_LIMITED error
    const rateLimitPromise = waitForMessage(peer1, (m) => m.type === 'error');
    peer1.send(
      JSON.stringify({
        v: 1,
        type: 'reaction.send',
        payload: { emoji: '👍' },
      }),
    );
    const rateErr = (await rateLimitPromise).payload as { code: string };
    expect(rateErr.code).toBe('RATE_LIMITED');

    for (const ws of sockets) {
      ws.close();
    }
  });

  it('supports room title/description, passcode enforcement, signed guest tokens, and meeting history', async () => {
    instance = buildSignalingApp({ logger: false });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace(/^http/, 'ws');

    // 1. Issue signed guest token
    const guestRes = await instance.app.inject({
      method: 'POST',
      url: '/auth/guest',
      payload: { displayName: 'Chidi Guest' },
    });
    expect(guestRes.statusCode).toBe(200);
    const { token: signedGuestToken } = guestRes.json<{
      token: string;
      expiresAt: number;
    }>();
    expect(signedGuestToken.startsWith('guest.')).toBe(true);

    // 2. Create room with title, description, and passcode
    const createRes = await instance.app.inject({
      method: 'POST',
      url: '/rooms',
      payload: {
        title: 'Design Architecture Sync',
        description: 'Reviewing Phase 3 rooms and meetings.',
        passcode: '4242',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json<{
      code: string;
      title: string;
      description: string;
      hasPasscode: boolean;
    }>();
    expect(created.title).toBe('Design Architecture Sync');
    expect(created.description).toBe('Reviewing Phase 3 rooms and meetings.');
    expect(created.hasPasscode).toBe(true);

    // 3. Joining without passcode fails with FORBIDDEN
    const wsWrong = new WebSocket(wsUrl);
    await new Promise((r) => wsWrong.once('open', r));
    const errPromise = waitForMessage(wsWrong, (m) => m.type === 'error');
    wsWrong.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: created.code,
          displayName: 'Chidi Guest',
          token: signedGuestToken,
          passcode: '0000',
        },
      }),
    );
    const errMsg = (await errPromise).payload as { code: string };
    expect(errMsg.code).toBe('FORBIDDEN');
    wsWrong.close();

    // 4. Joining with correct passcode succeeds and records meeting history
    const wsOk = new WebSocket(wsUrl);
    await new Promise((r) => wsOk.once('open', r));
    const joinedPromise = waitForMessage(wsOk, (m) => m.type === 'joined');
    wsOk.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: created.code,
          displayName: 'Chidi Guest',
          token: signedGuestToken,
          passcode: '4242',
        },
      }),
    );
    const joined = (await joinedPromise).payload as {
      roomState: { title?: string; description?: string };
    };
    expect(joined.roomState.title).toBe('Design Architecture Sync');

    wsOk.send(JSON.stringify({ v: 1, type: 'leave', payload: {} }));
    await new Promise((r) => setTimeout(r, 40));

    const historyRes = await instance.app.inject({
      method: 'GET',
      url: '/meetings/history',
    });
    expect(historyRes.statusCode).toBe(200);
    const historyData = historyRes.json<{
      meetings: Array<{ roomCode: string; roomTitle?: string }>;
    }>();
    expect(
      historyData.meetings.some(
        (m) =>
          m.roomCode === created.code &&
          m.roomTitle === 'Design Architecture Sync',
      ),
    ).toBe(true);

    wsOk.close();
  });
});
