import { describe, expect, it, beforeEach } from 'vitest';
import { validateLuhn, scanDlpContent, DEFAULT_DLP_RULES } from './dlpScanner';
import {
  generateDomainVerificationToken,
  isExpiredUnderRetention,
} from './enterpriseControlsService';
import {
  generateScimToken,
  loadScimTokens,
  revokeScimToken,
  validateIdpConfiguration,
} from './enterpriseSsoService';
import { submitVulnerabilityReport, BOUNTY_TIERS } from './bugBountyService';

describe('Phase 10 Enterprise Security & Compliance [P2]', () => {
  beforeEach(() => {
    // Stub localStorage
    const store: Record<string, string> = {};
    global.localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
      length: Object.keys(store).length,
    } as unknown as Storage;
  });

  describe('DLP Content Scanner', () => {
    it('validates payment card numbers using Luhn checksum', () => {
      // Valid Visa test card
      expect(validateLuhn('4532015112830366')).toBe(true);
      // Valid MasterCard test card
      expect(validateLuhn('5555555555554444')).toBe(true);
      // Invalid Luhn
      expect(validateLuhn('4532015112830367')).toBe(false);
      // Non-card numbers
      expect(validateLuhn('12345')).toBe(false);
    });

    it('blocks messages containing payment card numbers', () => {
      const result = scanDlpContent(
        'Please charge my card 4532015112830366 immediately.',
        DEFAULT_DLP_RULES,
      );
      expect(result.hasViolation).toBe(true);
      expect(result.blocked).toBe(true);
      expect(result.violations[0]?.category).toBe('financial_cards');
    });

    it('blocks messages containing leaked API keys or secrets', () => {
      const result = scanDlpContent(
        'Here is my key: sk-live1234567890abcdef1234567890 for testing',
        DEFAULT_DLP_RULES,
      );
      expect(result.hasViolation).toBe(true);
      expect(result.blocked).toBe(true);
      expect(result.violations[0]?.category).toBe('api_secrets');
    });

    it('redacts national identity numbers', () => {
      const result = scanDlpContent(
        'Employee SSN is 123-45-6789 on the form.',
        DEFAULT_DLP_RULES,
      );
      expect(result.hasViolation).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.redactedText).toContain('[REDACTED NATIONAL_ID]');
    });

    it('flags confidential keywords without blocking', () => {
      const result = scanDlpContent(
        'Notice: This slide deck is CONFIDENTIAL and for INTERNAL ONLY.',
        DEFAULT_DLP_RULES,
      );
      expect(result.hasViolation).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.violations.some((v) => v.action === 'flag')).toBe(true);
    });

    it('passes clean messages without violation', () => {
      const result = scanDlpContent(
        'Hello team, let us review the sprint roadmap.',
      );
      expect(result.hasViolation).toBe(false);
      expect(result.blocked).toBe(false);
      expect(result.redactedText).toBe(
        'Hello team, let us review the sprint roadmap.',
      );
    });
  });

  describe('Enterprise Controls Service', () => {
    it('generates a formatted DNS TXT domain verification token', () => {
      const token = generateDomainVerificationToken('acme.corp');
      expect(token).toMatch(
        /^meetit-site-verification=acme\.corp-[a-z0-9]+-[a-z0-9]+$/,
      );
    });

    it('evaluates retention expiration correctly based on days', () => {
      const oneDayMs = 24 * 60 * 60 * 1000;
      const now = Date.now();
      const sixtyDaysAgo = now - 60 * oneDayMs;
      const oneHundredDaysAgo = now - 100 * oneDayMs;

      // 90 days retention window
      expect(isExpiredUnderRetention(sixtyDaysAgo, 90)).toBe(false);
      expect(isExpiredUnderRetention(oneHundredDaysAgo, 90)).toBe(true);
      // null / unlimited retention
      expect(isExpiredUnderRetention(oneHundredDaysAgo, null)).toBe(false);
    });
  });

  describe('Enterprise SSO & SCIM Service', () => {
    it('validates IdP configuration properly', () => {
      const invalid = validateIdpConfiguration({
        idpEntityId: '',
        idpSsoUrl: 'invalid-url',
        providerType: 'saml',
      });
      expect(invalid.valid).toBe(false);
      expect(invalid.errors.length).toBeGreaterThanOrEqual(2);

      const validSaml = validateIdpConfiguration({
        idpEntityId: 'http://www.okta.com/exk123',
        idpSsoUrl: 'https://acme.okta.com/app/meetit/sso/saml',
        idpCertificate: 'MIIDqjCCApKgAwIBAgIGAY...',
        providerType: 'saml',
      });
      expect(validSaml.valid).toBe(true);
    });

    it('generates, lists, and revokes SCIM tokens', () => {
      const token = generateScimToken('Azure AD SCIM Sync');
      expect(token.token.startsWith('scim_live_')).toBe(true);

      const list = loadScimTokens();
      expect(list.length).toBe(1);
      expect(list[0]?.label).toBe('Azure AD SCIM Sync');

      revokeScimToken(token.id);
      expect(loadScimTokens().length).toBe(0);
    });
  });

  describe('Bug Bounty & Vulnerability Disclosure', () => {
    it('defines standard bounty reward tiers', () => {
      expect(BOUNTY_TIERS.length).toBe(4);
      expect(BOUNTY_TIERS[0]?.severity).toBe('critical');
      expect(BOUNTY_TIERS[0]?.rangeUsd).toContain('$2,500');
    });

    it('submits a vulnerability report under safe harbor', async () => {
      const result = await submitVulnerabilityReport({
        reporterEmail: 'bounty@researcher.com',
        reporterName: 'Security Researcher',
        targetComponent: 'e2ee',
        severity: 'critical',
        title: 'Key ratchet rotation verification edge case',
        vulnerabilityDescription:
          'When participant leaves during ratchet key distribution, pending decrypt queue can be dropped without retry.',
        stepsToReproduce:
          '1. Initiate 3-peer call. 2. Advance ratchet. 3. Immediately disconnect peer 2. 4. Observe decrypt stream.',
      });

      expect(result.success).toBe(true);
      expect(result.reportId).toBeDefined();
      expect(result.message).toContain('safe harbor');
    });
  });
});
