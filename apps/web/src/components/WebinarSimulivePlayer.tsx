import React, { useEffect, useRef, useState } from 'react';
import type { WebinarSimulive } from '@meetit/protocol';
import { Play, Pause, Tv } from 'lucide-react';

interface WebinarSimulivePlayerProps {
  simulive?: WebinarSimulive;
  isHostOrModerator: boolean;
  onSyncState?: (params: { positionSec: number; playing: boolean }) => void;
}

export const WebinarSimulivePlayer: React.FC<WebinarSimulivePlayerProps> = ({
  simulive,
  isHostOrModerator,
  onSyncState,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(simulive?.playing ?? false);
  const [currentTime, setCurrentTime] = useState(
    simulive?.currentPositionSec ?? 0,
  );
  const [duration, setDuration] = useState(simulive?.durationSeconds || 1800);

  // Sync incoming state from server
  useEffect(() => {
    if (!simulive) return;
    setIsPlaying(simulive.playing);
    if (simulive.durationSeconds) setDuration(simulive.durationSeconds);

    if (videoRef.current) {
      const diff = Math.abs(
        videoRef.current.currentTime - simulive.currentPositionSec,
      );
      if (diff > 2) {
        videoRef.current.currentTime = simulive.currentPositionSec;
      }
      if (simulive.playing && videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      } else if (!simulive.playing && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    }
    setCurrentTime(simulive.currentPositionSec);
  }, [simulive]);

  const handleTogglePlay = () => {
    if (!isHostOrModerator) return;
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);
    const pos = videoRef.current ? videoRef.current.currentTime : currentTime;
    onSyncState?.({ positionSec: Math.round(pos), playing: nextPlaying });
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isHostOrModerator) return;
    const newPos = Number(e.target.value);
    setCurrentTime(newPos);
    if (videoRef.current) {
      videoRef.current.currentTime = newPos;
    }
    onSyncState?.({ positionSec: newPos, playing: isPlaying });
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const defaultVideoSrc =
    simulive?.videoUrl ||
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: '16px',
        overflow: 'hidden',
        background: '#000000',
        border: '1px solid var(--line)',
        boxShadow: '0 20px 48px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Simulive watermark badge */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '999px',
          background: 'rgba(239, 68, 68, 0.9)',
          color: '#ffffff',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.04em',
        }}
      >
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#ffffff',
          }}
        />
        <span>SIMULIVE BROADCAST</span>
      </div>

      <div
        style={{
          position: 'relative',
          aspectRatio: '16 / 9',
          width: '100%',
          background: '#090d16',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <video
          ref={videoRef}
          src={defaultVideoSrc}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          playsInline
          onTimeUpdate={() => {
            if (videoRef.current) {
              setCurrentTime(videoRef.current.currentTime);
            }
          }}
          onLoadedMetadata={() => {
            if (videoRef.current && videoRef.current.duration) {
              setDuration(videoRef.current.duration);
            }
          }}
        />

        {/* Big play overlay if paused */}
        {!isPlaying && (
          <div
            onClick={isHostOrModerator ? handleTogglePlay : undefined}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.45)',
              cursor: isHostOrModerator ? 'pointer' : 'default',
            }}
          >
            <div
              className="panel-btn-primary"
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                padding: 0,
              }}
            >
              <Play size={24} style={{ marginLeft: '2px' }} />
            </div>
          </div>
        )}
      </div>

      {/* Synchronized controls bar */}
      <div
        style={{
          padding: '10px 14px',
          background: 'var(--surface)',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '12px',
          color: 'var(--ink)',
        }}
      >
        {isHostOrModerator && (
          <button
            type="button"
            onClick={handleTogglePlay}
            className="panel-btn-primary"
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '6px',
              padding: 0,
            }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
        )}

        <span
          style={{
            fontFamily: 'monospace',
            color: 'var(--muted)',
            fontSize: '11.5px',
          }}
        >
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          disabled={!isHostOrModerator}
          onChange={handleSeek}
          style={{
            flex: 1,
            cursor: isHostOrModerator ? 'pointer' : 'not-allowed',
          }}
        />

        {!isHostOrModerator && (
          <span className="panel-badge muted" style={{ fontSize: '10.5px' }}>
            Synced with Host
          </span>
        )}
      </div>
    </div>
  );
};
