import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  generateRoomCode,
  type ServerJoinedPayload,
  type ServerMessage,
  type WebinarQaItem,
  type WebinarState,
} from '@meetit/protocol';
import { buildSignalingApp, type SignalingServerInstance } from './app.js';
import { Room } from './room.js';

function waitForMessage(
  ws: WebSocket,
  predicate: (msg: ServerMessage) => boolean,
  timeoutMs = 4000,
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

describe('Phase 7 Webinar & Broadcast Tests', () => {
  let instance: SignalingServerInstance | null = null;
  const sockets: WebSocket[] = [];

  const createSocket = (wsUrl: string): Promise<WebSocket> => {
    return new Promise((resolve) => {
      const ws = new WebSocket(wsUrl);
      sockets.push(ws);
      ws.on('open', () => resolve(ws));
    });
  };

  afterEach(async () => {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
    sockets.length = 0;
    if (instance) {
      await instance.app.close();
      instance = null;
    }
  });

  it('handles webinar practice mode, green room, and Go Live broadcast', async () => {
    instance = buildSignalingApp({ logger: false });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace('http', 'ws');
    const roomCode = generateRoomCode();

    const room = instance.roomManager.createRoom({
      code: roomCode,
      webinar: {
        enabled: true,
        practiceMode: true,
        isLive: false,
      },
    });

    const hostWs = await createSocket(wsUrl);
    const viewerWs = await createSocket(wsUrl);

    // Host joins first
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode,
          displayName: 'Webinar Host',
          token: 'guest-host',
          capabilities: [],
        },
      }),
    );

    const hostJoined = (await waitForMessage(
      hostWs,
      (m) => m.type === 'joined',
    )) as ServerMessage & { payload: ServerJoinedPayload };
    expect(hostJoined.payload.role).toBe('host');
    expect(hostJoined.payload.roomState.webinar?.practiceMode).toBe(true);
    expect(hostJoined.payload.roomState.webinar?.isLive).toBe(false);

    // Viewer joins webinar
    viewerWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode,
          displayName: 'Viewer Alice',
          token: 'guest-viewer',
          capabilities: [],
          requestedRole: 'viewer',
        },
      }),
    );

    const viewerJoined = (await waitForMessage(
      viewerWs,
      (m) => m.type === 'joined',
    )) as ServerMessage & { payload: ServerJoinedPayload };
    expect(viewerJoined.payload.role).toBe('viewer');
    expect(viewerJoined.payload.roomState.webinar?.practiceMode).toBe(true);

    // Viewer tries to unmute/turn on video -> server forces false for subscribe-only viewer
    viewerWs.send(
      JSON.stringify({
        v: 1,
        type: 'state.update',
        payload: {
          audio: true,
          video: true,
          screen: true,
          handRaised: false,
        },
      }),
    );

    const viewerPeer = room.getPeer(viewerJoined.payload.selfId);
    expect(viewerPeer?.state.audio).toBe(false);
    expect(viewerPeer?.state.video).toBe(false);
    expect(viewerPeer?.state.screen).toBe(false);

    // Host triggers Go Live
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: {
          action: 'webinar_go_live',
        },
      }),
    );

    const viewerWebinarState = (await waitForMessage(
      viewerWs,
      (m) => m.type === 'webinar.state',
    )) as ServerMessage & { payload: WebinarState };
    expect(viewerWebinarState.payload.isLive).toBe(true);
    expect(viewerWebinarState.payload.practiceMode).toBe(false);
    expect(viewerWebinarState.payload.startedAt).toBeDefined();

    // Host ends webinar
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: {
          action: 'webinar_end_live',
        },
      }),
    );

    const endedState = (await waitForMessage(
      viewerWs,
      (m) => m.type === 'webinar.state',
    )) as ServerMessage & { payload: WebinarState };
    expect(endedState.payload.isLive).toBe(false);
    expect(endedState.payload.endedAt).toBeDefined();
  });

  it('moderates audience Q&A workflow with ask, upvote, and approve/answer', async () => {
    instance = buildSignalingApp({ logger: false });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace('http', 'ws');
    const roomCode = generateRoomCode();

    instance.roomManager.createRoom({
      code: roomCode,
      webinar: { enabled: true, practiceMode: false, isLive: true },
    });

    const hostWs = await createSocket(wsUrl);
    const viewerWs = await createSocket(wsUrl);

    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode,
          displayName: 'Moderator',
          token: 'guest-mod',
          capabilities: [],
        },
      }),
    );
    await waitForMessage(hostWs, (m) => m.type === 'joined');

    viewerWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode,
          displayName: 'Audience Bob',
          token: 'guest-bob',
          capabilities: [],
        },
      }),
    );
    await waitForMessage(viewerWs, (m) => m.type === 'joined');

    // Viewer asks question
    viewerWs.send(
      JSON.stringify({
        v: 1,
        type: 'webinar.qa_ask',
        payload: {
          question: 'What is the roadmap for Phase 8?',
        },
      }),
    );

    const modQaUpdate = (await waitForMessage(
      hostWs,
      (m) => m.type === 'webinar.qa_updated',
    )) as ServerMessage & { payload: { question: WebinarQaItem } };
    expect(modQaUpdate.payload.question.question).toBe(
      'What is the roadmap for Phase 8?',
    );
    expect(modQaUpdate.payload.question.status).toBe('pending');
    const questionId = modQaUpdate.payload.question.id;

    // Upvote question
    viewerWs.send(
      JSON.stringify({
        v: 1,
        type: 'webinar.qa_upvote',
        payload: {
          questionId,
        },
      }),
    );

    const upvoted = (await waitForMessage(
      hostWs,
      (m) => m.type === 'webinar.qa_updated',
    )) as ServerMessage & { payload: { question: WebinarQaItem } };
    expect(upvoted.payload.question.upvotes.length).toBe(1);

    // Host answers question
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: {
          action: 'webinar_qa_moderate',
          questionId,
          status: 'answered',
          answer: 'AI agents and real-time meeting transcription!',
        },
      }),
    );

    const answered = (await waitForMessage(
      viewerWs,
      (m) =>
        m.type === 'webinar.qa_updated' &&
        (m.payload as { question: WebinarQaItem }).question.status ===
          'answered',
    )) as ServerMessage & { payload: { question: WebinarQaItem } };
    expect(answered.payload.question.status).toBe('answered');
    expect(answered.payload.question.answer).toBe(
      'AI agents and real-time meeting transcription!',
    );
  });

  it('manages RTMP and HLS live stream out controls and simulive sync', async () => {
    instance = buildSignalingApp({ logger: false });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace('http', 'ws');
    const roomCode = generateRoomCode();

    instance.roomManager.createRoom({
      code: roomCode,
      webinar: { enabled: true },
    });

    const hostWs = await createSocket(wsUrl);
    const viewerWs = await createSocket(wsUrl);

    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode,
          displayName: 'Stream Host',
          token: 'guest-stream',
          capabilities: [],
        },
      }),
    );
    await waitForMessage(hostWs, (m) => m.type === 'joined');

    viewerWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode,
          displayName: 'Viewer Charlie',
          token: 'guest-charlie',
          capabilities: [],
        },
      }),
    );
    await waitForMessage(viewerWs, (m) => m.type === 'joined');

    // Host starts RTMP/HLS egress
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: {
          action: 'webinar_stream_start',
          rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
          streamKey: 'secret-key-123',
          hlsUrl: `https://live.meetit.live/hls/${roomCode}/master.m3u8`,
        },
      }),
    );

    const streamMsg = await waitForMessage(
      viewerWs,
      (m) => m.type === 'webinar.stream_updated',
    );
    expect((streamMsg.payload as { status: string }).status).toBe('live');
    expect((streamMsg.payload as { hlsUrl: string }).hlsUrl).toContain(
      roomCode,
    );

    // Host syncs simulive playback
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: {
          action: 'webinar_simulive_sync',
          positionSec: 145,
          playing: true,
        },
      }),
    );

    const simuliveMsg = await waitForMessage(
      viewerWs,
      (m) => m.type === 'webinar.simulive_updated',
    );
    expect(
      (simuliveMsg.payload as { currentPositionSec: number })
        .currentPositionSec,
    ).toBe(145);
    expect((simuliveMsg.payload as { playing: boolean }).playing).toBe(true);

    // Stop stream
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: {
          action: 'webinar_stream_stop',
        },
      }),
    );
    const stoppedStream = await waitForMessage(
      viewerWs,
      (m) => m.type === 'webinar.stream_updated',
    );
    expect((stoppedStream.payload as { status: string }).status).toBe('idle');
  });

  it('manages webinar registration, verification and analytics REST endpoints', async () => {
    instance = buildSignalingApp({ logger: false });
    const roomCode = generateRoomCode();

    // 1. Register attendee via REST API
    const regRes = await instance.app.inject({
      method: 'POST',
      url: `/api/webinars/${roomCode}/register`,
      payload: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        role: 'viewer',
        paymentProvider: 'paystack',
        paymentStatus: 'paid',
        ticketPrice: 25,
        currency: 'USD',
        transactionRef: 'pstk_tx_998877',
      },
    });

    expect(regRes.statusCode).toBe(200);
    const regJson = regRes.json();
    expect(regJson.success).toBe(true);
    expect(regJson.joinToken).toMatch(/^wb_/);
    expect(regJson.registration.paid).toBe(true);
    expect(regJson.registration.ticketPriceCents).toBe(2500);

    // 2. Verify registration token
    const verifyRes = await instance.app.inject({
      method: 'GET',
      url: `/api/webinars/${roomCode}/verify?token=${regJson.joinToken}`,
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().valid).toBe(true);
    expect(verifyRes.json().registration.email).toBe('jane@example.com');

    // 3. List registrations
    const listRes = await instance.app.inject({
      method: 'GET',
      url: `/api/webinars/${roomCode}/registrations`,
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().registrations.length).toBe(1);

    // 4. Analytics report endpoint
    const analyticsRes = await instance.app.inject({
      method: 'GET',
      url: `/api/webinars/${roomCode}/analytics`,
    });
    expect(analyticsRes.statusCode).toBe(200);
    expect(analyticsRes.json().report).toBeDefined();
  });

  it('handles high-scale 1,000 viewer simulation smoothly without latency spikes', () => {
    const roomCode = generateRoomCode();
    const room = new Room(roomCode, {
      webinar: {
        enabled: true,
        maxViewers: 2000,
      },
    });

    const startTime = performance.now();
    const mockSockets: Array<{
      readyState: number;
      send: (s: string) => void;
      close: () => void;
    }> = [];

    // Register and join 1,000 viewers
    for (let i = 0; i < 1000; i++) {
      const mockWs = {
        readyState: 1,
        send: () => {},
        close: () => {},
      };
      mockSockets.push(mockWs);

      const res = room.joinPeer({
        socket: mockWs as unknown as WebSocket,
        displayName: `Attendee ${i + 1}`,
        tokenFingerprint: `fp-${i}`,
        requestedRole: 'viewer',
      });

      expect(res.ok).toBe(true);
      if (res.ok && res.status === 'joined') {
        expect(res.peer.role).toBe('viewer');
        expect(res.peer.state.audio).toBe(false);
      }
    }

    const elapsedMs = performance.now() - startTime;
    expect(room.participantCount).toBe(1000);
    expect(room.peakViewers).toBe(1000);
    // Joining 1,000 simulated viewers in-memory without O(N^2) flood should take less than 500ms
    expect(elapsedMs).toBeLessThan(500);

    // Verify analytics aggregation
    const report = room.getAttendeeAnalyticsReport();
    expect(report.length).toBe(1000);
    expect(report[0]?.engagementScore).toBeGreaterThanOrEqual(50);
  });
});
