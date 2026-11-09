import React, { useState, useEffect } from 'react';
import type { AgendaItem, MeetingTimer } from '@meetit/protocol';

interface TimerAgendaWidgetProps {
  timer: MeetingTimer;
  isHost: boolean;
  onSendTimerAction: (params: {
    action:
      | 'start'
      | 'pause'
      | 'reset'
      | 'set_countdown'
      | 'next_agenda'
      | 'set_agenda';
    durationSeconds?: number;
    agenda?: AgendaItem[];
  }) => void;
}

export function TimerAgendaWidget({
  timer,
  isHost,
  onSendTimerAction,
}: TimerAgendaWidgetProps) {
  const [secondsDisplay, setSecondsDisplay] = useState(
    timer.remainingSeconds ?? timer.durationSeconds ?? 0,
  );
  const [showConfig, setShowConfig] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(10);
  const [agendaTitleInput, setAgendaTitleInput] = useState('');
  const [agendaDurationInput, setAgendaDurationInput] = useState(5);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (timer.running && timer.startedAt) {
      interval = setInterval(() => {
        if (timer.type === 'countdown') {
          const elapsed = Math.floor((Date.now() - timer.startedAt!) / 1000);
          const remaining = Math.max(
            0,
            (timer.remainingSeconds ?? timer.durationSeconds) - elapsed,
          );
          setSecondsDisplay(remaining);
        } else {
          // stopwatch
          const elapsed = Math.floor((Date.now() - timer.startedAt!) / 1000);
          setSecondsDisplay((timer.durationSeconds || 0) + elapsed);
        }
      }, 1000);
    } else {
      setSecondsDisplay(timer.remainingSeconds ?? timer.durationSeconds ?? 0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [
    timer.running,
    timer.startedAt,
    timer.remainingSeconds,
    timer.durationSeconds,
    timer.type,
  ]);

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const currentAgenda = timer.agenda?.[timer.activeAgendaIndex ?? 0];

  const handleAddAgenda = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agendaTitleInput.trim()) return;
    const newItem: AgendaItem = {
      id: `ag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: agendaTitleInput.trim(),
      durationMinutes: agendaDurationInput,
      completed: false,
    };
    const nextAgenda = [...(timer.agenda || []), newItem];
    onSendTimerAction({ action: 'set_agenda', agenda: nextAgenda });
    setAgendaTitleInput('');
  };

  if (
    !timer.running &&
    !showConfig &&
    (!timer.agenda || timer.agenda.length === 0) &&
    !isHost
  ) {
    return null;
  }

  return (
    <div className="relative z-30">
      {/* Mini floating pill */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900/90 border border-neutral-700/80 backdrop-blur-md rounded-2xl shadow-xl text-neutral-100 text-xs">
        <span className="flex items-center gap-1 font-mono font-bold text-white">
          <span
            className={
              timer.running ? 'animate-pulse text-rose-400' : 'text-neutral-400'
            }
          >
            ⏱
          </span>
          {formatTime(secondsDisplay)}
        </span>

        {currentAgenda && (
          <div className="flex items-center gap-1.5 border-l border-neutral-700 pl-2">
            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.2 rounded font-medium">
              Agenda
            </span>
            <span className="font-semibold text-neutral-200 max-w-[140px] truncate">
              {currentAgenda.title}
            </span>
          </div>
        )}

        {isHost && (
          <div className="flex items-center gap-1 border-l border-neutral-700 pl-2">
            {!timer.running ? (
              <button
                onClick={() => onSendTimerAction({ action: 'start' })}
                className="p-1 hover:text-emerald-400 text-neutral-300"
                title="Start timer"
              >
                ▶
              </button>
            ) : (
              <button
                onClick={() => onSendTimerAction({ action: 'pause' })}
                className="p-1 hover:text-amber-400 text-neutral-300"
                title="Pause timer"
              >
                ⏸
              </button>
            )}
            <button
              onClick={() => onSendTimerAction({ action: 'reset' })}
              className="p-1 hover:text-neutral-200 text-neutral-400"
              title="Reset timer"
            >
              ↺
            </button>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="p-1 hover:text-indigo-400 text-neutral-400"
              title="Timer & Agenda settings"
            >
              ⚙
            </button>
          </div>
        )}
      </div>

      {/* Popover Settings & Agenda Manager */}
      {showConfig && isHost && (
        <div className="absolute top-10 left-0 w-80 p-4 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col gap-4 text-xs text-neutral-100">
          <div className="flex justify-between items-center border-b border-neutral-800 pb-2">
            <span className="font-bold text-white">
              Timer & Agenda Controls
            </span>
            <button
              onClick={() => setShowConfig(false)}
              className="text-neutral-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Quick countdown presets */}
          <div>
            <label className="text-neutral-400 font-semibold mb-1 block">
              Set Countdown
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                max={120}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(Number(e.target.value))}
                className="w-20 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded-lg text-white"
              />
              <span className="self-center text-neutral-400">min</span>
              <button
                onClick={() =>
                  onSendTimerAction({
                    action: 'set_countdown',
                    durationSeconds: customMinutes * 60,
                  })
                }
                className="flex-1 py-1 bg-indigo-600 hover:bg-indigo-500 font-semibold rounded-lg text-white"
              >
                Set
              </button>
            </div>
          </div>

          {/* Agenda items tracker */}
          <div className="flex flex-col gap-2 pt-2 border-t border-neutral-800">
            <div className="flex justify-between items-center">
              <span className="text-neutral-400 font-semibold">
                Agenda Items
              </span>
              {timer.agenda && timer.agenda.length > 0 && (
                <button
                  onClick={() => onSendTimerAction({ action: 'next_agenda' })}
                  className="text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  Next Item ➔
                </button>
              )}
            </div>

            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
              {timer.agenda?.map((item, idx) => (
                <div
                  key={item.id}
                  className={`p-2 rounded-lg border flex items-center justify-between ${
                    idx === (timer.activeAgendaIndex ?? 0)
                      ? 'border-indigo-500 bg-indigo-950/30 text-white font-medium'
                      : item.completed
                        ? 'border-neutral-800 bg-neutral-950 text-neutral-500 line-through'
                        : 'border-neutral-700 bg-neutral-800 text-neutral-300'
                  }`}
                >
                  <span className="truncate flex-1">{item.title}</span>
                  <span className="text-[10px] text-neutral-400 ml-2 font-mono">
                    {item.durationMinutes}m
                  </span>
                </div>
              ))}
            </div>

            {/* Add agenda item */}
            <form onSubmit={handleAddAgenda} className="flex gap-1.5 mt-1">
              <input
                type="text"
                placeholder="Topic..."
                value={agendaTitleInput}
                onChange={(e) => setAgendaTitleInput(e.target.value)}
                className="flex-1 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded-lg text-white"
              />
              <input
                type="number"
                min={1}
                max={60}
                value={agendaDurationInput}
                onChange={(e) => setAgendaDurationInput(Number(e.target.value))}
                className="w-14 px-1 py-1 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-center"
              />
              <button
                type="submit"
                className="px-2.5 py-1 bg-neutral-700 hover:bg-neutral-600 font-semibold rounded-lg text-white"
              >
                +
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
