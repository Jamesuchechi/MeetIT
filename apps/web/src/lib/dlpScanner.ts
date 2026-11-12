import type { DlpRule, DlpAction } from '@meetit/protocol';

export interface DlpViolation {
  ruleId: string;
  ruleName: string;
  category:
    'financial_cards' | 'national_id' | 'api_secrets' | 'confidential_keywords';
  matchedSnippet: string;
  action: DlpAction;
}

export interface DlpScanResult {
  hasViolation: boolean;
  blocked: boolean;
  redactedText: string;
  violations: DlpViolation[];
}

/**
 * Standard Luhn checksum algorithm for validating payment card numbers.
 */
export function validateLuhn(numStr: string): boolean {
  const digits = numStr.replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(digits)) return false;

  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits.charAt(i), 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n = n - 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

export const DEFAULT_DLP_RULES: DlpRule[] = [
  {
    id: 'dlp_cards',
    name: 'Payment Card Numbers (PCI DSS)',
    category: 'financial_cards',
    pattern:
      '\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\\b',
    action: 'block',
    enabled: true,
  },
  {
    id: 'dlp_secrets',
    name: 'API Keys & Private Secrets',
    category: 'api_secrets',
    pattern:
      '(?:sk-[a-zA-Z0-9]{20,}|gsk_[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)',
    action: 'block',
    enabled: true,
  },
  {
    id: 'dlp_national_id',
    name: 'SSN / National ID Numbers',
    category: 'national_id',
    pattern: '\\b(?:\\d{3}-\\d{2}-\\d{4}|NIN-\\d{11}|\\d{11})\\b',
    action: 'redact',
    enabled: true,
  },
  {
    id: 'dlp_confidential',
    name: 'Confidential / Classified Markings',
    category: 'confidential_keywords',
    pattern:
      '\\b(?:CONFIDENTIAL|STRICTLY RESTRICTED|INTERNAL ONLY|DO NOT SHARE)\\b',
    action: 'flag',
    enabled: true,
  },
];

/**
 * Scan text using active DLP rules.
 */
export function scanDlpContent(
  text: string,
  rules: DlpRule[] = DEFAULT_DLP_RULES,
): DlpScanResult {
  const activeRules = rules.filter((r) => r.enabled);
  const violations: DlpViolation[] = [];
  let blocked = false;
  let redactedText = text;

  for (const rule of activeRules) {
    try {
      const regex = new RegExp(rule.pattern, 'gi');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        const rawMatch = match[0];

        // Specific validator for payment cards to avoid false positives on arbitrary numbers
        if (rule.category === 'financial_cards' && !validateLuhn(rawMatch)) {
          continue;
        }

        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          matchedSnippet:
            rawMatch.length > 8
              ? `${rawMatch.slice(0, 4)}••••${rawMatch.slice(-4)}`
              : '••••',
          action: rule.action,
        });

        if (rule.action === 'block') {
          blocked = true;
        }

        if (rule.action === 'redact') {
          const replacement = `[REDACTED ${rule.category.toUpperCase()}]`;
          redactedText = redactedText.split(rawMatch).join(replacement);
        }
      }
    } catch (e) {
      console.warn(`Invalid DLP regex pattern for rule ${rule.id}:`, e);
    }
  }

  return {
    hasViolation: violations.length > 0,
    blocked,
    redactedText,
    violations,
  };
}
