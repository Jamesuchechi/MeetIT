import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './Avatar';
import { CheckIcon } from './Icons';
import type { AuthUser } from '../types';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const COMMON_TIMEZONES = [
  'UTC',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
];

interface ProfileEditViewProps {
  currentUser: AuthUser | null;
  targetUserId?: string | null;
  onCancel: () => void;
  onSaved: () => void;
  onToast: (msg: string) => void;
}

export function ProfileEditView({
  currentUser,
  targetUserId,
  onCancel,
  onSaved,
  onToast,
}: ProfileEditViewProps) {
  const { updateProfile } = useAuth();

  const isOwner = Boolean(
    currentUser && (!targetUserId || currentUser.id === targetUserId),
  );

  const detectedTz =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC';

  const [displayName, setDisplayName] = useState(
    currentUser?.displayName ?? '',
  );
  const [headline, setHeadline] = useState(currentUser?.headline ?? '');
  const [organization, setOrganization] = useState(
    currentUser?.organization ?? '',
  );
  const [location, setLocation] = useState(currentUser?.location ?? '');
  const [timezone, setTimezone] = useState(currentUser?.timezone || detectedTz);
  const [bio, setBio] = useState(currentUser?.bio ?? '');

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    setDisplayName(currentUser.displayName);
    setHeadline(currentUser.headline ?? '');
    setOrganization(currentUser.organization ?? '');
    setLocation(currentUser.location ?? '');
    setTimezone(currentUser.timezone || detectedTz);
    setBio(currentUser.bio ?? '');
  }, [currentUser, detectedTz]);

  // Owner-only access guard
  if (!currentUser || !isOwner) {
    return (
      <section
        className="profile-edit-page"
        aria-labelledby="profile-edit-denied"
        data-testid="profile-edit-denied"
      >
        <div className="profile-section-card">
          <h2 id="profile-edit-denied">Owner access required</h2>
          <p style={{ color: 'var(--muted)', margin: '8px 0 18px' }}>
            You can only edit your own MeetIT profile. Viewing another user’s
            profile is read-only.
          </p>
          <button type="button" className="btn primary" onClick={onCancel}>
            Back to public profile
          </button>
        </div>
      </section>
    );
  }

  const timezoneOptions = COMMON_TIMEZONES.includes(timezone)
    ? COMMON_TIMEZONES
    : [timezone, ...COMMON_TIMEZONES];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError('Display name cannot be empty.');
      return;
    }

    setSaving(true);
    const res = await updateProfile({
      displayName: trimmedName,
      headline: headline.trim(),
      organization: organization.trim(),
      location: location.trim(),
      timezone: timezone.trim(),
      bio: bio.trim(),
    });
    setSaving(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    onToast('Profile updated.');
    onSaved();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    if (!ALLOWED_MIME.includes(file.type)) {
      setError('Please choose a PNG, JPEG, WebP, or GIF image.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError('Avatar image must be 2 MB or smaller.');
      return;
    }

    setUploading(true);
    const res = await updateProfile({ avatarFile: file });
    setUploading(false);

    if (res.error) {
      setError(res.error);
      return;
    }
    onToast('Avatar updated.');
  };

  const handleRemoveAvatar = async () => {
    setError(null);
    setUploading(true);
    const res = await updateProfile({ removeAvatar: true });
    setUploading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onToast('Avatar removed.');
  };

  return (
    <section
      className="profile-edit-page"
      aria-labelledby="edit-profile-heading"
      data-testid="profile-edit-view"
    >
      <div className="page-subhead">
        <div>
          <span className="eyebrow-badge">Owner-only editor</span>
          <h2 id="edit-profile-heading">Edit your public profile</h2>
          <p>
            Customize how your name, role, avatar, and bio appear on your public
            host profile and in meeting rooms.
          </p>
        </div>
        <div className="page-subhead-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>

      {error && (
        <div className="auth-alert error" role="alert">
          {error}
        </div>
      )}

      <div className="profile-edit-grid">
        {/* Left: Avatar & Live Identity Preview */}
        <div className="profile-section-card">
          <h3>Profile photo</h3>
          <p className="profile-card-sub">
            Displayed on your public host card and whenever your camera is
            turned off in a call.
          </p>

          <div className="profile-avatar-editor">
            <Avatar
              name={displayName || currentUser.displayName}
              src={currentUser.avatarUrl}
              className="profile-hero-avatar"
            />
            <div className="profile-avatar-editor-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_MIME.join(',')}
                onChange={(e) => void handleFileChange(e)}
                style={{ display: 'none' }}
                aria-label="Upload avatar image"
              />
              <button
                type="button"
                className="btn"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading
                  ? 'Uploading…'
                  : currentUser.avatarUrl
                    ? 'Change photo'
                    : 'Upload photo'}
              </button>
              {currentUser.avatarUrl && (
                <button
                  type="button"
                  className="btn"
                  disabled={uploading}
                  onClick={() => void handleRemoveAvatar()}
                >
                  Remove
                </button>
              )}
              <small style={{ color: 'var(--muted)' }}>
                PNG, JPG, WebP, or GIF · Max 2 MB
              </small>
            </div>
          </div>

          <hr className="profile-divider" />

          <div className="profile-preview-mini">
            <small className="preview-label">Live tile preview</small>
            <div className="preview-tile-mock">
              <Avatar
                name={displayName || currentUser.displayName}
                src={currentUser.avatarUrl}
                className="av"
              />
              <div>
                <strong>{displayName || currentUser.displayName}</strong>
                <small style={{ display: 'block', color: 'var(--muted)' }}>
                  {headline || 'MeetIT Video Host & Collaborator'}
                </small>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Structured Profile Form */}
        <form
          className="profile-section-card profile-edit-form"
          onSubmit={(e) => void handleSave(e)}
        >
          <h3>Public identity details</h3>

          <div className="form-row-2col">
            <div className="field">
              <label htmlFor="profile-display-name">Display name *</label>
              <input
                id="profile-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your full name"
                maxLength={80}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="profile-headline">Headline / Role</label>
              <input
                id="profile-headline"
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="e.g. Product Lead & Host"
                maxLength={100}
              />
            </div>
          </div>

          <div className="form-row-2col">
            <div className="field">
              <label htmlFor="profile-org">Organization / Team</label>
              <input
                id="profile-org"
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="e.g. Brightline Studio"
                maxLength={80}
              />
            </div>

            <div className="field">
              <label htmlFor="profile-location">Location</label>
              <input
                id="profile-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Lagos, Nigeria"
                maxLength={80}
              />
            </div>
          </div>

          <div className="form-row-2col">
            <div className="field">
              <label htmlFor="profile-timezone">Timezone</label>
              <select
                id="profile-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                {timezoneOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="profile-email">Account email (private)</label>
              <input
                id="profile-email"
                type="email"
                value={currentUser.email}
                disabled
                readOnly
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="profile-bio">
              About / Bio{' '}
              <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
                ({bio.length}/600)
              </span>
            </label>
            <textarea
              id="profile-bio"
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Share what you work on, topics you host meetings about, or your office hours…"
              maxLength={600}
            />
          </div>

          <div className="profile-form-footer">
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={saving}
              data-testid="save-profile-btn"
            >
              <CheckIcon />
              <span>{saving ? 'Saving…' : 'Save profile'}</span>
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
