import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

import {
  exportAuditLogsAsCsv,
  exportAuditLogsAsJson,
  getAuditLogs,
  logAuditEvent,
} from './auditService.js';
import { generateUserDataExport } from './dataExportService.js';
import {
  generateBase32Secret,
  generateBackupCodes,
  verify2FaCode,
  enableTwoFactor,
  disableTwoFactor,
} from './twoFactorService.js';
import {
  getActiveSessions,
  revokeAllOtherSessions,
} from './sessionManagerService.js';
import {
  getDataResidencyRegion,
  setDataResidencyRegion,
  SOC2_CONTROLS_CHECKLIST,
  SUBPROCESSORS_REGISTRY,
  generateStandardDpaText,
} from './complianceService.js';
import { submitAbuseReport } from './abuseReportService.js';

describe('Security & Compliance Services (Phase 10)', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const mockStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
      get length() {
        return Object.keys(store).length;
      },
    };

    vi.stubGlobal('localStorage', mockStorage);
    vi.stubGlobal('sessionStorage', mockStorage);
  });

  describe('Audit Logging Engine', () => {
    it('logs structured events and filters them correctly', async () => {
      await logAuditEvent({
        action: 'room.lock',
        targetType: 'room',
        targetId: 'abc-defg-hij',
        metadata: { reason: 'Host privacy lock' },
      });

      await logAuditEvent({
        action: 'recording.start',
        targetType: 'recording',
        targetId: 'rec_123',
      });

      const logs = await getAuditLogs();
      expect(logs.length).toBe(2);

      const lockedOnly = await getAuditLogs({ action: 'room.lock' });
      expect(lockedOnly.length).toBe(1);
      expect(lockedOnly[0]?.targetId).toBe('abc-defg-hij');

      // Check CSV and JSON exports
      const csv = exportAuditLogsAsCsv(logs);
      expect(csv).toContain('room.lock');
      expect(csv).toContain('recording.start');

      const json = exportAuditLogsAsJson(logs);
      expect(JSON.parse(json).length).toBe(2);
    });
  });

  describe('Two-Factor Authentication (TOTP) & Backup Codes', () => {
    it('generates base32 secret and 10 backup codes', () => {
      const secret = generateBase32Secret(16);
      expect(secret).toHaveLength(16);
      expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);

      const codes = generateBackupCodes(10);
      expect(codes).toHaveLength(10);
      codes.forEach((c) => {
        expect(c).toMatch(/^\d{4}-\d{4}$/);
      });
    });

    it('enables 2FA and validates codes and consumes backup codes', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const backupCodes = ['1234-5678', '9876-5432'];
      const cfg = enableTwoFactor(secret, backupCodes, 'user_1');
      expect(cfg.enabled).toBe(true);
      expect(cfg.backupCodesCount).toBe(2);

      // Verify numeric 6-digit code
      expect(verify2FaCode('123456', secret, backupCodes).valid).toBe(true);
      expect(verify2FaCode('bad', secret, backupCodes).valid).toBe(false);

      // Verify and consume backup code
      const result = verify2FaCode('1234-5678', secret, backupCodes);
      expect(result.valid).toBe(true);
      expect(result.usedBackupCode).toBe(true);

      // Disable 2FA
      disableTwoFactor('user_1');
    });
  });

  describe('Active Sessions Manager', () => {
    it('retrieves active sessions and revokes sessions', () => {
      const sessions = getActiveSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(1);

      const updated = revokeAllOtherSessions('user_1');
      expect(updated.length).toBe(1);
      expect(updated[0]?.current).toBe(true);
    });
  });

  describe('Compliance & Data Residency', () => {
    it('stores and retrieves data residency regions', () => {
      expect(getDataResidencyRegion()).toBe('eu-central-1');
      setDataResidencyRegion('af-south-1', 'user_1');
      expect(getDataResidencyRegion()).toBe('af-south-1');
    });

    it('exports SOC2 controls checklist and subprocessor registry', () => {
      expect(SOC2_CONTROLS_CHECKLIST.length).toBeGreaterThan(5);
      expect(SUBPROCESSORS_REGISTRY.length).toBeGreaterThan(3);

      const dpa = generateStandardDpaText('Acme Corp');
      expect(dpa).toContain('Acme Corp');
      expect(dpa).toContain('GDPR');
      expect(dpa).toContain('NDPR');
    });
  });

  describe('GDPR Data Export & Abuse Reporting', () => {
    it('generates machine-readable GDPR user data export bundle', async () => {
      const exportBundle = await generateUserDataExport('user_test_123');
      expect(exportBundle.exportMetadata).toBeDefined();
      expect(exportBundle.exportMetadata.complianceFrameworks).toContain(
        'GDPR (Art. 20 Data Portability)',
      );
      expect(Array.isArray(exportBundle.rooms)).toBe(true);
      expect(Array.isArray(exportBundle.auditLogs)).toBe(true);
    });

    it('submits in-meeting abuse report', async () => {
      const res = await submitAbuseReport(
        {
          reportedPeerId: 'peer_offender',
          roomCode: 'abc-defg-hij',
          category: 'harassment',
          details: 'Intentionally playing loud audio',
          timestamp: Date.now(),
        },
        'reporter_1',
      );

      expect(res.success).toBe(true);
    });
  });
});
