import React, { useState } from 'react';
import {
  Code2,
  Copy,
  Check,
  Terminal,
  FileCode,
  Key,
  ExternalLink,
  Layers,
  ArrowLeft,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { MeetItMeeting } from '@meetit/sdk';
import { ApiKeysModal } from './ApiKeysModal';

interface DeveloperHubViewProps {
  onBack?: () => void;
  onToast?: (msg: string) => void;
}

export function DeveloperHubView({ onBack, onToast }: DeveloperHubViewProps) {
  const [activeCodeTab, setActiveCodeTab] = useState<
    'react' | 'vanilla' | 'curl' | 'python'
  >('react');
  const [showApiKeysModal, setShowApiKeysModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Playground Config State
  const [roomCode, setRoomCode] = useState('gzh-kfwu-wqt');
  const [theme, setTheme] = useState<'dark' | 'light' | 'auto'>('dark');
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [hideLogo, setHideLogo] = useState(false);
  const [primaryColor, setPrimaryColor] = useState('#2457ff');

  const getGeneratedCode = () => {
    switch (activeCodeTab) {
      case 'react':
        return `import { MeetItMeeting } from '@meetit/sdk';

export function VideoRoom() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <MeetItMeeting
        roomCode="${roomCode}"
        theme="${theme}"
        audioMuted={${audioMuted}}
        videoEnabled={${videoEnabled}}
        hideLogo={${hideLogo}}
        primaryColor="${primaryColor}"
        onJoined={(event) => console.log('User joined room:', event)}
        onLeft={() => console.log('User hung up')}
      />
    </div>
  );
}`;
      case 'vanilla':
        return `<!-- 1. Include MeetIT SDK -->
<script type="module">
  import { MeetIt } from 'https://cdn.jsdelivr.net/npm/@meetit/sdk/dist/index.js';

  const meeting = MeetIt.embed(document.getElementById('meeting-container'), {
    roomCode: '${roomCode}',
    theme: '${theme}',
    audioMuted: ${audioMuted},
    videoEnabled: ${videoEnabled},
    hideLogo: ${hideLogo},
    primaryColor: '${primaryColor}',
  });

  meeting.on('ready', () => console.log('Embed iframe loaded'));
  meeting.on('joined', (e) => console.log('Joined:', e));
  meeting.on('left', () => console.log('Left room'));
</script>

<div id="meeting-container" style="width: 100%; height: 600px;"></div>`;
      case 'curl':
        return `# Create an instant room with host and guest tokens
curl -X POST https://meetit.app/api/v1/rooms \\
  -H "Authorization: Bearer mkit_live_YOUR_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Developer Embedded Meeting",
    "maxParticipants": 50,
    "features": {
      "recording": true,
      "transcription": true,
      "breakout": true
    },
    "expiresInHours": 24
  }'`;
      case 'python':
        return `import requests

API_KEY = "mkit_live_YOUR_SECRET_KEY"

response = requests.post(
    "https://meetit.app/api/v1/rooms",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    },
    json={
        "title": "Automated Python Room",
        "maxParticipants": 25,
        "features": { "recording": True, "transcription": True }
    }
)

data = response.json()["data"]
print(f"Room Code: {data['roomCode']}")
print(f"Guest Join URL: {data['roomUrl']}")
print(f"Host Join URL: {data['hostUrl']}")`;
    }
  };

  const handleCopyCode = () => {
    void navigator.clipboard.writeText(getGeneratedCode());
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="dev-hub-root">
      {/* Top Navigation */}
      <header className="dev-hub-header">
        <div className="dev-hub-header-left">
          {onBack && (
            <button
              type="button"
              className="btn btn-sm secondary"
              onClick={onBack}
              data-testid="dev-hub-back-btn"
            >
              <ArrowLeft size={14} style={{ marginRight: 4 }} />
              Back
            </button>
          )}
          <div className="dev-hub-brand-group">
            <Code2
              size={20}
              style={{ color: 'var(--accent)', flexShrink: 0 }}
            />
            <strong className="dev-hub-title">MeetIT Developer Platform</strong>
            <span
              className="panel-badge accent dev-hub-badge"
              style={{ fontSize: '11px', whiteSpace: 'nowrap' }}
            >
              v1.5 API &amp; SDK
            </span>
          </div>
        </div>

        <div className="dev-hub-header-actions">
          <a
            href="/openapi.json"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm secondary"
            style={{ textDecoration: 'none' }}
          >
            <FileCode size={14} style={{ marginRight: 4 }} />
            OpenAPI Spec
          </a>
          <button
            type="button"
            className="btn btn-sm primary"
            onClick={() => setShowApiKeysModal(true)}
            data-testid="open-api-keys-btn"
          >
            <Key size={14} style={{ marginRight: 4 }} />
            API Keys &amp; Webhooks
          </button>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="dev-hub-main">
        {/* Left Column: Config Controls */}
        <aside className="dev-hub-sidebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={18} style={{ color: 'var(--accent)' }} />
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>
              Live Embed Controls
            </h4>
          </div>

          <div>
            <label
              style={{
                fontSize: '12px',
                fontWeight: 600,
                display: 'block',
                marginBottom: 4,
              }}
            >
              Room Code
            </label>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              className="panel-input"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label
              style={{
                fontSize: '12px',
                fontWeight: 600,
                display: 'block',
                marginBottom: 4,
              }}
            >
              UI Theme
            </label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as any)}
              className="panel-input"
              style={{ width: '100%', boxSizing: 'border-box' }}
            >
              <option value="dark">Dark Theme</option>
              <option value="light">Light Theme</option>
              <option value="auto">Auto (System)</option>
            </select>
          </div>

          <div>
            <label
              style={{
                fontSize: '12px',
                fontWeight: 600,
                display: 'block',
                marginBottom: 4,
              }}
            >
              Brand Primary Color
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                style={{
                  width: '40px',
                  height: '36px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                }}
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="panel-input"
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingTop: '4px',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={audioMuted}
                onChange={(e) => setAudioMuted(e.target.checked)}
              />
              <span>Start with microphone muted</span>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={videoEnabled}
                onChange={(e) => setVideoEnabled(e.target.checked)}
              />
              <span>Start with camera enabled</span>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={hideLogo}
                onChange={(e) => setHideLogo(e.target.checked)}
              />
              <span>Hide MeetIT logo (White-label)</span>
            </label>
          </div>
        </aside>

        {/* Right Column: Live Embed Monitor & Code Snippets */}
        <section className="dev-hub-content">
          {/* Live Embed Preview Monitor */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Sparkles size={16} style={{ color: 'var(--accent)' }} />
                <strong style={{ fontSize: '14px' }}>
                  Live Embedded Meeting Preview
                </strong>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                Powered by <code>@meetit/sdk</code>
              </span>
            </div>

            <div
              style={{
                width: '100%',
                height: '420px',
                minHeight: '280px',
                borderRadius: '14px',
                overflow: 'hidden',
                border: '1px solid var(--line)',
                boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                background: '#090d16',
              }}
            >
              <MeetItMeeting
                roomCode={roomCode}
                baseUrl={
                  typeof window !== 'undefined'
                    ? window.location.origin
                    : undefined
                }
                theme={theme}
                audioMuted={audioMuted}
                videoEnabled={videoEnabled}
                hideLogo={hideLogo}
                primaryColor={primaryColor}
              />
            </div>
          </div>

          {/* Code Snippet Viewer */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '14px',
              border: '1px solid var(--line)',
              background: '#0f172a',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 16px',
                borderBottom: '1px solid #1e293b',
                background: '#0a0f1d',
              }}
            >
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['react', 'vanilla', 'curl', 'python'] as const).map(
                  (tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveCodeTab(tab)}
                      style={{
                        background:
                          activeCodeTab === tab ? '#1e293b' : 'transparent',
                        color: activeCodeTab === tab ? '#38bdf8' : '#94a3b8',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                      }}
                      data-testid={`code-tab-${tab}`}
                    >
                      {tab}
                    </button>
                  ),
                )}
              </div>

              <button
                type="button"
                onClick={handleCopyCode}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
                data-testid="copy-code-btn"
              >
                {copiedCode ? (
                  <Check size={14} style={{ color: '#10b981' }} />
                ) : (
                  <Copy size={14} />
                )}
                {copiedCode ? 'Copied' : 'Copy Code'}
              </button>
            </div>

            <pre
              style={{
                margin: 0,
                padding: '16px',
                color: '#e2e8f0',
                fontSize: '12.5px',
                lineHeight: '1.5',
                fontFamily: 'monospace',
                overflowX: 'auto',
              }}
            >
              <code>{getGeneratedCode()}</code>
            </pre>
          </div>
        </section>
      </main>

      {/* API Keys & Webhooks Modal */}
      <ApiKeysModal
        isOpen={showApiKeysModal}
        onClose={() => setShowApiKeysModal(false)}
        onToast={onToast}
      />
    </div>
  );
}
