import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildSignalingApp } from './app.js';

interface TestMessage {
  v: number;
  id?: string;
  ts?: number;
  type: string;
  payload: Record<string, unknown>;
}

function waitForMessage(
  ws: WebSocket,
  predicate: (msg: TestMessage) => boolean,
  timeoutMs = 4000,
): Promise<TestMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(
        new Error(
          `Timeout waiting for message matching predicate after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    const handler = (raw: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(raw.toString('utf-8')) as TestMessage;
        if (predicate(parsed)) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(parsed);
        }
      } catch {
        // ignore parse error
      }
    };

    ws.on('message', handler);
  });
}

describe('Chaos & Resilience Testing (Phase 12)', () => {
  let instance: ReturnType<typeof buildSignalingApp> | null = null;
  const activeSockets: WebSocket[] = [];

  const trackSocket = (ws: WebSocket): WebSocket => {
    activeSockets.push(ws);
    return ws;
  };

  afterEach(async () => {
    for (const ws of activeSockets) {
      try {
        ws.terminate();
      } catch {
        // ignore
      }
    }
    activeSockets.length = 0;

    if (instance) {
      await instance.app.close();
      instance = null;
    }
  });

  it('survives host abrupt crash, preserves room state, and reclaims peer slot upon reconnect', async () => {
    instance = buildSignalingApp({
      logger: false,
      reclaimSlotMs: 5000,
    });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace(/^http/, 'ws');

    const roomRes = await fetch(`${address}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Resilience Test Sync' }),
    });
    const { code } = (await roomRes.json()) as { code: string };

    // 1. Host joins
    const hostWs = trackSocket(
      new WebSocket(`${wsUrl}/ws?traceId=chaos-host-1`),
    );
    await new Promise((r) => hostWs.once('open', r));
    const hostJoinedP = waitForMessage(hostWs, (m) => m.type === 'joined');
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: code,
          displayName: 'Host Chidi',
          token: 'host-token',
        },
      }),
    );
    const hostJoined = await hostJoinedP;
    const hostPeerId = (hostJoined.payload as { selfId: string }).selfId;
    expect(hostPeerId).toBeDefined();

    // 2. Attendee joins
    const guestWs = trackSocket(
      new WebSocket(`${wsUrl}/ws?traceId=chaos-guest-1`),
    );
    await new Promise((r) => guestWs.once('open', r));
    const guestJoinedP = waitForMessage(guestWs, (m) => m.type === 'joined');
    guestWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: code,
          displayName: 'Guest Fatima',
          token: 'guest-token',
        },
      }),
    );
    await guestJoinedP;

    // 3. CHAOS: Host socket crashes abruptly (terminate without sending 'leave')
    hostWs.terminate(); // simulates hard network drop or SIGKILL

    // Give the server a moment to mark the socket detached (holding slot)
    await new Promise((r) => setTimeout(r, 60));

    // Verify room is still alive in memory and not destroyed
    const roomCheckRes = await fetch(`${address}/rooms/${code}`);
    expect(roomCheckRes.status).toBe(200);

    // 4. RECOVERY: Host reconnects with same selfId before reclaim timeout expires
    const hostReconnectedWs = trackSocket(
      new WebSocket(`${wsUrl}/ws?traceId=chaos-host-reconnect`),
    );
    await new Promise((r) => hostReconnectedWs.once('open', r));
    const hostRejoinedP = waitForMessage(
      hostReconnectedWs,
      (m) => m.type === 'joined',
    );

    hostReconnectedWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: code,
          displayName: 'Host Chidi (Reconnected)',
          token: 'host-token',
          selfId: hostPeerId,
        },
      }),
    );

    const hostRejoined = await hostRejoinedP;
    expect((hostRejoined.payload as { selfId: string }).selfId).toBe(
      hostPeerId,
    );
    expect((hostRejoined.payload as { role: string }).role).toBe('host');
  });

  it('reaps inactive peers and broadcasts peer.left after reclaim timeout expires', async () => {
    instance = buildSignalingApp({
      logger: false,
      reclaimSlotMs: 200, // short 200ms grace period for chaos test
    });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace(/^http/, 'ws');

    const roomRes = await fetch(`${address}/rooms`, { method: 'POST' });
    const { code } = (await roomRes.json()) as { code: string };

    const peer1Ws = trackSocket(
      new WebSocket(`${wsUrl}/ws?traceId=reap-peer-1`),
    );
    await new Promise((r) => peer1Ws.once('open', r));
    const joined1P = waitForMessage(peer1Ws, (m) => m.type === 'joined');
    peer1Ws.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: code,
          displayName: 'Participant A',
          token: 'token-a',
        },
      }),
    );
    await joined1P;

    const peer2Ws = trackSocket(
      new WebSocket(`${wsUrl}/ws?traceId=reap-peer-2`),
    );
    await new Promise((r) => peer2Ws.once('open', r));
    const joined2P = waitForMessage(peer2Ws, (m) => m.type === 'joined');
    peer2Ws.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: code,
          displayName: 'Participant B',
          token: 'token-b',
        },
      }),
    );
    const joined2 = await joined2P;
    const peer2Id = (joined2.payload as { selfId: string }).selfId;

    // CHAOS: Peer 2 abruptly disconnects
    const peerLeftP = waitForMessage(
      peer1Ws,
      (m) =>
        m.type === 'peer.left' &&
        (m.payload as { peerId: string }).peerId === peer2Id,
    );
    peer2Ws.terminate();

    // After 200ms reclaim timeout expires, peer 1 should receive peer.left
    const peerLeft = await peerLeftP;
    expect((peerLeft.payload as { peerId: string }).peerId).toBe(peer2Id);
  });

  it('handles network partition chaos with simultaneous drops and concurrent reconnects', async () => {
    instance = buildSignalingApp({ logger: false, reclaimSlotMs: 5000 });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace(/^http/, 'ws');

    const roomRes = await fetch(`${address}/rooms`, { method: 'POST' });
    const { code } = (await roomRes.json()) as { code: string };

    const clientCount = 4;
    const clients: WebSocket[] = [];
    const clientSelfIds: string[] = [];

    // Connect 4 clients
    for (let i = 0; i < clientCount; i++) {
      const ws = trackSocket(
        new WebSocket(`${wsUrl}/ws?traceId=partition-${i}`),
      );
      await new Promise((r) => ws.once('open', r));
      const joinedP = waitForMessage(ws, (m) => m.type === 'joined');
      ws.send(
        JSON.stringify({
          v: 1,
          type: 'join',
          payload: {
            roomCode: code,
            displayName: `Participant ${i + 1}`,
            token: `token-${i}`,
          },
        }),
      );
      const joined = await joinedP;
      clientSelfIds.push((joined.payload as { selfId: string }).selfId);
      clients.push(ws);
    }

    // CHAOS: Partition drops 2 clients simultaneously
    clients[2]!.terminate();
    clients[3]!.terminate();

    await new Promise((r) => setTimeout(r, 60));

    // RECOVERY: Partitioned clients reconnect concurrently using their retained selfIds
    const reconnectedClient1 = trackSocket(
      new WebSocket(`${wsUrl}/ws?traceId=reconnect-2`),
    );
    const reconnectedClient2 = trackSocket(
      new WebSocket(`${wsUrl}/ws?traceId=reconnect-3`),
    );
    await Promise.all([
      new Promise((r) => reconnectedClient1.once('open', r)),
      new Promise((r) => reconnectedClient2.once('open', r)),
    ]);

    const rejoinP1 = waitForMessage(
      reconnectedClient1,
      (m) => m.type === 'joined',
    );
    const rejoinP2 = waitForMessage(
      reconnectedClient2,
      (m) => m.type === 'joined',
    );

    reconnectedClient1.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: code,
          displayName: 'Participant 3 (Restored)',
          token: 'token-2',
          selfId: clientSelfIds[2],
        },
      }),
    );

    reconnectedClient2.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: code,
          displayName: 'Participant 4 (Restored)',
          token: 'token-3',
          selfId: clientSelfIds[3],
        },
      }),
    );

    const [j1, j2] = await Promise.all([rejoinP1, rejoinP2]);
    expect((j1.payload as { selfId: string }).selfId).toBe(clientSelfIds[2]);
    expect((j2.payload as { selfId: string }).selfId).toBe(clientSelfIds[3]);
  });

  it('exposes Prometheus metrics endpoint with live room and connection counts for HPA', async () => {
    instance = buildSignalingApp({ logger: false });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });

    // Initial scrape: 0 active rooms
    const scrape1 = await fetch(`${address}/metrics/prometheus`);
    expect(scrape1.status).toBe(200);
    const body1 = await scrape1.text();
    expect(body1).toContain('meetit_signaling_up 1');
    expect(body1).toContain('meetit_signaling_rooms_active 0');
    expect(body1).toContain('meetit_signaling_connections_active 0');

    // Create room and join participant
    const roomRes = await fetch(`${address}/rooms`, { method: 'POST' });
    const { code } = (await roomRes.json()) as { code: string };

    const wsUrl = address.replace(/^http/, 'ws');
    const ws = trackSocket(new WebSocket(`${wsUrl}/ws?traceId=metrics-test`));
    await new Promise((r) => ws.once('open', r));

    const joinedP = waitForMessage(ws, (m) => m.type === 'joined');
    ws.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode: code,
          displayName: 'Metric Probe',
          token: 'guest-token',
        },
      }),
    );
    await joinedP;

    // Second scrape: 1 active room, 1 active connection, 1 participant
    const scrape2 = await fetch(`${address}/metrics/prometheus`);
    expect(scrape2.status).toBe(200);
    const body2 = await scrape2.text();
    expect(body2).toContain('meetit_signaling_rooms_active 1');
    expect(body2).toContain('meetit_signaling_connections_active 1');
    expect(body2).toContain('meetit_signaling_participants_active 1');
    expect(body2).toContain('meetit_signaling_process_cpu_user_seconds_total');
    expect(body2).toContain('meetit_signaling_process_memory_rss_bytes');
  });

  it('provides cascading multi-region failover route definitions on /regions', async () => {
    instance = buildSignalingApp({
      logger: false,
      livekitRegionalUrls: {
        'us-east': 'wss://us-east.meetit.livekit.cloud',
        'eu-central': 'wss://eu-central.meetit.livekit.cloud',
        'af-south': 'wss://af-south.meetit.livekit.cloud',
      },
    });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });

    const res = await fetch(`${address}/regions`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      regions: Array<{ id: string; cascadesTo?: string[] }>;
    };

    expect(data.regions.length).toBe(3);
    const usEast = data.regions.find((r) => r.id === 'us-east');
    expect(usEast).toBeDefined();
    expect(usEast?.cascadesTo).toContain('eu-central');
  });
});
