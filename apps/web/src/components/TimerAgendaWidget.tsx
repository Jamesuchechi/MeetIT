import React, { useState, useEffect } from 'react';
import type { AgendaItem, MeetingTimer } from '@meetit/protocol';
import {
  Timer,
  Play,
  Pause,
  RotateCcw,
  Settings,
  X,
  ArrowRight,
  Plus,
} from 'lucide-react';

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
  isConfigOpen?: boolean;
  onToggleConfig?: (open: boolean) => void;
}

export function TimerAgendaWidget({
  timer,
  isHost,
  onSendTimerAction,
  isConfigOpen,
  onToggleConfig,
}: TimerAgendaWidgetProps) {
  const [secondsDisplay, setSecondsDisplay] = useState(
    timer.remainingSeconds ?? timer.durationSeconds ?? 0,
  );
  const [internalShowConfig, setInternalShowConfig] = useState(false);
  const showConfig =
    isConfigOpen !== undefined ? isConfigOpen : internalShowConfig;
  const setShowConfig = (open: boolean) => {
    if (onToggleConfig) {
      onToggleConfig(open);
    } else {
      setInternalShowConfig(open);
    }
  };
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
    <div className="meeting-timer-widget">
      {/* Mini floating pill */}
      <div className="meeting-timer-pill">
        <button
          type="button"
          onClick={isHost ? () => setShowConfig(!showConfig) : undefined}
          title={isHost ? 'Configure timer & agenda' : 'Meeting timer'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontFamily: 'monospace',
            fontWeight: 700,
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            padding: 0,
            cursor: isHost ? 'pointer' : 'default',
          }}
        >
          <Timer
            size={14}
            style={{
              color: timer.running ? 'var(--danger)' : 'var(--muted)',
            }}
          />
          {formatTime(secondsDisplay)}
        </button>

        {currentAgenda && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderLeft: '1px solid var(--line)',
              paddingLeft: '8px',
            }}
          >
            <span className="panel-badge muted" style={{ fontSize: '10px' }}>
              Agenda
            </span>
            <span
              className="meeting-timer-agenda-label"
              style={{
                fontWeight: 600,
                maxWidth: '140px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentAgenda.title}
            </span>
          </div>
        )}

        {isHost && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              borderLeft: '1px solid var(--line)',
              paddingLeft: '8px',
            }}
          >
            {!timer.running ? (
              <button
                type="button"
                onClick={() => onSendTimerAction({ action: 'start' })}
                className="app-modal-close"
                style={{
                  padding: '4px',
                  display: 'grid',
                  placeItems: 'center',
                  minWidth: '22px',
                  minHeight: '22px',
                }}
                title="Start timer"
              >
                <Play size={13} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSendTimerAction({ action: 'pause' })}
                className="app-modal-close"
                style={{
                  padding: '4px',
                  display: 'grid',
                  placeItems: 'center',
                  minWidth: '22px',
                  minHeight: '22px',
                }}
                title="Pause timer"
              >
                <Pause size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onSendTimerAction({ action: 'reset' })}
              className="app-modal-close"
              style={{
                padding: '4px',
                display: 'grid',
                placeItems: 'center',
                minWidth: '22px',
                minHeight: '22px',
              }}
              title="Reset timer"
            >
              <RotateCcw size={13} />
            </button>
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="app-modal-close"
              style={{
                padding: '4px',
                display: 'grid',
                placeItems: 'center',
                minWidth: '22px',
                minHeight: '22px',
              }}
              title="Timer & Agenda settings"
              data-testid="timer-settings-btn"
            >
              <Settings size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Popover Settings & Agenda Manager Dialog */}
      {showConfig && isHost && (
        <div
          className="timer-config-backdrop"
          onClick={() => setShowConfig(false)}
          data-testid="timer-config-backdrop"
        >
          <div
            className="timer-config-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Timer & Agenda Controls"
          >
            <div className="timer-config-header">
              <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>
                Timer &amp; Agenda Controls
              </strong>
              <button
                type="button"
                onClick={() => setShowConfig(false)}
                className="app-modal-close"
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>

            {/* Quick countdown presets */}
            <div className="panel-form-group">
              <label htmlFor="countdown-minutes-input">
                Set Countdown (minutes)
              </label>
              <div
                style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
              >
                <input
                  id="countdown-minutes-input"
                  type="number"
                  min={1}
                  max={120}
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(Number(e.target.value))}
                  className="panel-input"
                  style={{ width: '80px' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    onSendTimerAction({
                      action: 'set_countdown',
                      durationSeconds: customMinutes * 60,
                    });
                    setShowConfig(false);
                  }}
                  className="panel-btn-primary"
                  style={{ flex: 1, padding: '8px 12px', fontSize: '12.5px' }}
                >
                  Set
                </button>
              </div>
            </div>

            {/* Agenda items tracker */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                paddingTop: '8px',
                borderTop: '1px solid var(--line)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--muted)',
                  }}
                >
                  Agenda Items
                </span>
                {timer.agenda && timer.agenda.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onSendTimerAction({ action: 'next_agenda' })}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--accent)',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>Next Item</span>
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  maxHeight: '160px',
                  overflowY: 'auto',
                }}
              >
                {(!timer.agenda || timer.agenda.length === 0) && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--muted)',
                      padding: '6px 0',
                    }}
                  >
                    No agenda items yet. Add topics below to guide your meeting.
                  </div>
                )}
                {timer.agenda?.map((item, idx) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: `1px solid ${idx === (timer.activeAgendaIndex ?? 0) ? 'var(--accent)' : 'var(--line)'}`,
                      background:
                        idx === (timer.activeAgendaIndex ?? 0)
                          ? 'var(--soft)'
                          : 'var(--bg)',
                      fontSize: '12px',
                      color: item.completed ? 'var(--muted)' : 'var(--ink)',
                      textDecoration: item.completed ? 'line-through' : 'none',
                    }}
                  >
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}
                    >
                      {item.title}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        color: 'var(--muted)',
                        marginLeft: '8px',
                      }}
                    >
                      {item.durationMinutes}m
                    </span>
                  </div>
                ))}
              </div>

              {/* Add agenda item */}
              <form
                onSubmit={handleAddAgenda}
                style={{ display: 'flex', gap: '6px', marginTop: '4px' }}
              >
                <input
                  type="text"
                  placeholder="Topic..."
                  value={agendaTitleInput}
                  onChange={(e) => setAgendaTitleInput(e.target.value)}
                  className="panel-input"
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    fontSize: '12px',
                    minWidth: 0,
                  }}
                />
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={agendaDurationInput}
                  onChange={(e) =>
                    setAgendaDurationInput(Number(e.target.value))
                  }
                  className="panel-input"
                  style={{
                    width: '54px',
                    padding: '7px 4px',
                    textAlign: 'center',
                    fontSize: '12px',
                    flexShrink: 0,
                  }}
                  title="Duration in minutes"
                />
                <button
                  type="submit"
                  className="panel-btn-secondary"
                  style={{ padding: '7px 12px', flexShrink: 0 }}
                  title="Add topic"
                >
                  <Plus size={14} />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
