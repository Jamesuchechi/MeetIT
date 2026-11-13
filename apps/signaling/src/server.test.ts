import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { generateRoomCode, type ServerMessage } from '@meetit/protocol';
import { buildSignalingApp, type SignalingServerInstance } from './app.js';
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

describe('RateLimiter unit tests', () => {
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

    const uptimeRes = await fetch(`${address}/health`);
    expect(uptimeRes.status).toBe(200);
    const uptimeBody = (await uptimeRes.json()) as {
      status: string;
      uptimeSeconds: number;
    };
    expect(uptimeBody.status).toBe('ok');
    expect(typeof uptimeBody.uptimeSeconds).toBe('number');

    const metricsRes = await fetch(`${address}/metrics`);
    expect(metricsRes.status).toBe(200);
    const metricsBody = (await metricsRes.json()) as {
      status: string;
      rooms: { active: number };
    };
    expect(metricsBody.status).toBe('ok');
    expect(metricsBody.rooms.active).toBe(0);

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
      payload: { maxParticipants: 4 },
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

  it('enforces server-authoritative host controls: waiting room, roles, mute/ask-unmute, guest restrictions, remove-and-block, and end meeting', async () => {
    instance = buildSignalingApp({ logger: false });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace(/^http/, 'ws');

    // Create a room with waiting room enabled
    const createRes = await instance.app.inject({
      method: 'POST',
      url: '/rooms',
      payload: {
        title: 'Moderated Townhall',
        waitingRoom: true,
      },
    });
    const { code: roomCode } = createRes.json<{ code: string }>();

    // 1. First caller joins and becomes Host immediately
    const hostWs = new WebSocket(wsUrl);
    await new Promise((r) => hostWs.once('open', r));
    const hostJoinedPromise = waitForMessage(
      hostWs,
      (m) => m.type === 'joined',
    );
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode,
          displayName: 'Host James',
          token: 'host-token-1',
        },
      }),
    );
    const hostJoined = (await hostJoinedPromise).payload as {
      selfId: string;
      role: string;
    };
    expect(hostJoined.role).toBe('host');

    // 2. Second caller joins with a guest token and is placed in the Waiting Room
    const guestWs = new WebSocket(wsUrl);
    await new Promise((r) => guestWs.once('open', r));
    const waitingRoomPromise = waitForMessage(
      guestWs,
      (m) => m.type === 'waiting.room',
    );
    const hostWaitingUpdatePromise = waitForMessage(
      hostWs,
      (m) => m.type === 'waiting.updated',
    );
    guestWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode,
          displayName: 'Guest Ada',
          token: 'guest-token-ada',
        },
      }),
    );
    await waitingRoomPromise;
    const waitingUpdate = (await hostWaitingUpdatePromise).payload as {
      waitingPeers: Array<{ id: string; displayName: string }>;
    };
    expect(waitingUpdate.waitingPeers).toHaveLength(1);
    const adaId = waitingUpdate.waitingPeers[0]!.id;

    // 3. Host admits Guest Ada from waiting room
    const adaJoinedPromise = waitForMessage(
      guestWs,
      (m) => m.type === 'joined',
    );
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: { action: 'admit', targetPeerId: adaId },
      }),
    );
    const adaJoined = (await adaJoinedPromise).payload as {
      selfId: string;
      role: string;
    };
    expect(adaJoined.selfId).toBe(adaId);
    expect(adaJoined.role).toBe('guest');

    // 4. Host mutes Guest Ada and asks to unmute
    const muteCmdPromise = waitForMessage(
      guestWs,
      (m) =>
        m.type === 'host.command' &&
        (m.payload as { command: string }).command === 'mute',
    );
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: { action: 'mute', targetPeerId: adaId },
      }),
    );
    await muteCmdPromise;

    const askUnmutePromise = waitForMessage(
      guestWs,
      (m) =>
        m.type === 'host.command' &&
        (m.payload as { command: string }).command === 'ask_unmute',
    );
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: { action: 'ask_unmute', targetPeerId: adaId },
      }),
    );
    await askUnmutePromise;

    // 5. Host disables guest chat -> Guest Ada's chat message is rejected with FORBIDDEN
    const roomUpdatePromise = waitForMessage(
      guestWs,
      (m) => m.type === 'room.updated',
    );
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: {
          action: 'set_permissions',
          permissions: { allowGuestChat: false },
        },
      }),
    );
    await roomUpdatePromise;

    const chatForbiddenPromise = waitForMessage(
      guestWs,
      (m) => m.type === 'error',
    );
    guestWs.send(
      JSON.stringify({
        v: 1,
        type: 'chat.send',
        payload: { text: 'Can guests chat?' },
      }),
    );
    const chatErr = (await chatForbiddenPromise).payload as { code: string };
    expect(chatErr.code).toBe('FORBIDDEN');

    // 6. Host removes and blocks Guest Ada -> Ada cannot rejoin with the same token
    const removedCmdPromise = waitForMessage(
      guestWs,
      (m) =>
        m.type === 'host.command' &&
        (m.payload as { command: string }).command === 'removed',
    );
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: { action: 'remove', targetPeerId: adaId, block: true },
      }),
    );
    const removedPayload = (await removedCmdPromise).payload as {
      blocked: boolean;
    };
    expect(removedPayload.blocked).toBe(true);
    guestWs.close();

    // Attempt rejoin with blocked token
    const blockedWs = new WebSocket(wsUrl);
    await new Promise((r) => blockedWs.once('open', r));
    const blockedErrPromise = waitForMessage(
      blockedWs,
      (m) => m.type === 'error',
    );
    blockedWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode,
          displayName: 'Guest Ada Again',
          token: 'guest-token-ada',
        },
      }),
    );
    const blockedErr = (await blockedErrPromise).payload as { code: string };
    expect(blockedErr.code).toBe('FORBIDDEN');
    blockedWs.close();
    hostWs.close();
  });

  it('backfills missed chat messages and resyncs room state upon signaling reconnect', async () => {
    instance = buildSignalingApp({ logger: false });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace(/^http/, 'ws');

    const createRes = await instance.app.inject({
      method: 'POST',
      url: '/rooms',
      payload: { title: 'Resilience Test Room' },
    });
    const { code: roomCode } = createRes.json<{ code: string }>();

    // 1. Alice (Host) and Bob join
    const aliceWs = new WebSocket(wsUrl);
    await new Promise((r) => aliceWs.once('open', r));
    const aliceJoinP = waitForMessage(aliceWs, (m) => m.type === 'joined');
    aliceWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: { roomCode, displayName: 'Alice', token: 'user-alice' },
      }),
    );
    await aliceJoinP;

    const bobWs = new WebSocket(wsUrl);
    await new Promise((r) => bobWs.once('open', r));
    const bobJoinP = waitForMessage(bobWs, (m) => m.type === 'joined');
    bobWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: { roomCode, displayName: 'Bob', token: 'user-bob' },
      }),
    );
    const bobJoined = (await bobJoinP).payload as { selfId: string };
    const bobId = bobJoined.selfId;

    // 2. Alice sends message #1 while Bob is connected
    const msg1P = waitForMessage(bobWs, (m) => m.type === 'chat.message');
    aliceWs.send(
      JSON.stringify({
        v: 1,
        type: 'chat.send',
        payload: { text: 'Message 1 before drop' },
      }),
    );
    const msg1 = (await msg1P).payload as { seq: number; text: string };
    expect(msg1.seq).toBe(1);

    // 3. Bob drops connection (without explicit leave); Alice sends messages #2 and #3
    bobWs.close();
    await new Promise((r) => setTimeout(r, 40));

    const msg2AliceP = waitForMessage(
      aliceWs,
      (m) =>
        m.type === 'chat.message' && (m.payload as { seq: number }).seq === 2,
    );
    aliceWs.send(
      JSON.stringify({
        v: 1,
        type: 'chat.send',
        payload: { text: 'Message 2 while Bob offline' },
      }),
    );
    await msg2AliceP;

    const msg3AliceP = waitForMessage(
      aliceWs,
      (m) =>
        m.type === 'chat.message' && (m.payload as { seq: number }).seq === 3,
    );
    aliceWs.send(
      JSON.stringify({
        v: 1,
        type: 'chat.send',
        payload: { text: 'Message 3 while Bob offline' },
      }),
    );
    await msg3AliceP;

    // 4. Bob reconnects with selfId=bobId and lastChatSeq=1 -> receives only messages #2 and #3 in chatHistory
    const bobReconnectWs = new WebSocket(wsUrl);
    await new Promise((r) => bobReconnectWs.once('open', r));
    const bobRejoinedP = waitForMessage(
      bobReconnectWs,
      (m) => m.type === 'joined',
    );
    bobReconnectWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode,
          displayName: 'Bob',
          token: 'user-bob',
          selfId: bobId,
          lastChatSeq: 1,
        },
      }),
    );
    const rejoinedPayload = (await bobRejoinedP).payload as {
      selfId: string;
      roomState: {
        chatHistory?: Array<{ seq: number; text: string }>;
      };
    };
    expect(rejoinedPayload.selfId).toBe(bobId);
    expect(rejoinedPayload.roomState.chatHistory).toHaveLength(2);
    expect(rejoinedPayload.roomState.chatHistory?.[0]?.text).toBe(
      'Message 2 while Bob offline',
    );
    expect(rejoinedPayload.roomState.chatHistory?.[1]?.text).toBe(
      'Message 3 while Bob offline',
    );

    bobReconnectWs.close();
    aliceWs.close();
  });

  it('supports room transport configuration and issues LiveKit SFU access tokens on join', async () => {
    instance = buildSignalingApp({
      logger: false,
      livekitUrl: 'wss://meetit-test.livekit.cloud',
      livekitApiKey: 'devkey',
      livekitApiSecret: 'secret_longer_than_32_characters_123456789',
    });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace('http', 'ws');

    const createRes = await fetch(`${address}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'All Hands Webinar',
        transport: 'sfu',
        maxParticipants: 100,
      }),
    });
    expect(createRes.status).toBe(201);
    const room = (await createRes.json()) as {
      code: string;
      transport: string;
      maxParticipants: number;
    };
    expect(room.transport).toBe('sfu');
    expect(room.maxParticipants).toBe(100);

    const ws = new WebSocket(wsUrl);
    const joinedP = waitForMessage(ws, (m) => m.type === 'joined');

    await new Promise<void>((resolve) => ws.once('open', resolve));

    ws.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: room.code,
          displayName: 'Presenter Alice',
          token: 'jwt-user-alice',
        },
      }),
    );

    const joinedMsg = await joinedP;
    const payload = joinedMsg.payload as {
      transport: string;
      livekit?: { url: string; token: string };
    };
    expect(payload.transport).toBe('sfu');
    expect(payload.livekit).toBeDefined();
    expect(payload.livekit?.url).toBe('wss://meetit-test.livekit.cloud');
    expect(typeof payload.livekit?.token).toBe('string');
    expect(payload.livekit!.token.length).toBeGreaterThan(20);

    ws.close();
  });

  it('serves /regions and routes token issuance to preferred region', async () => {
    instance = buildSignalingApp({
      logger: false,
      livekitUrl: 'wss://global.meetit.livekit.cloud',
      livekitApiKey: 'devkey',
      livekitApiSecret: 'secret_longer_than_32_characters_123456789',
      livekitRegionalUrls: {
        'us-east': 'wss://us-east.meetit.livekit.cloud',
        'eu-west': 'wss://eu-west.meetit.livekit.cloud',
      },
    });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace('http', 'ws');

    // 1. GET /regions
    const regionsRes = await fetch(`${address}/regions`);
    expect(regionsRes.status).toBe(200);
    const { regions } = (await regionsRes.json()) as {
      regions: { id: string; name: string; pingUrl: string }[];
    };
    expect(regions.length).toBe(2);
    expect(regions.find((r) => r.id === 'us-east')).toBeDefined();
    expect(regions.find((r) => r.id === 'eu-west')).toBeDefined();

    // 2. Join with preferredRegion: 'eu-west'
    const code = generateRoomCode();
    const ws = new WebSocket(wsUrl);
    const joinedP = waitForMessage(ws, (m) => m.type === 'joined');
    await new Promise<void>((resolve) => ws.once('open', resolve));

    ws.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: code,
          displayName: 'EU Peer',
          token: 'guest-token',
          preferredRegion: 'eu-west',
        },
      }),
    );

    const joinedMsg = await joinedP;
    const payload = joinedMsg.payload as {
      livekit?: { url: string; token: string; region?: string };
      region?: string;
    };
    expect(payload.livekit).toBeDefined();
    expect(payload.livekit?.url).toBe('wss://eu-west.meetit.livekit.cloud');
    expect(payload.region).toBe('eu-west');

    ws.close();
  });

  it('supports host start/stop recording, enforces permissions, and broadcasts recording state', async () => {
    instance = buildSignalingApp({ logger: false });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace('http', 'ws');
    const code = generateRoomCode();

    // 1. Host joins
    const hostWs = new WebSocket(wsUrl);
    const hostJoinedP = waitForMessage(hostWs, (m) => m.type === 'joined');
    await new Promise<void>((resolve) => hostWs.once('open', resolve));
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: code,
          displayName: 'Host Jane',
          token: 'user-token',
        },
      }),
    );
    const hostJoined = (await hostJoinedP).payload as { selfId: string };

    // 2. Guest joins
    const guestWs = new WebSocket(wsUrl);
    const guestJoinedP = waitForMessage(guestWs, (m) => m.type === 'joined');
    await new Promise<void>((resolve) => guestWs.once('open', resolve));
    guestWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: code,
          displayName: 'Guest Bob',
          token: 'guest-token',
        },
      }),
    );
    await guestJoinedP;

    // 3. Guest tries to start recording -> should receive FORBIDDEN error
    const guestErrorP = waitForMessage(guestWs, (m) => m.type === 'error');
    guestWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: { action: 'start_recording' },
      }),
    );
    const err = (await guestErrorP).payload as { code: string };
    expect(err.code).toBe('FORBIDDEN');

    // 4. Host starts recording -> both host and guest receive recording.started
    const hostRecP = waitForMessage(
      hostWs,
      (m) => m.type === 'recording.started',
    );
    const guestRecP = waitForMessage(
      guestWs,
      (m) => m.type === 'recording.started',
    );
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: { action: 'start_recording' },
      }),
    );

    const [hostRec, guestRec] = await Promise.all([hostRecP, guestRecP]);
    const recPayload = guestRec.payload as {
      startedAt: number;
      byDisplayName: string;
      byPeerId: string;
      egressId?: string;
    };
    expect(recPayload.byDisplayName).toBe('Host Jane');
    expect(recPayload.byPeerId).toBe(hostJoined.selfId);
    expect(recPayload.startedAt).toBeGreaterThan(0);
    expect(recPayload.egressId).toBeDefined();
    expect((hostRec.payload as typeof recPayload).startedAt).toBe(
      recPayload.startedAt,
    );

    // 5. Late attendee joins while recording is active -> receives roomState.recording: true
    const lateWs = new WebSocket(wsUrl);
    const lateJoinedP = waitForMessage(lateWs, (m) => m.type === 'joined');
    await new Promise<void>((resolve) => lateWs.once('open', resolve));
    lateWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: code,
          displayName: 'Late Attendee',
          token: 'guest-token',
        },
      }),
    );
    const lateJoined = (await lateJoinedP).payload as {
      roomState: { recording?: boolean; recordingStartedAt?: number };
    };
    expect(lateJoined.roomState.recording).toBe(true);
    expect(lateJoined.roomState.recordingStartedAt).toBe(recPayload.startedAt);

    // 6. Host stops recording -> recording.stopped broadcast
    const hostStopP = waitForMessage(
      hostWs,
      (m) => m.type === 'recording.stopped',
    );
    const guestStopP = waitForMessage(
      guestWs,
      (m) => m.type === 'recording.stopped',
    );
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: { action: 'stop_recording' },
      }),
    );
    const [hostStop, guestStop] = await Promise.all([hostStopP, guestStopP]);
    const stopPayload = guestStop.payload as {
      byDisplayName: string;
      egressId?: string;
      storagePath?: string;
    };
    expect(stopPayload.byDisplayName).toBe('Host Jane');
    expect(stopPayload.egressId).toBe(recPayload.egressId);
    expect(stopPayload.storagePath).toBeDefined();
    expect((hostStop.payload as typeof stopPayload).byDisplayName).toBe(
      'Host Jane',
    );

    hostWs.close();
    guestWs.close();
    lateWs.close();
  });

  it('coordinates seamless device handoff (initiate -> claim -> transferred)', async () => {
    instance = buildSignalingApp({ logger: false });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace(/^http/, 'ws');

    const roomRes = await fetch(`${address}/rooms`, { method: 'POST' });
    const room = (await roomRes.json()) as { code: string };

    const phoneWs = new WebSocket(`${wsUrl}/ws?traceId=handoff-phone`);
    await new Promise((r) => phoneWs.once('open', r));

    const phoneJoinedP = waitForMessage(phoneWs, (m) => m.type === 'joined');
    phoneWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: room.code,
          displayName: 'Ada Phone',
          token: 'guest-token',
        },
      }),
    );
    await phoneJoinedP;

    const laptopWs = new WebSocket(`${wsUrl}/ws?traceId=handoff-laptop`);
    await new Promise((r) => laptopWs.once('open', r));

    const laptopJoinedP = waitForMessage(laptopWs, (m) => m.type === 'joined');
    laptopWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: room.code,
          displayName: 'Ada Laptop',
          token: 'guest-token',
        },
      }),
    );
    await laptopJoinedP;

    // 1. Phone initiates handoff
    const handoffToken = `mkt_handoff_test_${Date.now()}`;
    const offeredP = waitForMessage(
      laptopWs,
      (m) => m.type === 'handoff.offered',
    );
    phoneWs.send(
      JSON.stringify({
        v: 1,
        type: 'handoff.initiate',
        payload: {
          token: handoffToken,
          handoffState: {
            handoffToken,
            roomCode: room.code,
            userId: 'user-ada-1',
            displayName: 'Ada Lovelace',
            role: 'host',
            sourceDevice: 'iPhone 15 Pro',
            targetDevice: 'MacBook Pro M3',
            mediaState: {
              audio: true,
              video: true,
              screen: false,
              handRaised: false,
            },
            nonce: 'test-nonce-1234',
            createdAt: Date.now(),
            expiresAt: Date.now() + 180000,
            status: 'pending',
          },
        },
      }),
    );

    const offered = await offeredP;
    expect((offered.payload as { token: string }).token).toBe(handoffToken);

    // 2. Laptop claims handoff
    const claimedP = waitForMessage(
      phoneWs,
      (m) => m.type === 'handoff.claimed',
    );
    laptopWs.send(
      JSON.stringify({
        v: 1,
        type: 'handoff.claim',
        payload: {
          token: handoffToken,
          targetDevice: 'MacBook Pro M3',
        },
      }),
    );

    const claimed = await claimedP;
    expect((claimed.payload as { targetDevice: string }).targetDevice).toBe(
      'MacBook Pro M3',
    );

    // 3. Laptop completes handoff -> phone receives handoff.transferred
    const transferredP = waitForMessage(
      phoneWs,
      (m) => m.type === 'handoff.transferred',
    );
    laptopWs.send(
      JSON.stringify({
        v: 1,
        type: 'handoff.complete',
        payload: {
          token: handoffToken,
          targetDevice: 'MacBook Pro M3',
        },
      }),
    );

    const transferred = await transferredP;
    expect((transferred.payload as { message: string }).message).toContain(
      'MacBook Pro M3',
    );

    phoneWs.close();
    laptopWs.close();
  });
});
