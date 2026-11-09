import React, { useState } from 'react';
import type { WebinarStreamOut } from '@meetit/protocol';

interface WebinarStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  streamOut?: WebinarStreamOut | undefined;
  roomCode: string;
  onStartStream: (params: {
    rtmpUrl?: string;
    streamKey?: string;
    hlsUrl?: string;
  }) => void;
  onStopStream: () => void;
}

export const WebinarStreamModal: React.FC<WebinarStreamModalProps> = ({
  isOpen,
  onClose,
  streamOut,
  roomCode,
  onStartStream,
  onStopStream,
}) => {
  const [platform, setPlatform] = useState<
    'youtube' | 'facebook' | 'linkedin' | 'twitch' | 'custom'
  >('youtube');
  const [rtmpUrl, setRtmpUrl] = useState(
    streamOut?.rtmpUrl || 'rtmp://a.rtmp.youtube.com/live2',
  );
  const [streamKey, setStreamKey] = useState(streamOut?.streamKey || '');
  const [customHls, setCustomHls] = useState(
    streamOut?.hlsUrl || `https://live.meetit.live/hls/${roomCode}/index.m3u8`,
  );
  const [copiedHls, setCopiedHls] = useState(false);

  if (!isOpen) return null;

  const isLive = streamOut?.status === 'live';

  const handlePlatformChange = (p: typeof platform) => {
    setPlatform(p);
    if (p === 'youtube') setRtmpUrl('rtmp://a.rtmp.youtube.com/live2');
    else if (p === 'facebook')
      setRtmpUrl('rtmps://live-api-s.facebook.com:443/rtmp/');
    else if (p === 'linkedin') setRtmpUrl('rtmp://live.linkedin.com/app/');
    else if (p === 'twitch') setRtmpUrl('rtmp://live.twitch.tv/app/');
  };

  const handleCopyHls = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(customHls);
      setCopiedHls(true);
      setTimeout(() => setCopiedHls(false), 2000);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLive) {
      onStopStream();
    } else {
      onStartStream({
        rtmpUrl,
        streamKey,
        hlsUrl: customHls,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
        >
          ✕
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center font-bold text-lg">
            📡
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              Live Stream Broadcast Out
            </h2>
            <p className="text-xs text-slate-400">
              Simulcast to YouTube, Facebook, custom RTMP and HLS for 1,000+
              viewers.
            </p>
          </div>
        </div>

        {/* Live Status indicator */}
        <div className="mb-5 p-3 rounded-xl bg-slate-800/80 border border-slate-750 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isLive ? 'bg-red-500 animate-pulse' : 'bg-slate-500'
              }`}
            />
            <span className="font-semibold text-slate-200">
              {isLive
                ? 'Broadcasting Live to External Platforms'
                : 'Stream Out Idle'}
            </span>
          </div>
          {isLive && (
            <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">
              LIVE
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Platform selection pills */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Select Destination Platform
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {(
                ['youtube', 'facebook', 'linkedin', 'twitch', 'custom'] as const
              ).map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={isLive}
                  onClick={() => handlePlatformChange(p)}
                  className={`py-1.5 text-xs font-semibold rounded-lg border capitalize transition-colors ${
                    platform === p
                      ? 'bg-red-600 text-white border-red-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-750'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              RTMP Destination URL
            </label>
            <input
              type="text"
              disabled={isLive}
              value={rtmpUrl}
              onChange={(e) => setRtmpUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Stream Key
            </label>
            <input
              type="password"
              disabled={isLive}
              placeholder="Paste stream key here..."
              value={streamKey}
              onChange={(e) => setStreamKey(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {/* HLS Stream link */}
          <div className="pt-1">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              HLS Player URL (Unlimited Viewers CDN)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={customHls}
                onChange={(e) => setCustomHls(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 font-mono"
              />
              <button
                type="button"
                onClick={handleCopyHls}
                className="px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs text-white font-medium"
              >
                {copiedHls ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="submit"
              className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-sm transition-all shadow-lg ${
                isLive
                  ? 'bg-slate-800 hover:bg-slate-750 text-red-400 border border-red-500/30'
                  : 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30'
              }`}
            >
              {isLive ? 'Stop Live Stream Out' : 'Start Live Broadcast Out'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-sm font-semibold border border-slate-700"
            >
              Done
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
