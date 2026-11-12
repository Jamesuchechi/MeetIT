import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  Shield,
  Plus,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  X,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import type { EnterpriseSsoConfig, SsoProviderType } from '@meetit/protocol';
import {
  loadEnterpriseSsoConfig,
  saveEnterpriseSsoConfig,
  loadScimTokens,
  generateScimToken,
  revokeScimToken,
  validateIdpConfiguration,
  type ScimTokenItem,
} from '../lib/enterpriseSsoService';

interface EnterpriseSsoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function EnterpriseSsoModal({
  isOpen,
  onClose,
  onToast,
}: EnterpriseSsoModalProps) {
  const [activeTab, setActiveTab] = useState<'sso' | 'scim'>('sso');
  const [config, setConfig] = useState<EnterpriseSsoConfig | null>(null);
  const [scimTokens, setScimTokens] = useState<ScimTokenItem[]>([]);
  const [scimLabel, setScimLabel] = useState('');
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(
    null,
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      void (async () => {
        const loaded = await loadEnterpriseSsoConfig();
        setConfig(loaded);
        setScimTokens(loadScimTokens());
      })();
    }
  }, [isOpen]);

  if (!isOpen || !config) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    onToast('Copied to clipboard');
  };

  const handleAddDomain = () => {
    const trimmed = domainInput.trim().toLowerCase();
    if (!trimmed) return;
    if (config.enforcedDomains.includes(trimmed)) {
      onToast('Domain is already added.');
      return;
    }
    setConfig({
      ...config,
      enforcedDomains: [...config.enforcedDomains, trimmed],
    });
    setDomainInput('');
  };

  const handleRemoveDomain = (dom: string) => {
    setConfig({
      ...config,
      enforcedDomains: config.enforcedDomains.filter((d) => d !== dom),
    });
  };

  const handleSaveSso = async () => {
    if (config.isActive) {
      const val = validateIdpConfiguration(config);
      if (!val.valid) {
        setValidationErrors(val.errors);
        return;
      }
    }
    setValidationErrors([]);
    setIsSaving(true);
    try {
      await saveEnterpriseSsoConfig(config);
      onToast('SSO configuration updated.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateScim = () => {
    const item = generateScimToken(scimLabel.trim() || 'SCIM Directory Sync');
    setScimTokens(loadScimTokens());
    setNewlyCreatedToken(item.token);
    setScimLabel('');
    onToast('SCIM bearer token generated.');
  };

  const handleRevokeScim = (id: string) => {
    revokeScimToken(id);
    setScimTokens(loadScimTokens());
    onToast('SCIM token revoked.');
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(6px)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="modal-card"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--surface)',
          borderRadius: 14,
          border: '1px solid var(--line)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
          color: 'var(--ink)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(59, 130, 246, 0.12)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--accent)',
              }}
            >
              <KeyRound size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 700 }}>
                Enterprise SSO &amp; SCIM Provisioning
              </h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                SAML 2.0, OpenID Connect &amp; Automated Directory Lifecycle
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn-icon-subtle"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switcher */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--line)',
            padding: '0 24px',
            background: 'var(--soft)',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('sso')}
            style={{
              padding: '12px 18px',
              border: 0,
              background: 'transparent',
              borderBottom:
                activeTab === 'sso'
                  ? '2px solid var(--accent)'
                  : '2px solid transparent',
              color: activeTab === 'sso' ? 'var(--accent)' : 'var(--muted)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Single Sign-On (SAML / OIDC)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('scim')}
            style={{
              padding: '12px 18px',
              border: 0,
              background: 'transparent',
              borderBottom:
                activeTab === 'scim'
                  ? '2px solid var(--accent)'
                  : '2px solid transparent',
              color: activeTab === 'scim' ? 'var(--accent)' : 'var(--muted)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            SCIM 2.0 User Sync
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          {activeTab === 'sso' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {validationErrors.length > 0 && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 8,
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid var(--danger)',
                    color: 'var(--danger)',
                    fontSize: '0.85rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontWeight: 600,
                    }}
                  >
                    <AlertCircle size={16} /> Configuration validation errors:
                  </div>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                    {validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Toggle Enable */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px',
                  borderRadius: 10,
                  background: 'var(--soft)',
                  border: '1px solid var(--line)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    Enforce Single Sign-On (SSO)
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Require organization members on enforced domains to sign in
                    via your identity provider.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.isActive}
                  onChange={(e) =>
                    setConfig({ ...config, isActive: e.target.checked })
                  }
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
              </div>

              {/* Provider Type */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    marginBottom: 6,
                  }}
                >
                  Protocol
                </label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="sso_provider"
                      checked={config.providerType === 'saml'}
                      onChange={() =>
                        setConfig({ ...config, providerType: 'saml' })
                      }
                    />
                    SAML 2.0 (Okta, Azure AD, PingIdentity, OneLogin)
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="sso_provider"
                      checked={config.providerType === 'oidc'}
                      onChange={() =>
                        setConfig({ ...config, providerType: 'oidc' })
                      }
                    />
                    OpenID Connect (OIDC / OAuth 2.0)
                  </label>
                </div>
              </div>

              {/* Service Provider ACS URL & Entity ID */}
              <div
                style={{
                  background: 'var(--soft)',
                  padding: '14px',
                  borderRadius: 8,
                  fontSize: '0.82rem',
                  border: '1px solid var(--line)',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  MeetIT Service Provider (SP) Coordinates:
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    margin: '4px 0',
                  }}
                >
                  <span style={{ color: 'var(--muted)' }}>
                    SP Entity ID / Audience URI:
                  </span>
                  <span style={{ fontFamily: 'monospace' }}>
                    https://meetit.app/auth/sso/saml/metadata
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    margin: '4px 0',
                  }}
                >
                  <span style={{ color: 'var(--muted)' }}>
                    Single Sign-On (ACS) URL:
                  </span>
                  <span style={{ fontFamily: 'monospace' }}>
                    https://meetit.app/auth/sso/saml/acs
                  </span>
                </div>
              </div>

              {/* IdP Entity ID */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  Identity Provider Entity ID / Issuer URL
                </label>
                <input
                  type="text"
                  placeholder="https://identity.okta.com/exk123456 or https://login.microsoftonline.com/..."
                  value={config.idpEntityId}
                  onChange={(e) =>
                    setConfig({ ...config, idpEntityId: e.target.value })
                  }
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                  }}
                />
              </div>

              {/* IdP SSO URL */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  Identity Provider Single Sign-On (SSO) URL
                </label>
                <input
                  type="text"
                  placeholder="https://acme.okta.com/app/meetit/sso/saml"
                  value={config.idpSsoUrl}
                  onChange={(e) =>
                    setConfig({ ...config, idpSsoUrl: e.target.value })
                  }
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                  }}
                />
              </div>

              {/* IdP Certificate */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  X.509 Public Certificate (PEM)
                </label>
                <textarea
                  rows={4}
                  placeholder="-----BEGIN CERTIFICATE-----\nMIIDqjCCApKgAwIBAgIGAY...\n-----END CERTIFICATE-----"
                  value={config.idpCertificate || ''}
                  onChange={(e) =>
                    setConfig({ ...config, idpCertificate: e.target.value })
                  }
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    fontFamily: 'monospace',
                    fontSize: '0.78rem',
                  }}
                />
              </div>

              {/* Enforced Domains */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  Enforced Domains
                </label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    placeholder="acme.com"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddDomain();
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--line)',
                      background: 'var(--surface)',
                      color: 'var(--ink)',
                    }}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={handleAddDomain}
                  >
                    <Plus size={14} style={{ marginRight: 4 }} /> Add Domain
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {config.enforcedDomains.map((dom) => (
                    <span
                      key={dom}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 10px',
                        borderRadius: 6,
                        background: 'var(--soft)',
                        border: '1px solid var(--line)',
                        fontSize: '0.82rem',
                      }}
                    >
                      {dom}
                      <button
                        type="button"
                        onClick={() => handleRemoveDomain(dom)}
                        style={{
                          background: 'transparent',
                          border: 0,
                          cursor: 'pointer',
                          color: 'var(--muted)',
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {config.enforcedDomains.length === 0 && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                      No domains assigned. SSO will be optional until domains
                      are added.
                    </span>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: 10,
                }}
              >
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void handleSaveSso()}
                  disabled={isSaving}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Shield size={16} />{' '}
                  {isSaving ? 'Saving…' : 'Save SSO Settings'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'scim' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div
                style={{
                  background: 'var(--soft)',
                  padding: '14px',
                  borderRadius: 8,
                  fontSize: '0.85rem',
                  border: '1px solid var(--line)',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  SCIM 2.0 Directory Base URL:
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <code style={{ fontSize: '0.82rem' }}>
                    https://meetit.app/api/scim/v2
                  </code>
                  <button
                    type="button"
                    className="btn-icon-subtle"
                    onClick={() =>
                      handleCopy('https://meetit.app/api/scim/v2', 'scim_url')
                    }
                    title="Copy SCIM URL"
                  >
                    {copiedKey === 'scim_url' ? (
                      <Check size={14} color="#10b981" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
                <div
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--muted)',
                    marginTop: 6,
                  }}
                >
                  Supports RFC 7643 / RFC 7644 user provisioning, attribute
                  sync, and automated offboarding.
                </div>
              </div>

              {/* Newly Created Token Display */}
              {newlyCreatedToken && (
                <div
                  style={{
                    padding: '14px',
                    borderRadius: 8,
                    background: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid var(--accent)',
                    fontSize: '0.85rem',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      color: 'var(--accent)',
                      marginBottom: 4,
                    }}
                  >
                    New SCIM Bearer Token Generated:
                  </div>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <input
                      type="text"
                      readOnly
                      value={newlyCreatedToken}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        borderRadius: 6,
                        fontFamily: 'monospace',
                        fontSize: '0.78rem',
                        background: 'var(--surface)',
                        border: '1px solid var(--line)',
                        color: 'var(--ink)',
                      }}
                    />
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleCopy(newlyCreatedToken, 'new_tok')}
                    >
                      {copiedKey === 'new_tok' ? (
                        <Check size={14} color="#10b981" />
                      ) : (
                        <Copy size={14} />
                      )}{' '}
                      Copy
                    </button>
                  </div>
                  <small
                    style={{
                      color: 'var(--muted)',
                      display: 'block',
                      marginTop: 6,
                    }}
                  >
                    Store this bearer token in your Okta or Azure AD SCIM
                    configuration. It will not be shown again.
                  </small>
                </div>
              )}

              {/* Generate new token form */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Token label (e.g. Okta Primary Directory Sync)"
                  value={scimLabel}
                  onChange={(e) => setScimLabel(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                  }}
                />
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleCreateScim}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Plus size={15} /> Generate SCIM Token
                </button>
              </div>

              {/* Existing SCIM Tokens List */}
              <div>
                <h4
                  style={{
                    fontSize: '0.9rem',
                    margin: '12px 0 8px',
                    fontWeight: 600,
                  }}
                >
                  Active SCIM Tokens
                </h4>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  {scimTokens.map((tok) => (
                    <div
                      key={tok.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: 'var(--soft)',
                        border: '1px solid var(--line)',
                      }}
                    >
                      <div>
                        <strong
                          style={{ fontSize: '0.88rem', display: 'block' }}
                        >
                          {tok.label}
                        </strong>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--muted)',
                            fontFamily: 'monospace',
                          }}
                        >
                          {tok.token.slice(0, 16)}••••••••••••
                        </span>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--muted)',
                            marginLeft: 8,
                          }}
                        >
                          Created:{' '}
                          {new Date(tok.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-icon-subtle"
                        onClick={() => handleRevokeScim(tok.id)}
                        title="Revoke Token"
                        style={{ color: 'var(--danger)' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {scimTokens.length === 0 && (
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                        textAlign: 'center',
                        padding: '16px',
                      }}
                    >
                      No SCIM tokens active. Generate one above to configure
                      directory synchronization.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
