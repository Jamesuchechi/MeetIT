import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Webhook,
  ShieldCheck,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import {
  type ApiKey,
  type ApiKeyScope,
  type WebhookSubscription,
} from '@meetit/protocol';
import { ApiKeyService } from '../lib/apiRouter';
import {
  WebhookDispatcher,
  type WebhookDeliveryAttempt,
} from '../lib/webhookDispatcher';

interface ApiKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast?: ((msg: string) => void) | undefined;
}

const ALL_SCOPES: Array<{ scope: ApiKeyScope; label: string; desc: string }> = [
  {
    scope: 'rooms:read',
    label: 'Read Rooms',
    desc: 'Query room details and participant counts',
  },
  {
    scope: 'rooms:write',
    label: 'Create Rooms',
    desc: 'Create and configure instant or scheduled rooms',
  },
  {
    scope: 'meetings:read',
    label: 'Read Meetings',
    desc: 'Access past meeting summaries and attendance logs',
  },
  {
    scope: 'recordings:read',
    label: 'Read Recordings',
    desc: 'List and download meeting recordings',
  },
  {
    scope: 'transcripts:read',
    label: 'Read Transcripts',
    desc: 'Fetch formatted captions and AI meeting notes',
  },
  {
    scope: 'webhooks:manage',
    label: 'Manage Webhooks',
    desc: 'Register, inspect, and delete webhook subscriptions',
  },
];

export function ApiKeysModal({ isOpen, onClose, onToast }: ApiKeysModalProps) {
  const [activeTab, setActiveTab] = useState<'keys' | 'webhooks'>('keys');
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookSubscription[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryAttempt[]>([]);

  // Create Key Form State
  const [showCreateKeyForm, setShowCreateKeyForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<ApiKeyScope[]>([
    'rooms:read',
    'rooms:write',
  ]);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [createKeyError, setCreateKeyError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create Webhook Form State
  const [showCreateWebhookForm, setShowCreateWebhookForm] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');

  useEffect(() => {
    if (isOpen) {
      setKeys(ApiKeyService.getKeys());
      setWebhooks(WebhookDispatcher.getSubscriptions());
      setDeliveries(WebhookDispatcher.getDeliveryHistory());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleScope = (scope: ApiKeyScope) => {
    setSelectedScopes((curr) =>
      curr.includes(scope) ? curr.filter((s) => s !== scope) : [...curr, scope],
    );
  };

  const handleCreateKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim() || selectedScopes.length === 0) return;
    setCreateKeyError(null);
    setIsSubmitting(true);
    try {
      const { apiKey, secretKey } = await ApiKeyService.createKey(
        newKeyName.trim(),
        selectedScopes,
      );
      setKeys(ApiKeyService.getKeys());
      setCreatedSecret(secretKey);
      setShowCreateKeyForm(false);
      setNewKeyName('');
      onToast?.('API Key generated successfully');
    } catch (err) {
      console.error('Failed to create API key:', err);
      setCreateKeyError(
        err instanceof Error ? err.message : 'Could not create API key',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeKey = (id: string) => {
    if (
      window.confirm(
        'Are you sure you want to revoke this API key? Applications using it will immediately fail authentication.',
      )
    ) {
      ApiKeyService.revokeKey(id);
      setKeys(ApiKeyService.getKeys());
    }
  };

  const handleCreateWebhookSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebhookUrl.trim()) return;
    WebhookDispatcher.registerSubscription(newWebhookUrl.trim(), [
      'meeting.started',
      'meeting.ended',
      'recording.ready',
      'transcript.ready',
    ]);
    setWebhooks(WebhookDispatcher.getSubscriptions());
    setShowCreateWebhookForm(false);
    setNewWebhookUrl('');
  };

  const handleDeleteWebhook = (id: string) => {
    WebhookDispatcher.deleteSubscription(id);
    setWebhooks(WebhookDispatcher.getSubscriptions());
  };

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div
      className="shortcuts-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-keys-title"
      data-testid="api-keys-modal"
    >
      <div
        className="shortcuts-modal-card"
        style={{
          maxWidth: 660,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Key size={20} style={{ color: 'var(--accent)' }} />
            <h3
              id="api-keys-title"
              style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}
            >
              API Keys &amp; Webhooks (Developer Platform)
            </h3>
          </div>
          <button
            type="button"
            className="btn-icon-subtle"
            onClick={onClose}
            aria-label="Close API settings"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            borderBottom: '1px solid var(--line)',
            padding: '10px 0',
          }}
        >
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'keys' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('keys')}
            data-testid="tab-api-keys"
          >
            <Key size={14} style={{ marginRight: 6 }} />
            API Keys ({keys.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'webhooks' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('webhooks')}
            data-testid="tab-webhooks"
          >
            <Webhook size={14} style={{ marginRight: 6 }} />
            Webhooks &amp; Deliveries ({webhooks.length})
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 2px' }}>
          {/* TAB: API KEYS */}
          {activeTab === 'keys' && (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {/* Secret Key Reveal Banner */}
              {createdSecret && (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: 'var(--soft)',
                    border: '1px solid var(--accent)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                  data-testid="secret-reveal-banner"
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: 600,
                      color: 'var(--ink)',
                    }}
                  >
                    <ShieldCheck size={16} style={{ color: 'var(--accent)' }} />
                    Copy your new secret key now. It will never be shown again!
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <input
                      type="text"
                      readOnly
                      value={createdSecret}
                      className="panel-input"
                      style={{
                        flex: 1,
                        fontFamily: 'monospace',
                        fontSize: '12px',
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-sm primary"
                      onClick={() => handleCopy(createdSecret)}
                      data-testid="copy-secret-btn"
                    >
                      {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                      {copiedKey ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm secondary"
                      onClick={() => setCreatedSecret(null)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

              {/* Header Action */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                  Use API keys to authenticate with the MeetIT REST API and SDK.
                </span>
                <button
                  type="button"
                  className="btn btn-sm primary"
                  onClick={() => setShowCreateKeyForm(!showCreateKeyForm)}
                  data-testid="create-key-btn"
                >
                  <Plus size={14} style={{ marginRight: 4 }} />
                  Create Key
                </button>
              </div>

              {/* Create Key Form */}
              {showCreateKeyForm && (
                <form
                  onSubmit={handleCreateKeySubmit}
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                  data-testid="create-key-form"
                >
                  <strong style={{ fontSize: '13.5px', color: 'var(--ink)' }}>
                    Create New API Key
                  </strong>
                  <div>
                    <label
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        display: 'block',
                        marginBottom: 4,
                      }}
                    >
                      Key Description / App Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Production Backend, Slack Bot, Zapier Sync"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      className="panel-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      required
                      data-testid="key-name-input"
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        display: 'block',
                        marginBottom: 6,
                      }}
                    >
                      Granular Scopes &amp; Permissions
                    </label>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '8px',
                      }}
                    >
                      {ALL_SCOPES.map(({ scope, label, desc }) => (
                        <label
                          key={scope}
                          style={{
                            display: 'flex',
                            gap: '8px',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: '1px solid var(--line)',
                            background: selectedScopes.includes(scope)
                              ? 'var(--soft)'
                              : 'var(--bg)',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedScopes.includes(scope)}
                            onChange={() => handleToggleScope(scope)}
                          />
                          <div>
                            <div style={{ fontWeight: 600 }}>{label}</div>
                            <div
                              style={{
                                fontSize: '10.5px',
                                color: 'var(--muted)',
                              }}
                            >
                              {desc}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {createKeyError && (
                    <div
                      style={{
                        color: 'var(--danger)',
                        fontSize: '12px',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        background: 'rgba(239, 68, 68, 0.1)',
                      }}
                    >
                      {createKeyError}
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '8px',
                      marginTop: '4px',
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-sm secondary"
                      onClick={() => setShowCreateKeyForm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-sm primary"
                      disabled={
                        !newKeyName.trim() ||
                        selectedScopes.length === 0 ||
                        isSubmitting
                      }
                      data-testid="submit-create-key-btn"
                    >
                      {isSubmitting ? 'Generating…' : 'Generate Secret Key'}
                    </button>
                  </div>
                </form>
              )}

              {/* Keys List */}
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                {keys.length === 0 && (
                  <div
                    style={{
                      fontSize: '12.5px',
                      color: 'var(--muted)',
                      textAlign: 'center',
                      padding: '24px 0',
                    }}
                  >
                    No API keys generated yet. Click "Create Key" to get
                    started.
                  </div>
                )}
                {keys.map((k) => (
                  <div
                    key={k.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid var(--line)',
                      background: 'var(--surface)',
                    }}
                    data-testid={`key-row-${k.id}`}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '13.5px',
                          color: 'var(--ink)',
                        }}
                      >
                        {k.name}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginTop: '4px',
                        }}
                      >
                        <code
                          style={{ fontSize: '11px', color: 'var(--muted)' }}
                        >
                          {k.keyPrefix}••••••••
                        </code>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {k.scopes.map((s) => (
                            <span
                              key={s}
                              className="panel-badge"
                              style={{ fontSize: '10px', padding: '1px 6px' }}
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn-icon-subtle"
                      onClick={() => handleRevokeKey(k.id)}
                      title="Revoke key"
                      aria-label="Revoke key"
                      style={{ color: 'var(--danger)' }}
                      data-testid={`revoke-key-${k.id}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: WEBHOOKS */}
          {activeTab === 'webhooks' && (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                  Deliver signed HMAC-SHA256 payloads on meeting lifecycle
                  events.
                </span>
                <button
                  type="button"
                  className="btn btn-sm primary"
                  onClick={() =>
                    setShowCreateWebhookForm(!showCreateWebhookForm)
                  }
                  data-testid="add-webhook-btn"
                >
                  <Plus size={14} style={{ marginRight: 4 }} />
                  Add Webhook
                </button>
              </div>

              {showCreateWebhookForm && (
                <form
                  onSubmit={handleCreateWebhookSubmit}
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                  data-testid="create-webhook-form"
                >
                  <strong style={{ fontSize: '13px', color: 'var(--ink)' }}>
                    Add Webhook Endpoint
                  </strong>
                  <input
                    type="url"
                    placeholder="https://api.yourcompany.com/meetit/webhook"
                    value={newWebhookUrl}
                    onChange={(e) => setNewWebhookUrl(e.target.value)}
                    className="panel-input"
                    required
                    data-testid="webhook-url-input"
                  />
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '8px',
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-sm secondary"
                      onClick={() => setShowCreateWebhookForm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-sm primary"
                      disabled={!newWebhookUrl.trim()}
                      data-testid="submit-webhook-btn"
                    >
                      Save Webhook
                    </button>
                  </div>
                </form>
              )}

              {/* Webhooks list */}
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                {webhooks.length === 0 && (
                  <div
                    style={{
                      fontSize: '12.5px',
                      color: 'var(--muted)',
                      textAlign: 'center',
                      padding: '16px 0',
                    }}
                  >
                    No webhooks registered yet.
                  </div>
                )}
                {webhooks.map((sub) => (
                  <div
                    key={sub.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid var(--line)',
                      background: 'var(--surface)',
                    }}
                    data-testid={`webhook-row-${sub.id}`}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          fontFamily: 'monospace',
                        }}
                      >
                        {sub.url}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--muted)',
                          marginTop: '2px',
                        }}
                      >
                        Secret: <code>{sub.secret.slice(0, 10)}••••••••</code> ·
                        Events: {sub.events.join(', ')}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-icon-subtle"
                      onClick={() => handleDeleteWebhook(sub.id)}
                      title="Delete webhook"
                      aria-label="Delete webhook"
                      style={{ color: 'var(--danger)' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Recent Deliveries */}
              <div
                style={{
                  borderTop: '1px solid var(--line)',
                  paddingTop: '12px',
                }}
              >
                <strong
                  style={{
                    fontSize: '13px',
                    color: 'var(--ink)',
                    display: 'block',
                    marginBottom: '8px',
                  }}
                >
                  Recent Delivery Logs
                </strong>
                {deliveries.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    No deliveries logged yet. Events will appear here with HMAC
                    status.
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    {deliveries.slice(0, 5).map((d) => (
                      <div
                        key={d.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          background: 'var(--bg)',
                          fontSize: '11.5px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background:
                                d.status === 'success' ? '#10b981' : '#ef4444',
                            }}
                          />
                          <code>{d.event}</code>
                          <span style={{ color: 'var(--muted)' }}>{d.url}</span>
                        </div>
                        <span
                          style={{
                            color: 'var(--muted)',
                            fontFamily: 'monospace',
                          }}
                        >
                          {d.httpStatus
                            ? `HTTP ${d.httpStatus}`
                            : d.error || 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
