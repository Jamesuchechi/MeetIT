import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, ArrowLeft, FileCheck2 } from 'lucide-react';

export interface TranscriptVerifyViewProps {
  onBackToApp: () => void;
}

interface VerifyResponse {
  valid: boolean;
  checkedCount?: number;
  brokenIndex?: number;
  reason?: string;
}

const SAMPLE_SIGNED_JSON = JSON.stringify(
  [
    {
      speaker: 'James',
      text: 'Approved the Q4 release checklist.',
      ts: 1700000000000,
      prevHash: '0'.repeat(64),
      hash: 'sample-hash-paste-signed-export-to-verify',
    },
  ],
  null,
  2,
);

export function TranscriptVerifyView({
  onBackToApp,
}: TranscriptVerifyViewProps) {
  const baseUrl =
    (import.meta.env.VITE_SIGNALING_URL as string | undefined)?.replace(
      /\/$/,
      '',
    ) ?? 'http://localhost:4000';

  const [payload, setPayload] = useState(SAMPLE_SIGNED_JSON);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setParseError(null);
    setResult(null);

    let entries: unknown;
    try {
      const parsed = JSON.parse(payload);
      entries = Array.isArray(parsed) ? parsed : parsed?.entries;
      if (!Array.isArray(entries)) {
        throw new Error('Expected a JSON array or { "entries": [...] }.');
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Invalid JSON');
      return;
    }

    setChecking(true);
    try {
      const res = await fetch(`${baseUrl}/transcripts/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      if (res.ok) {
        const data = (await res.json()) as VerifyResponse;
        setResult(data);
      } else {
        setParseError('Verification service returned an error.');
      }
    } catch {
      setParseError(
        'Could not reach signaling verification endpoint (/transcripts/verify).',
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      className="lobby-shell"
      data-view="verify"
      data-testid="transcript-verify-view"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 740 }}>
        <button
          type="button"
          className="btn"
          onClick={onBackToApp}
          style={{ marginBottom: 16 }}
        >
          <ArrowLeft size={15} />
          <span>Back to MeetIT</span>
        </button>

        <div className="profile-section-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileCheck2 size={22} />
            <div>
              <h1 style={{ margin: 0, fontSize: '1.35rem' }}>
                Public Transcript &amp; Recording Verification
              </h1>
              <p className="profile-card-sub" style={{ margin: '4px 0 0' }}>
                Paste a signed MeetIT transcript JSON export to verify its
                SHA-256 hash chain for legal, HR, or compliance audits.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleVerify}
            className="profile-edit-form"
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <div className="field">
              <label htmlFor="verify-json-input">Signed transcript JSON</label>
              <textarea
                id="verify-json-input"
                rows={10}
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                spellCheck={false}
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 12,
                }}
              />
            </div>
            <div className="profile-form-footer">
              <button
                type="submit"
                className="btn primary"
                disabled={checking}
                data-testid="verify-chain-btn"
              >
                {checking ? 'Verifying…' : 'Verify Hash Chain'}
              </button>
            </div>
          </form>

          {parseError && (
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                background: 'rgba(239, 68, 68, 0.14)',
                color: '#ef4444',
                fontSize: 13,
              }}
            >
              {parseError}
            </div>
          )}

          {result && (
            <div
              data-testid="verify-result-banner"
              style={{
                padding: 14,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: result.valid
                  ? 'rgba(16, 185, 129, 0.14)'
                  : 'rgba(239, 68, 68, 0.14)',
                color: result.valid ? '#10b981' : '#ef4444',
              }}
            >
              {result.valid ? (
                <ShieldCheck size={20} />
              ) : (
                <ShieldAlert size={20} />
              )}
              <div>
                <strong>
                  {result.valid
                    ? 'Tamper-Evident Chain Valid'
                    : 'Tampered or Invalid Signature Detected'}
                </strong>
                <div style={{ fontSize: 12, opacity: 0.9 }}>
                  {result.valid
                    ? `Verified ${result.checkedCount ?? 0} chained entries.`
                    : result.reason ||
                      `Hash mismatch at entry index ${result.brokenIndex ?? 0}.`}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
