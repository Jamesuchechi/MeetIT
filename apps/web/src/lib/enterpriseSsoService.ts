import type {
  EnterpriseSsoConfig,
  SsoProviderType,
  ScimUser,
} from '@meetit/protocol';
import { supabase, isSupabaseConfigured } from './supabase';

const SSO_CONFIG_KEY = 'meetit_sso_config_v1';
const SCIM_TOKENS_KEY = 'meetit_scim_tokens_v1';

export interface ScimTokenItem {
  id: string;
  label: string;
  token: string;
  createdAt: number;
  lastUsedAt?: number;
}

export const DEFAULT_SSO_CONFIG: EnterpriseSsoConfig = {
  id: 'default_sso',
  organizationId: 'default_org',
  providerType: 'saml',
  idpEntityId: '',
  idpSsoUrl: '',
  idpCertificate: '',
  metadataUrl: '',
  enforcedDomains: [],
  isActive: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

export async function loadEnterpriseSsoConfig(): Promise<EnterpriseSsoConfig> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('enterprise_sso_configs')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          organizationId: data.organization_id,
          providerType: data.provider_type as SsoProviderType,
          idpEntityId: data.idp_entity_id,
          idpSsoUrl: data.idp_sso_url,
          idpCertificate: data.idp_certificate ?? undefined,
          metadataUrl: data.metadata_url ?? undefined,
          enforcedDomains: data.enforced_domains ?? [],
          isActive: data.is_active ?? false,
          createdAt: new Date(data.created_at).getTime(),
          updatedAt: new Date(data.updated_at).getTime(),
        };
      }
    } catch {}
  }

  try {
    const raw = localStorage.getItem(SSO_CONFIG_KEY);
    if (raw) {
      return JSON.parse(raw) as EnterpriseSsoConfig;
    }
  } catch {}

  return DEFAULT_SSO_CONFIG;
}

export async function saveEnterpriseSsoConfig(
  config: EnterpriseSsoConfig,
): Promise<void> {
  const updated: EnterpriseSsoConfig = {
    ...config,
    updatedAt: Date.now(),
  };

  try {
    localStorage.setItem(SSO_CONFIG_KEY, JSON.stringify(updated));
  } catch {}

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('enterprise_sso_configs').upsert(
        {
          id: updated.id === 'default_sso' ? undefined : updated.id,
          organization_id: updated.organizationId,
          provider_type: updated.providerType,
          idp_entity_id: updated.idpEntityId,
          idp_sso_url: updated.idpSsoUrl,
          idp_certificate: updated.idpCertificate ?? null,
          metadata_url: updated.metadataUrl ?? null,
          enforced_domains: updated.enforcedDomains,
          is_active: updated.isActive,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id' },
      );
    } catch {}
  }
}

export function generateScimToken(label = 'Okta SCIM Sync'): ScimTokenItem {
  const randomBytes = new Uint8Array(24);
  crypto.getRandomValues(randomBytes);
  const token =
    'scim_live_' +
    Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');

  const item: ScimTokenItem = {
    id: `scim_tok_${Date.now()}`,
    label,
    token,
    createdAt: Date.now(),
  };

  try {
    const current = loadScimTokens();
    const updated = [item, ...current];
    localStorage.setItem(SCIM_TOKENS_KEY, JSON.stringify(updated));
  } catch {}

  return item;
}

export function loadScimTokens(): ScimTokenItem[] {
  try {
    const raw = localStorage.getItem(SCIM_TOKENS_KEY);
    if (raw) {
      return JSON.parse(raw) as ScimTokenItem[];
    }
  } catch {}
  return [];
}

export function revokeScimToken(tokenId: string): void {
  try {
    const current = loadScimTokens();
    const updated = current.filter((t) => t.id !== tokenId);
    localStorage.setItem(SCIM_TOKENS_KEY, JSON.stringify(updated));
  } catch {}
}

/**
 * Validates SAML or OIDC IdP metadata or ACS endpoint syntax.
 */
export function validateIdpConfiguration(
  config: Partial<EnterpriseSsoConfig>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config.idpEntityId?.trim()) {
    errors.push('IdP Entity ID or Issuer URI is required.');
  }
  if (!config.idpSsoUrl?.trim()) {
    errors.push('Single Sign-On URL is required.');
  } else {
    try {
      new URL(config.idpSsoUrl);
    } catch {
      errors.push('Single Sign-On URL must be a valid HTTP(S) URL.');
    }
  }

  if (
    config.providerType === 'saml' &&
    !config.idpCertificate?.trim() &&
    !config.metadataUrl?.trim()
  ) {
    errors.push(
      'SAML configuration requires an X.509 certificate or a Metadata XML URL.',
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
