import React, { useEffect, useRef, useState } from 'react';
import type { WebinarSimulive } from '@meetit/protocol';

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
    <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-800 shadow-2xl flex flex-col group">
      {/* Simulive watermark badge */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/90 text-white text-xs font-bold shadow-lg backdrop-blur-sm">
        <span className="w-2 h-2 rounded-full bg-white animate-ping" />
        <span>SIMULIVE BROADCAST</span>
      </div>

      <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center">
        <video
          ref={videoRef}
          src={defaultVideoSrc}
          className="w-full h-full object-contain"
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
            className={`absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[2px] ${
              isHostOrModerator ? 'cursor-pointer' : ''
            }`}
          >
            <div className="w-16 h-16 rounded-full bg-indigo-600 text-white flex items-center justify-center text-2xl shadow-xl shadow-indigo-600/40">
              ▶
            </div>
          </div>
        )}
      </div>

      {/* Synchronized controls bar */}
      <div className="p-3.5 bg-slate-900 border-t border-slate-800 flex items-center gap-4 text-xs text-slate-300">
        {isHostOrModerator && (
          <button
            type="button"
            onClick={handleTogglePlay}
            className="w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center"
          >
            {isPlaying ? '❚❚' : '▶'}
          </button>
        )}

        <span className="font-mono text-slate-400">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          disabled={!isHostOrModerator}
          onChange={handleSeek}
          className="flex-1 accent-indigo-500 disabled:cursor-not-allowed cursor-pointer h-1.5 rounded-lg bg-slate-800"
        />

        {!isHostOrModerator && (
          <span className="text-[11px] text-slate-400 px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
            Synced with Host
          </span>
        )}
      </div>
    </div>
  );
};
