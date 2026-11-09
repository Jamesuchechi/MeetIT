import React, { useState } from 'react';
import type { BreakoutRoom, BreakoutState, PeerInfo } from '@meetit/protocol';

interface BreakoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  isHost: boolean;
  selfId: string;
  peers: PeerInfo[];
  breakoutState: BreakoutState;
  onStartBreakout: () => void;
  onCreateRooms: (
    rooms: Array<{ name: string; peerIds?: string[] }>,
    durationMinutes?: number,
  ) => void;
  onAssignPeer: (roomId: string, peerId: string) => void;
  onBroadcastMessage: (message: string) => void;
  onRecallBreakout: (noticeSeconds?: number) => void;
  onEndBreakout: () => void;
  onJoinRoom: (roomId: string) => void;
  onLeaveRoom: () => void;
}

export function BreakoutModal({
  isOpen,
  onClose,
  isHost,
  selfId,
  peers,
  breakoutState,
  onStartBreakout,
  onCreateRooms,
  onAssignPeer,
  onBroadcastMessage,
  onRecallBreakout,
  onEndBreakout,
  onJoinRoom,
  onLeaveRoom,
}: BreakoutModalProps) {
  if (!isOpen) return null;

  const [roomCount, setRoomCount] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [broadcastDraft, setBroadcastDraft] = useState('');
  const [recallNotice, setRecallNotice] = useState(30);

  const activeRooms = breakoutState.rooms || [];
  const myAssignedRoom = activeRooms.find((r) => r.peerIds.includes(selfId));

  const handleAutoAssign = () => {
    const allPeers = peers.map((p) => p.id);
    const count = Math.max(1, roomCount);
    const rooms: Array<{ name: string; peerIds: string[] }> = [];
    for (let i = 0; i < count; i++) {
      rooms.push({
        name: `Breakout Room ${i + 1}`,
        peerIds: [],
      });
    }
    allPeers.forEach((peerId, idx) => {
      const room = rooms[idx % count];
      if (room) {
        room.peerIds.push(peerId);
      }
    });
    onCreateRooms(rooms, durationMinutes);
  };

  const handleBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastDraft.trim()) return;
    onBroadcastMessage(broadcastDraft.trim());
    setBroadcastDraft('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="breakout-modal-title"
    >
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl text-neutral-100 p-6 flex flex-col gap-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 text-xl font-bold">
              👥
            </span>
            <div>
              <h2
                id="breakout-modal-title"
                className="text-xl font-bold text-white"
              >
                Breakout Rooms
              </h2>
              <p className="text-xs text-neutral-400">
                {breakoutState.active
                  ? 'Breakout session is currently in progress'
                  : 'Split participants into smaller focused discussion groups'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-2 rounded-lg hover:bg-neutral-800 transition"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Participant view if breakout is active and not host */}
        {!isHost && breakoutState.active && (
          <div className="flex flex-col gap-4 py-4">
            {myAssignedRoom ? (
              <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-xl text-center flex flex-col gap-2">
                <span className="text-sm font-medium text-indigo-300">
                  You are assigned to
                </span>
                <span className="text-2xl font-bold text-white">
                  {myAssignedRoom.name}
                </span>
                <div className="flex justify-center gap-3 mt-2">
                  <button
                    onClick={() => onJoinRoom(myAssignedRoom.id)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 font-semibold rounded-xl text-white shadow-md transition"
                  >
                    Join {myAssignedRoom.name}
                  </button>
                  <button
                    onClick={onLeaveRoom}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl transition"
                  >
                    Main Room
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-neutral-800/60 rounded-xl text-center text-neutral-300">
                You are currently in the main room. The host will assign you
                shortly.
              </div>
            )}
          </div>
        )}

        {/* Host Management Controls */}
        {isHost && (
          <div className="flex flex-col gap-6">
            {!breakoutState.active ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-400 mb-1">
                      Number of Rooms
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={roomCount}
                      onChange={(e) =>
                        setRoomCount(parseInt(e.target.value) || 2)
                      }
                      className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-400 mb-1">
                      Duration (Minutes)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={180}
                      value={durationMinutes}
                      onChange={(e) =>
                        setDurationMinutes(parseInt(e.target.value) || 15)
                      }
                      className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleAutoAssign}
                    className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 font-semibold rounded-xl text-neutral-200 border border-neutral-700 transition"
                  >
                    Auto-Assign Participants ({peers.length} peers)
                  </button>
                </div>

                {/* Rooms Preview & Manual assignment */}
                {activeRooms.length > 0 && (
                  <div className="flex flex-col gap-3 mt-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                      Rooms Configuration
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto">
                      {activeRooms.map((room) => (
                        <div
                          key={room.id}
                          className="p-3 bg-neutral-800/70 border border-neutral-700 rounded-xl flex flex-col gap-2"
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-white text-sm">
                              {room.name}
                            </span>
                            <span className="text-xs text-neutral-400 font-mono">
                              {room.peerIds.length} peers
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {room.peerIds.map((pid) => {
                              const p = peers.find((x) => x.id === pid);
                              return (
                                <span
                                  key={pid}
                                  className="text-xs bg-neutral-700 px-2 py-0.5 rounded-full text-neutral-200"
                                >
                                  {p ? p.displayName : pid.slice(0, 6)}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={onStartBreakout}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 font-bold rounded-xl text-white shadow-lg transition mt-2"
                    >
                      🚀 Open Breakout Rooms Now
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Active Breakout Host Controls */
              <div className="flex flex-col gap-5">
                <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-bold text-emerald-400">
                      Session Active
                    </span>
                    <p className="text-xs text-neutral-300">
                      {activeRooms.length} rooms running. Participants are
                      isolated in their groups.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onRecallBreakout(recallNotice)}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-xs font-bold rounded-lg text-white transition"
                    >
                      Recall All ({recallNotice}s notice)
                    </button>
                    <button
                      onClick={onEndBreakout}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-xs font-bold rounded-lg text-white transition"
                    >
                      Close Rooms Now
                    </button>
                  </div>
                </div>

                {/* Broadcast announcement */}
                <form
                  onSubmit={handleBroadcast}
                  className="flex flex-col gap-2"
                >
                  <label className="text-xs font-semibold text-neutral-400">
                    Broadcast Message to All Breakout Rooms
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Wrap up your discussions in 2 minutes..."
                      value={broadcastDraft}
                      onChange={(e) => setBroadcastDraft(e.target.value)}
                      className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={!broadcastDraft.trim()}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-semibold text-sm rounded-xl text-white transition"
                    >
                      Broadcast
                    </button>
                  </div>
                </form>

                {/* Active rooms list with option to visit / reassign */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                    Active Rooms ({activeRooms.length})
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto">
                    {activeRooms.map((r) => (
                      <div
                        key={r.id}
                        className="p-3 bg-neutral-800/80 border border-neutral-700 rounded-xl flex flex-col gap-2"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-white text-sm">
                            {r.name}
                          </span>
                          <button
                            onClick={() => onJoinRoom(r.id)}
                            className="text-xs px-2 py-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-lg transition"
                          >
                            Visit Room
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {r.peerIds.map((pid) => {
                            const p = peers.find((x) => x.id === pid);
                            return (
                              <span
                                key={pid}
                                className="text-xs bg-neutral-900 border border-neutral-700 px-2 py-0.5 rounded-full text-neutral-300"
                              >
                                {p ? p.displayName : pid.slice(0, 6)}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
