import React, { useEffect, useState } from 'react';
import {
  exportAnalyticsToCsv,
  fetchWebinarAnalyticsApi,
} from '../lib/webinarStore';

interface WebinarAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
}

export const WebinarAnalyticsModal: React.FC<WebinarAnalyticsModalProps> = ({
  isOpen,
  onClose,
  roomCode,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<
    Array<{
      peerId: string;
      displayName: string;
      role: string;
      joinTime: number;
      leaveTime?: number;
      durationSeconds: number;
      chatCount: number;
      pollVotesCount: number;
      qaCount: number;
      engagementScore: number;
    }>
  >([]);
  const [peakViewers, setPeakViewers] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchWebinarAnalyticsApi(roomCode)
      .then((data) => {
        setReport(data.report);
        setPeakViewers(data.peakViewers);
        setLoading(false);
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch analytics',
        );
        setLoading(false);
      });
  }, [isOpen, roomCode]);

  if (!isOpen) return null;

  const handleExport = () => {
    exportAnalyticsToCsv(report, roomCode);
  };

  const avgEngagement =
    report.length > 0
      ? Math.round(
          report.reduce((acc, curr) => acc + curr.engagementScore, 0) /
            report.length,
        )
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-3xl rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 shadow-2xl p-6 relative flex flex-col max-h-[85vh]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
        >
          ✕
        </button>

        <div className="flex items-center justify-between mb-5 pr-8">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>📊</span> Webinar Attendee Analytics
            </h2>
            <p className="text-xs text-slate-400">
              Live engagement scores, session duration, and attendee
              interactions.
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={report.length === 0}
            className="py-2 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
          >
            <span>📥</span> Export CSV
          </button>
        </div>

        {/* Top metrics summary cards */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-750">
            <span className="text-xs text-slate-400 block mb-1">
              Peak Viewers
            </span>
            <span className="text-2xl font-bold text-white">{peakViewers}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-750">
            <span className="text-xs text-slate-400 block mb-1">
              Total Attendees
            </span>
            <span className="text-2xl font-bold text-white">
              {report.length}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-750">
            <span className="text-xs text-slate-400 block mb-1">
              Avg Engagement
            </span>
            <span className="text-2xl font-bold text-emerald-400">
              {avgEngagement}%
            </span>
          </div>
        </div>

        {/* Attendees List / Table */}
        <div className="flex-1 overflow-y-auto rounded-xl border border-slate-800">
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              Loading attendee analytics...
            </div>
          ) : error ? (
            <div className="text-center py-12 text-rose-400 text-sm">
              {error}
            </div>
          ) : report.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              No attendee sessions recorded yet.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-800/90 text-slate-300 uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Attendee</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Duration</th>
                  <th className="py-2.5 px-3 text-center">Polls</th>
                  <th className="py-2.5 px-3 text-center">Q&A</th>
                  <th className="py-2.5 px-3 text-center">Chat</th>
                  <th className="py-2.5 px-3">Engagement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {report.map((att) => {
                  const mins = Math.floor(att.durationSeconds / 60);
                  const secs = att.durationSeconds % 60;
                  return (
                    <tr key={att.peerId} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-medium text-slate-200">
                        {att.displayName}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 capitalize">
                        {att.role}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 font-mono">
                        {mins}m {secs}s
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-300">
                        {att.pollVotesCount}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-300">
                        {att.qaCount}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-300">
                        {att.chatCount}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-500"
                              style={{ width: `${att.engagementScore}%` }}
                            />
                          </div>
                          <span className="font-semibold text-slate-300 w-8 text-right">
                            {att.engagementScore}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="py-2 px-5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
