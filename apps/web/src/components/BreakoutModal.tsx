import React, { useState } from 'react';
import type { BreakoutRoom, BreakoutState, PeerInfo } from '@meetit/protocol';
import {
  Users,
  X,
  Play,
  Radio,
  LogOut,
  ArrowRight,
  Clock,
  AlertCircle,
} from 'lucide-react';

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
      className="app-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="breakout-modal-title"
      onClick={onClose}
    >
      <div
        className="app-modal-dialog wide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="app-modal-header">
          <div className="app-modal-title-group">
            <div className="app-modal-icon">
              <Users size={20} />
            </div>
            <div>
              <h2 id="breakout-modal-title" className="app-modal-title">
                Breakout Rooms
              </h2>
              <p className="app-modal-subtitle">
                {breakoutState.active
                  ? 'Breakout session is currently in progress'
                  : 'Split participants into smaller focused discussion groups'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="app-modal-close"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="app-modal-body">
          {/* Participant view if breakout is active and not host */}
          {!isHost && breakoutState.active && (
            <div
              className="panel-card"
              style={{ textAlign: 'center', padding: '24px' }}
            >
              {myAssignedRoom ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                    You are assigned to
                  </span>
                  <strong style={{ fontSize: '20px', color: 'var(--ink)' }}>
                    {myAssignedRoom.name}
                  </strong>
                  <div
                    style={{ display: 'flex', gap: '10px', marginTop: '8px' }}
                  >
                    <button
                      type="button"
                      onClick={() => onJoinRoom(myAssignedRoom.id)}
                      className="panel-btn-primary"
                    >
                      <ArrowRight size={16} />
                      Join {myAssignedRoom.name}
                    </button>
                    <button
                      type="button"
                      onClick={onLeaveRoom}
                      className="panel-btn-secondary"
                    >
                      <LogOut size={16} />
                      Main Room
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    color: 'var(--muted)',
                  }}
                >
                  <Clock size={18} />
                  <span>
                    You are currently in the main room. The host will assign you
                    shortly.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Host Management Controls */}
          {isHost && (
            <>
              {!breakoutState.active ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '14px',
                    }}
                  >
                    <div className="panel-form-group">
                      <label htmlFor="breakout-room-count">
                        Number of Rooms
                      </label>
                      <input
                        id="breakout-room-count"
                        type="number"
                        min={1}
                        max={20}
                        value={roomCount}
                        onChange={(e) =>
                          setRoomCount(parseInt(e.target.value) || 2)
                        }
                        className="panel-input"
                      />
                    </div>
                    <div className="panel-form-group">
                      <label htmlFor="breakout-duration">
                        Duration (Minutes)
                      </label>
                      <input
                        id="breakout-duration"
                        type="number"
                        min={1}
                        max={180}
                        value={durationMinutes}
                        onChange={(e) =>
                          setDurationMinutes(parseInt(e.target.value) || 15)
                        }
                        className="panel-input"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAutoAssign}
                    className="panel-btn-secondary"
                    style={{ width: '100%' }}
                  >
                    <Users size={16} />
                    Auto-Assign Participants ({peers.length} peers in call)
                  </button>

                  {/* Rooms Preview & Manual assignment */}
                  {activeRooms.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: 'var(--muted)',
                        }}
                      >
                        Rooms Configuration ({activeRooms.length} rooms)
                      </span>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'repeat(auto-fit, minmax(220px, 1fr))',
                          gap: '10px',
                          maxHeight: '240px',
                          overflowY: 'auto',
                        }}
                      >
                        {activeRooms.map((room) => (
                          <div
                            key={room.id}
                            className="panel-card"
                            style={{ padding: '12px' }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <strong style={{ fontSize: '13.5px' }}>
                                {room.name}
                              </strong>
                              <span className="panel-badge muted">
                                {room.peerIds.length} peers
                              </span>
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '4px',
                                marginTop: '6px',
                              }}
                            >
                              {room.peerIds.map((pid) => {
                                const p = peers.find((x) => x.id === pid);
                                return (
                                  <span
                                    key={pid}
                                    className="panel-badge muted"
                                    style={{ fontSize: '11px' }}
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
                        className="panel-btn-primary"
                        style={{
                          width: '100%',
                          padding: '12px',
                          marginTop: '6px',
                        }}
                      >
                        <Play size={16} />
                        Open Breakout Rooms Now
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Active Breakout Host Controls */
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                  }}
                >
                  <div
                    className="panel-card"
                    style={{
                      background: 'rgba(34, 197, 94, 0.08)',
                      borderColor: 'rgba(34, 197, 94, 0.3)',
                      display: 'flex',
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span className="panel-badge active">Active</span>
                        <strong style={{ color: 'var(--ink)' }}>
                          Session in Progress
                        </strong>
                      </div>
                      <p
                        style={{
                          margin: '4px 0 0',
                          fontSize: '12.5px',
                          color: 'var(--muted)',
                        }}
                      >
                        {activeRooms.length} rooms running. Participants are
                        isolated in their groups.
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => onRecallBreakout(recallNotice)}
                        className="panel-btn-secondary"
                        style={{ fontSize: '12.5px' }}
                      >
                        <Clock size={14} />
                        Recall All ({recallNotice}s notice)
                      </button>
                      <button
                        type="button"
                        onClick={onEndBreakout}
                        className="panel-btn-danger"
                      >
                        Close Rooms Now
                      </button>
                    </div>
                  </div>

                  {/* Broadcast announcement */}
                  <form
                    onSubmit={handleBroadcast}
                    className="panel-card"
                    style={{ gap: '8px' }}
                  >
                    <label
                      htmlFor="broadcast-message-input"
                      style={{
                        fontSize: '12.5px',
                        fontWeight: 600,
                        color: 'var(--ink)',
                      }}
                    >
                      Broadcast Announcement to All Breakout Rooms
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        id="broadcast-message-input"
                        type="text"
                        placeholder="e.g. Wrap up your discussions in 2 minutes..."
                        value={broadcastDraft}
                        onChange={(e) => setBroadcastDraft(e.target.value)}
                        className="panel-input"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="submit"
                        disabled={!broadcastDraft.trim()}
                        className="panel-btn-primary"
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        <Radio size={14} />
                        Broadcast
                      </button>
                    </div>
                  </form>

                  {/* Active rooms list with option to visit / reassign */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--muted)',
                      }}
                    >
                      Active Rooms ({activeRooms.length})
                    </span>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '10px',
                        maxHeight: '240px',
                        overflowY: 'auto',
                      }}
                    >
                      {activeRooms.map((r) => (
                        <div
                          key={r.id}
                          className="panel-card"
                          style={{ padding: '12px' }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <strong style={{ fontSize: '13.5px' }}>
                              {r.name}
                            </strong>
                            <button
                              type="button"
                              onClick={() => onJoinRoom(r.id)}
                              className="panel-btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                            >
                              Join
                            </button>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '4px',
                              marginTop: '6px',
                            }}
                          >
                            {r.peerIds.map((pid) => {
                              const p = peers.find((x) => x.id === pid);
                              return (
                                <span
                                  key={pid}
                                  className="panel-badge muted"
                                  style={{ fontSize: '11px' }}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
