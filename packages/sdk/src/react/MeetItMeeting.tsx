import React, { useEffect, useRef } from 'react';
import { MeetIt } from '../MeetIt.js';
import type {
  MeetItEmbedOptions,
  MeetItEvents,
  MeetItInstance,
} from '../types.js';

export interface MeetItMeetingProps extends MeetItEmbedOptions {
  className?: string | undefined;
  style?: React.CSSProperties | undefined;
  onReady?: (() => void) | undefined;
  onJoined?: ((payload: MeetItEvents['joined']) => void) | undefined;
  onLeft?: ((payload: MeetItEvents['left']) => void) | undefined;
  onParticipantJoined?:
    ((payload: MeetItEvents['participant_joined']) => void) | undefined;
  onParticipantLeft?:
    ((payload: MeetItEvents['participant_left']) => void) | undefined;
  onRecordingStatus?:
    ((payload: MeetItEvents['recording_status']) => void) | undefined;
  onError?: ((payload: MeetItEvents['error']) => void) | undefined;
  onInstanceReady?: ((instance: MeetItInstance) => void) | undefined;
}

export function MeetItMeeting({
  roomCode,
  token,
  displayName,
  baseUrl,
  theme,
  width = '100%',
  height = '100%',
  audioMuted,
  videoEnabled,
  hideLogo,
  primaryColor,
  className,
  style,
  onReady,
  onJoined,
  onLeft,
  onParticipantJoined,
  onParticipantLeft,
  onRecordingStatus,
  onError,
  onInstanceReady,
}: MeetItMeetingProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<MeetItInstance | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const instance = MeetIt.embed(containerRef.current, {
      roomCode,
      token,
      displayName,
      baseUrl,
      theme,
      width,
      height,
      audioMuted,
      videoEnabled,
      hideLogo,
      primaryColor,
    });

    instanceRef.current = instance;
    if (onInstanceReady) {
      onInstanceReady(instance);
    }

    if (onReady) instance.on('ready', onReady);
    if (onJoined) instance.on('joined', onJoined);
    if (onLeft) instance.on('left', onLeft);
    if (onParticipantJoined)
      instance.on('participant_joined', onParticipantJoined);
    if (onParticipantLeft) instance.on('participant_left', onParticipantLeft);
    if (onRecordingStatus) instance.on('recording_status', onRecordingStatus);
    if (onError) instance.on('error', onError);

    return () => {
      instance.destroy();
      instanceRef.current = null;
    };
  }, [
    roomCode,
    token,
    displayName,
    baseUrl,
    theme,
    width,
    height,
    audioMuted,
    videoEnabled,
    hideLogo,
    primaryColor,
    onReady,
    onJoined,
    onLeft,
    onParticipantJoined,
    onParticipantLeft,
    onRecordingStatus,
    onError,
    onInstanceReady,
  ]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
      data-testid="meetit-meeting-container"
    />
  );
}
