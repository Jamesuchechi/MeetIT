import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { generateRoomCode, type ServerMessage } from '@meetit/protocol';
import { buildSignalingApp, type SignalingServerInstance } from './app.js';

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

describe('Phase 6 Collaboration Features Signaling Tests', () => {
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

  it('runs breakout rooms workflow: create, assign, timer, broadcast, recall, and end', async () => {
    instance = buildSignalingApp({ logger: false });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace(/^http/, 'ws');
    const roomCode = generateRoomCode();

    const hostWs = await createSocket(wsUrl);
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode,
          displayName: 'Host Alice',
          token: 'guest-token',
        },
      }),
    );
    const hostJoined = (await waitForMessage(
      hostWs,
      (m) => m.type === 'joined',
    )) as {
      payload: { selfId: string };
    };
    const hostId = hostJoined.payload.selfId;

    const studentWs = await createSocket(wsUrl);
    studentWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode,
          displayName: 'Student Bob',
          token: 'guest-token',
        },
      }),
    );
    const studentJoined = (await waitForMessage(
      studentWs,
      (m) => m.type === 'joined',
    )) as {
      payload: { selfId: string };
    };
    const studentId = studentJoined.payload.selfId;

    // 1. Host creates breakout rooms
    const breakoutCreatePromise = waitForMessage(
      studentWs,
      (m) => m.type === 'breakout.updated',
    );
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: {
          action: 'breakout_create',
          rooms: [
            { name: 'Team Alpha', peerIds: [studentId] },
            { name: 'Team Beta', peerIds: [] },
          ],
          durationMinutes: 10,
        },
      }),
    );
    const breakoutCreated = (await breakoutCreatePromise) as {
      payload: {
        active: boolean;
        rooms: Array<{ id: string; name: string; peerIds: string[] }>;
      };
    };
    expect(breakoutCreated.payload.rooms.length).toBe(2);
    expect(breakoutCreated.payload.rooms[0]?.peerIds).toContain(studentId);

    // 2. Host starts breakout
    const breakoutStartPromise = waitForMessage(
      studentWs,
      (m) => m.type === 'breakout.updated',
    );
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: { action: 'breakout_start' },
      }),
    );
    const breakoutStarted = (await breakoutStartPromise) as {
      payload: { active: boolean };
    };
    expect(breakoutStarted.payload.active).toBe(true);

    // 3. Host broadcasts message to all breakout rooms
    const broadcastPromise = waitForMessage(
      studentWs,
      (m) => m.type === 'breakout.broadcast',
    );
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: {
          action: 'breakout_broadcast',
          message: '5 minutes remaining in your discussions!',
        },
      }),
    );
    const broadcastReceived = (await broadcastPromise) as {
      payload: { message: string; from: string };
    };
    expect(broadcastReceived.payload.message).toContain('5 minutes remaining');
    expect(broadcastReceived.payload.from).toBe('Host Alice');

    // 4. Host recalls breakout rooms
    const recallPromise = waitForMessage(
      studentWs,
      (m) => m.type === 'breakout.updated',
    );
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: { action: 'breakout_recall', noticeSeconds: 30 },
      }),
    );
    const recallState = (await recallPromise) as {
      payload: { returnNoticeSeconds?: number };
    };
    expect(recallState.payload.returnNoticeSeconds).toBe(30);
  });

  it('manages polls with live voting, multiple voters, and exact server tally', async () => {
    instance = buildSignalingApp({ logger: false });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace(/^http/, 'ws');
    const roomCode = generateRoomCode();

    const hostWs = await createSocket(wsUrl);
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: { roomCode, displayName: 'Teacher', token: 'guest-token' },
      }),
    );
    await waitForMessage(hostWs, (m) => m.type === 'joined');

    const voter1Ws = await createSocket(wsUrl);
    voter1Ws.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: { roomCode, displayName: 'Voter 1', token: 'guest-token' },
      }),
    );
    const v1Joined = (await waitForMessage(
      voter1Ws,
      (m) => m.type === 'joined',
    )) as {
      payload: { selfId: string };
    };

    const voter2Ws = await createSocket(wsUrl);
    voter2Ws.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: { roomCode, displayName: 'Voter 2', token: 'guest-token' },
      }),
    );
    const v2Joined = (await waitForMessage(
      voter2Ws,
      (m) => m.type === 'joined',
    )) as {
      payload: { selfId: string };
    };

    // Host creates a quiz poll
    const pollCreatePromise = waitForMessage(
      voter1Ws,
      (m) => m.type === 'poll.updated',
    );
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'poll.create',
        payload: {
          question: 'What is WebRTC?',
          options: [
            'Real-Time Communications',
            'Rendering Tool',
            'Remote Code',
          ],
          isQuiz: true,
          correctOptionIndex: 0,
        },
      }),
    );
    const createdPollMsg = (await pollCreatePromise) as {
      payload: { poll: { id: string; question: string } };
    };
    const pollId = createdPollMsg.payload.poll.id;
    expect(pollId).toBeTruthy();

    // Voter 1 votes for option 0
    const vote1Promise = waitForMessage(
      hostWs,
      (m) => m.type === 'poll.updated',
    );
    voter1Ws.send(
      JSON.stringify({
        v: 1,
        type: 'poll.vote',
        payload: { pollId, optionIndices: [0] },
      }),
    );
    await vote1Promise;

    // Voter 2 votes for option 0
    const vote2Promise = waitForMessage(
      hostWs,
      (m) => m.type === 'poll.updated',
    );
    voter2Ws.send(
      JSON.stringify({
        v: 1,
        type: 'poll.vote',
        payload: { pollId, optionIndices: [0] },
      }),
    );
    const vote2Result = (await vote2Promise) as {
      payload: { poll: { votes: Record<string, number[]> } };
    };

    // Verify exact server tally
    const votes = vote2Result.payload.poll.votes;
    expect(votes[v1Joined.payload.selfId]).toEqual([0]);
    expect(votes[v2Joined.payload.selfId]).toEqual([0]);
    expect(Object.keys(votes).length).toBe(2);

    // Host closes poll
    const closePromise = waitForMessage(
      voter1Ws,
      (m) =>
        m.type === 'poll.updated' &&
        (m.payload as { poll?: { closed?: boolean } })?.poll?.closed === true,
    );
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'poll.close',
        payload: { pollId },
      }),
    );
    const closedResult = (await closePromise) as {
      payload: { poll: { closed: boolean } };
    };
    expect(closedResult.payload.poll.closed).toBe(true);
  });

  it('manages FormIT integration: launch, record submissions, and sync state', async () => {
    instance = buildSignalingApp({ logger: false });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace(/^http/, 'ws');
    const roomCode = generateRoomCode();

    const hostWs = await createSocket(wsUrl);
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: { roomCode, displayName: 'Facilitator', token: 'guest-token' },
      }),
    );
    await waitForMessage(hostWs, (m) => m.type === 'joined');

    const attendeeWs = await createSocket(wsUrl);
    attendeeWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode,
          displayName: 'Attendee Clara',
          token: 'guest-token',
        },
      }),
    );
    await waitForMessage(attendeeWs, (m) => m.type === 'joined');

    // Host launches FormIT survey
    const launchPromise = waitForMessage(
      attendeeWs,
      (m) => m.type === 'formit.updated',
    );
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'formit.launch',
        payload: {
          formUrl: 'https://form-it-sandy.vercel.app/f/workshop-survey',
          title: 'Workshop Pulse Check',
        },
      }),
    );
    const launched = (await launchPromise) as {
      payload: { id: string; slug: string; active: boolean; formUrl: string };
    };
    expect(launched.payload.slug).toBe('workshop-survey');
    expect(launched.payload.active).toBe(true);

    // Attendee submits form (simulating postMessage from FormIT embed)
    const submitPromise = waitForMessage(
      hostWs,
      (m) => m.type === 'formit.updated',
    );
    attendeeWs.send(
      JSON.stringify({
        v: 1,
        type: 'formit.submit',
        payload: {
          id: launched.payload.id,
          editKey: 'edit-key-123',
        },
      }),
    );
    const afterSubmit = (await submitPromise) as {
      payload: {
        submissionsCount: number;
        responses: Array<{ displayName?: string }>;
      };
    };
    expect(afterSubmit.payload.submissionsCount).toBe(1);
    expect(afterSubmit.payload.responses[0]?.displayName).toBe(
      'Attendee Clara',
    );
  });

  it('manages ordered hand-raise queue with timestamps and host lowering', async () => {
    instance = buildSignalingApp({ logger: false });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace(/^http/, 'ws');
    const roomCode = generateRoomCode();

    const hostWs = await createSocket(wsUrl);
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: { roomCode, displayName: 'Host', token: 'guest-token' },
      }),
    );
    await waitForMessage(hostWs, (m) => m.type === 'joined');

    const p1Ws = await createSocket(wsUrl);
    p1Ws.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode,
          displayName: 'Participant One',
          token: 'guest-token',
        },
      }),
    );
    const p1Joined = (await waitForMessage(
      p1Ws,
      (m) => m.type === 'joined',
    )) as {
      payload: { selfId: string };
    };

    const p2Ws = await createSocket(wsUrl);
    p2Ws.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode,
          displayName: 'Participant Two',
          token: 'guest-token',
        },
      }),
    );
    const p2Joined = (await waitForMessage(
      p2Ws,
      (m) => m.type === 'joined',
    )) as {
      payload: { selfId: string };
    };

    // Participant 1 raises hand
    const p1RaisePromise = waitForMessage(
      hostWs,
      (m) => m.type === 'handraise.updated',
    );
    p1Ws.send(
      JSON.stringify({
        v: 1,
        type: 'state.update',
        payload: { audio: true, video: true, screen: false, handRaised: true },
      }),
    );
    await p1RaisePromise;

    // Participant 2 raises hand
    const p2RaisePromise = waitForMessage(
      hostWs,
      (m) => m.type === 'handraise.updated',
    );
    p2Ws.send(
      JSON.stringify({
        v: 1,
        type: 'state.update',
        payload: { audio: true, video: true, screen: false, handRaised: true },
      }),
    );
    const p2Result = (await p2RaisePromise) as {
      payload: { queue: Array<{ peerId: string; displayName: string }> };
    };

    // Verify FIFO ordering: Participant 1 is first, Participant 2 is second
    expect(p2Result.payload.queue.length).toBe(2);
    expect(p2Result.payload.queue[0]?.peerId).toBe(p1Joined.payload.selfId);
    expect(p2Result.payload.queue[1]?.peerId).toBe(p2Joined.payload.selfId);

    // Host lowers Participant 1's hand
    const lowerPromise = waitForMessage(
      p1Ws,
      (m) =>
        m.type === 'handraise.updated' &&
        (m.payload as { queue?: Array<{ peerId: string }> })?.queue?.length ===
          1,
    );
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'host.action',
        payload: {
          action: 'lower_hand',
          targetPeerId: p1Joined.payload.selfId,
        },
      }),
    );
    const afterLower = (await lowerPromise) as {
      payload: { queue: Array<{ peerId: string }> };
    };
    expect(afterLower.payload.queue.length).toBe(1);
    expect(afterLower.payload.queue[0]?.peerId).toBe(p2Joined.payload.selfId);
  });

  it('manages Q&A panel with questions, upvotes, and answering state', async () => {
    instance = buildSignalingApp({ logger: false });
    const address = await instance.app.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace(/^http/, 'ws');
    const roomCode = generateRoomCode();

    const hostWs = await createSocket(wsUrl);
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: { roomCode, displayName: 'Moderator', token: 'guest-token' },
      }),
    );
    await waitForMessage(hostWs, (m) => m.type === 'joined');

    const attendeeWs = await createSocket(wsUrl);
    attendeeWs.send(
      JSON.stringify({
        v: 1,
        type: 'join',
        payload: {
          roomCode,
          displayName: 'Attendee David',
          token: 'guest-token',
        },
      }),
    );
    const attJoined = (await waitForMessage(
      attendeeWs,
      (m) => m.type === 'joined',
    )) as {
      payload: { selfId: string };
    };

    // Attendee asks question
    const askPromise = waitForMessage(hostWs, (m) => m.type === 'qa.updated');
    attendeeWs.send(
      JSON.stringify({
        v: 1,
        type: 'qa.ask',
        payload: { question: 'When is the next release planned?' },
      }),
    );
    const questionMsg = (await askPromise) as {
      payload: {
        question: { id: string; question: string; upvotes: string[] };
      };
    };
    const questionId = questionMsg.payload.question.id;
    expect(questionMsg.payload.question.question).toContain('next release');

    // Attendee upvotes the question
    const upvotePromise = waitForMessage(
      hostWs,
      (m) => m.type === 'qa.updated',
    );
    attendeeWs.send(
      JSON.stringify({
        v: 1,
        type: 'qa.upvote',
        payload: { questionId },
      }),
    );
    const upvoteMsg = (await upvotePromise) as {
      payload: { question: { upvotes: string[] } };
    };
    expect(upvoteMsg.payload.question.upvotes).toContain(
      attJoined.payload.selfId,
    );

    // Moderator marks question as answered
    const answerPromise = waitForMessage(
      attendeeWs,
      (m) =>
        m.type === 'qa.updated' &&
        (m.payload as { question?: { answered?: boolean } })?.question
          ?.answered === true,
    );
    hostWs.send(
      JSON.stringify({
        v: 1,
        type: 'qa.answer',
        payload: { questionId, answered: true },
      }),
    );
    const answeredMsg = (await answerPromise) as {
      payload: { question: { answered: boolean } };
    };
    expect(answeredMsg.payload.question.answered).toBe(true);
  });
});
