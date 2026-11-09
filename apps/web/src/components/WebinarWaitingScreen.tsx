import React, { useEffect, useState } from 'react';
import type { WebinarBranding, WebinarState } from '@meetit/protocol';

interface WebinarWaitingScreenProps {
  webinar: WebinarState;
  roomTitle?: string;
  onRefresh?: () => void;
}

export const WebinarWaitingScreen: React.FC<WebinarWaitingScreenProps> = ({
  webinar,
  roomTitle,
}) => {
  const branding: WebinarBranding = webinar.branding ?? {
    headline: 'Welcome to our Live Webinar',
    description:
      'The webinar will begin shortly. Please sit tight while our speakers prepare in the green room.',
    speakerBios: [],
  };

  const [timeUntilStart, setTimeUntilStart] = useState<string>('');

  useEffect(() => {
    // If webinar has startedAt or a target start time in future
    const targetMs = webinar.startedAt;
    if (!targetMs) return;

    const interval = setInterval(() => {
      const diff = targetMs - Date.now();
      if (diff <= 0) {
        setTimeUntilStart('Starting any moment...');
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeUntilStart(`${mins}m ${secs}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [webinar.startedAt]);

  const primaryColor = branding.primaryColor || '#6366f1';
  const bgColor = branding.backgroundColor || '#0f172a';

  return (
    <div
      className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-white rounded-2xl shadow-2xl relative overflow-hidden my-4 border border-slate-700/60"
      style={{ backgroundColor: bgColor }}
    >
      {/* Banner backdrop if available */}
      {branding.bannerUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-15 pointer-events-none"
          style={{ backgroundImage: `url(${branding.bannerUrl})` }}
        />
      )}

      {/* Brand logo or fallback badge */}
      <div className="z-10 flex flex-col items-center text-center max-w-2xl">
        {branding.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt="Webinar Logo"
            className="h-16 mb-6 object-contain"
          />
        ) : (
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/20 text-3xl font-black"
            style={{ backgroundColor: primaryColor }}
          >
            M
          </div>
        )}

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-xs font-semibold text-indigo-400 mb-4 backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span>Green Room Practice Session Active</span>
        </div>

        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-100 mb-3">
          {branding.headline || roomTitle || 'Webinar Starting Soon'}
        </h1>

        <p className="text-slate-300 text-base md:text-lg mb-8 leading-relaxed">
          {branding.description ||
            'The host and panelists are finalizing preparations in the practice session. Your broadcast will automatically start as soon as the host goes live.'}
        </p>

        {timeUntilStart && (
          <div className="mb-8 px-6 py-3 rounded-xl bg-slate-800/90 border border-slate-700 text-center">
            <span className="text-xs uppercase tracking-wider text-slate-400 block mb-1">
              Estimated Countdown
            </span>
            <span className="text-2xl font-mono font-bold text-amber-400">
              {timeUntilStart}
            </span>
          </div>
        )}

        {/* Speaker Bios Section */}
        {branding.speakerBios && branding.speakerBios.length > 0 && (
          <div className="w-full mt-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
              Featured Speakers & Panelists
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
              {branding.speakerBios.map((speaker, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-800/60 border border-slate-750 backdrop-blur-sm"
                >
                  {speaker.avatarUrl ? (
                    <img
                      src={speaker.avatarUrl}
                      alt={speaker.name}
                      className="w-12 h-12 rounded-full object-cover border-2 border-indigo-500/40"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center font-bold text-indigo-300 text-lg">
                      {speaker.name[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-200 text-sm truncate">
                      {speaker.name}
                    </h3>
                    <p className="text-xs text-indigo-400 truncate">
                      {speaker.role}{' '}
                      {speaker.company ? `• ${speaker.company}` : ''}
                    </p>
                    {speaker.bio && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {speaker.bio}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center gap-2 text-xs text-slate-400">
          <svg
            className="w-4 h-4 animate-spin text-indigo-400"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
          <span>Waiting for host to broadcast live stage...</span>
        </div>
      </div>
    </div>
  );
};
