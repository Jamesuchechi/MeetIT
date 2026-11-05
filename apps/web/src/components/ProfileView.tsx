import React, { useState, useEffect } from 'react';
import { Avatar } from './Avatar';
import { LnkIcon, CheckIcon, VidIcon } from './Icons';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  copyToClipboard,
  personalRoomCodeForUser,
  type AuthUser,
} from '../types';

interface ProfileViewProps {
  currentUser: AuthUser | null;
  viewedUserId?: string | null;
  onEditProfile: () => void;
  onEnterRoom: (code: string) => void;
  onToast: (msg: string) => void;
}

export function ProfileView({
  currentUser,
  viewedUserId,
  onEditProfile,
  onEnterRoom,
  onToast,
}: ProfileViewProps) {
  const [remoteProfile, setRemoteProfile] = useState<AuthUser | null>(null);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [copiedRoom, setCopiedRoom] = useState(false);
  const [copiedProfileUrl, setCopiedProfileUrl] = useState(false);

  const targetId = viewedUserId || currentUser?.id || '';
  const isOwner = Boolean(currentUser && currentUser.id === targetId);

  useEffect(() => {
    if (isOwner || !targetId || !isSupabaseConfigured || !supabase) {
      setRemoteProfile(null);
      return;
    }

    let mounted = true;
    setLoadingRemote(true);

    void supabase
      .from('profiles')
      .select('id, display_name, avatar_url, created_at')
      .eq('id', targetId)
      .maybeSingle()
      .then(({ data }) => {
        if (!mounted) return;
        if (data) {
          setRemoteProfile({
            id: data.id as string,
            email: '',
            displayName: (data.display_name as string) || 'MeetIT Host',
            ...(data.avatar_url
              ? { avatarUrl: data.avatar_url as string }
              : {}),
            ...(data.created_at
              ? { createdAt: data.created_at as string }
              : {}),
          });
        }
        setLoadingRemote(false);
      });

    return () => {
      mounted = false;
    };
  }, [targetId, isOwner]);

  const profile: AuthUser | null = isOwner ? currentUser : remoteProfile;

  if (loadingRemote) {
    return (
      <section className="profile-page" aria-busy="true">
        <div className="profile-hero-card">
          <p style={{ color: 'var(--muted)' }}>Loading public profile…</p>
        </div>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="profile-page">
        <div className="profile-hero-card">
          <h2>Profile not found</h2>
          <p style={{ color: 'var(--muted)' }}>
            This user profile does not exist or is not publicly available.
          </p>
        </div>
      </section>
    );
  }

  const personalRoomCode = personalRoomCodeForUser(profile.id);
  const personalRoomUrl = `${window.location.origin}/m/${personalRoomCode}`;
  const publicProfileUrl = `${window.location.origin}/#profile/${profile.id}`;
  const detectedTimezone =
    profile.timezone ||
    (typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC');

  const memberSince = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      })
    : 'Active Host';

  const handleCopyRoom = async () => {
    const ok = await copyToClipboard(personalRoomUrl);
    if (ok) {
      setCopiedRoom(true);
      onToast('Personal room link copied.');
      window.setTimeout(() => setCopiedRoom(false), 2000);
    }
  };

  const handleCopyProfileLink = async () => {
    const ok = await copyToClipboard(publicProfileUrl);
    if (ok) {
      setCopiedProfileUrl(true);
      onToast('Public profile link copied.');
      window.setTimeout(() => setCopiedProfileUrl(false), 2000);
    }
  };

  return (
    <section
      className="profile-page"
      aria-labelledby="public-profile-name"
      data-testid="public-profile-view"
    >
      {/* 1. Hero Banner + Identity Header Card */}
      <div className="profile-hero-card">
        <div className="profile-hero-cover" aria-hidden="true">
          <span className="profile-visibility-pill">
            Public Host Profile · Readonly
          </span>
        </div>

        <div className="profile-hero-body">
          <div className="profile-hero-identity">
            <Avatar
              name={profile.displayName}
              src={profile.avatarUrl}
              className="profile-hero-avatar"
            />

            <div className="profile-hero-text">
              <div className="profile-name-row">
                <h2 id="public-profile-name">{profile.displayName}</h2>
                <span
                  className="verified-host-badge"
                  title="Verified MeetIT account"
                >
                  <CheckIcon style={{ width: 13, height: 13 }} />
                  <span>Verified</span>
                </span>
              </div>

              <p className="profile-headline">
                {profile.headline || 'MeetIT Video Host & Collaborator'}
              </p>

              <div className="profile-meta-pills">
                {profile.organization && (
                  <span className="profile-meta-chip">
                    🏢 {profile.organization}
                  </span>
                )}
                {profile.location && (
                  <span className="profile-meta-chip">
                    📍 {profile.location}
                  </span>
                )}
                <span className="profile-meta-chip">🕒 {detectedTimezone}</span>
                <span className="profile-meta-chip">Joined {memberSince}</span>
              </div>
            </div>
          </div>

          <div className="profile-hero-actions">
            <button
              type="button"
              className="btn"
              onClick={() => void handleCopyProfileLink()}
            >
              {copiedProfileUrl ? <CheckIcon /> : <LnkIcon />}
              <span>{copiedProfileUrl ? 'Link copied' : 'Share profile'}</span>
            </button>

            {isOwner ? (
              <button
                type="button"
                className="btn primary"
                onClick={onEditProfile}
                data-testid="edit-profile-btn"
              >
                <span>Edit profile</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn primary"
                onClick={() => onEnterRoom(personalRoomCode)}
              >
                <VidIcon />
                <span>
                  Join {profile.displayName.split(' ')[0]}&apos;s room
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Two-Column Profile Details Grid */}
      <div className="profile-grid">
        {/* Left Column: Bio + Personal Meeting Room */}
        <div className="profile-col">
          <div className="profile-section-card">
            <div className="profile-section-head">
              <h3>About</h3>
              {isOwner && !profile.bio && (
                <button
                  type="button"
                  className="btn-link"
                  onClick={onEditProfile}
                >
                  + Add bio
                </button>
              )}
            </div>
            {profile.bio ? (
              <p className="profile-bio-text">{profile.bio}</p>
            ) : (
              <p className="profile-bio-empty">
                {isOwner
                  ? 'You haven’t added a bio yet. Click "Edit profile" to share your role, background, or office hours.'
                  : `${profile.displayName} hosts low-latency audio-first meetings on MeetIT.`}
              </p>
            )}
          </div>

          <div className="profile-section-card">
            <div className="profile-section-head">
              <h3>Personal meeting room</h3>
              <span className="chip">Always available</span>
            </div>
            <p className="profile-card-sub">
              Permanent room code for 1:1 check-ins, office hours, and instant
              calls with {isOwner ? 'your guests' : profile.displayName}.
            </p>

            <div className="profile-room-box">
              <div className="profile-room-code-wrap">
                <LnkIcon />
                <code>{`meetit.app/m/${personalRoomCode}`}</code>
              </div>

              <div className="profile-room-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => void handleCopyRoom()}
                >
                  {copiedRoom ? <CheckIcon /> : <LnkIcon />}
                  <span>{copiedRoom ? 'Copied' : 'Copy link'}</span>
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => onEnterRoom(personalRoomCode)}
                >
                  <VidIcon />
                  <span>{isOwner ? 'Start in my room' : 'Join room'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Host Capabilities & Verified Identity */}
        <div className="profile-col">
          <div className="profile-section-card">
            <h3>Host studio &amp; resilience</h3>
            <div className="profile-specs-list">
              <div className="profile-spec-row">
                <span>Audio-First Engine</span>
                <strong className="spec-ok">Protected (Opus FEC + DTX)</strong>
              </div>
              <div className="profile-spec-row">
                <span>Media Encryption</span>
                <strong>DTLS-SRTP End-to-End</strong>
              </div>
              <div className="profile-spec-row">
                <span>Mesh Room Capacity</span>
                <strong>Up to 4 HD participants</strong>
              </div>
              <div className="profile-spec-row">
                <span>Guest Access</span>
                <strong>Browser link (no install)</strong>
              </div>
            </div>
          </div>

          <div className="profile-section-card">
            <h3>Verified identity</h3>
            <div className="profile-specs-list">
              {isOwner && profile.email && (
                <div className="profile-spec-row">
                  <span>Account Email</span>
                  <strong>{profile.email}</strong>
                </div>
              )}
              <div className="profile-spec-row">
                <span>Personal Room Code</span>
                <code>{personalRoomCode}</code>
              </div>
              <div className="profile-spec-row">
                <span>Host ID Fingerprint</span>
                <code>{profile.id.slice(0, 8).toUpperCase()}</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
