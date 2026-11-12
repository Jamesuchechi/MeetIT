/**
 * E2EE Short Authentication String (SAS) & Visual Verification for MeetIT.
 * Maps cryptographic fingerprints into 4 clear phonetic words and 4 visual UI icon identifiers
 * so participants can confirm their encryption keys out-of-band over audio or video using React UI icons.
 */

export type SasIconName =
  | 'shield'
  | 'zap'
  | 'waves'
  | 'key'
  | 'gem'
  | 'rocket'
  | 'flame'
  | 'sparkles'
  | 'target'
  | 'anchor'
  | 'crown'
  | 'globe'
  | 'compass'
  | 'sun'
  | 'moon'
  | 'lock';

export interface E2eeSasResult {
  sasWords: [string, string, string, string];
  sasIcons: [SasIconName, SasIconName, SasIconName, SasIconName];
  sasEmoji?: [string, string, string, string];
  fingerprint: string;
  formattedFingerprint: string;
  epoch: number;
}

// 64 phonetically distinct, simple words designed to be easily spoken across different accents
export const SAS_WORDLIST: readonly string[] = [
  'ALPHA',
  'BRAVO',
  'CEDAR',
  'DELTA',
  'EAGLE',
  'FLAME',
  'GLIDER',
  'HAVEN',
  'ISLAND',
  'JADE',
  'KINETIC',
  'LUNAR',
  'METEOR',
  'NEXUS',
  'OCEAN',
  'POLAR',
  'QUARTZ',
  'RIVER',
  'SOLAR',
  'TIGER',
  'ULTRA',
  'VALLEY',
  'WAVE',
  'ZENITH',
  'AMBER',
  'BREEZE',
  'COBALT',
  'DUNE',
  'EMBER',
  'FALCON',
  'GEYSER',
  'HORIZON',
  'INDIGO',
  'JUPITER',
  'KAPOK',
  'LAGOON',
  'MARBLE',
  'NEBULA',
  'ORBIT',
  'PRISM',
  'QUEST',
  'RADAR',
  'SUMMIT',
  'TIMBER',
  'URBAN',
  'VORTEX',
  'WIND',
  'YONDER',
  'ATLAS',
  'BEACON',
  'CANYON',
  'DAWN',
  'ECHO',
  'FROST',
  'GALAXY',
  'HARBOR',
  'IVORY',
  'JASPER',
  'KESTREL',
  'LOTUS',
  'MIRAGE',
  'NOVA',
  'OASIS',
  'PEAK',
];

// 16 distinct Lucide UI icon names for visual verification without emojis
export const SAS_ICONLIST: readonly SasIconName[] = [
  'shield',
  'zap',
  'waves',
  'key',
  'gem',
  'rocket',
  'flame',
  'sparkles',
  'target',
  'anchor',
  'crown',
  'globe',
  'compass',
  'sun',
  'moon',
  'lock',
];

/**
 * Generate 4 SAS words and 4 visual UI icons from a SHA-256 fingerprint string and epoch.
 */
export function generateSasFromFingerprint(
  fingerprintHex: string,
  epoch = 0,
): E2eeSasResult {
  const cleanHex = fingerprintHex
    .replace(/[^0-9a-fA-F]/g, '')
    .toLowerCase()
    .padEnd(32, '0');

  // Derive 4 byte indexes for words
  const w1 = parseInt(cleanHex.slice(0, 2), 16) % SAS_WORDLIST.length;
  const w2 = parseInt(cleanHex.slice(2, 4), 16) % SAS_WORDLIST.length;
  const w3 = parseInt(cleanHex.slice(4, 6), 16) % SAS_WORDLIST.length;
  const w4 = parseInt(cleanHex.slice(6, 8), 16) % SAS_WORDLIST.length;

  const sasWords: [string, string, string, string] = [
    SAS_WORDLIST[w1] ?? 'ALPHA',
    SAS_WORDLIST[w2] ?? 'RIVER',
    SAS_WORDLIST[w3] ?? 'SOLAR',
    SAS_WORDLIST[w4] ?? 'SHIELD',
  ];

  // Derive 4 distinct icon names
  const iconPool = [...SAS_ICONLIST];
  const sasIcons: [SasIconName, SasIconName, SasIconName, SasIconName] = [
    iconPool.splice(
      parseInt(cleanHex.slice(8, 10), 16) % iconPool.length,
      1,
    )[0] ?? 'shield',
    iconPool.splice(
      parseInt(cleanHex.slice(10, 12), 16) % iconPool.length,
      1,
    )[0] ?? 'zap',
    iconPool.splice(
      parseInt(cleanHex.slice(12, 14), 16) % iconPool.length,
      1,
    )[0] ?? 'waves',
    iconPool.splice(
      parseInt(cleanHex.slice(14, 16), 16) % iconPool.length,
      1,
    )[0] ?? 'key',
  ];

  // Formatted fingerprint: E2EE-XXXX-XXXX-XXXX-XXXX
  const formattedFingerprint = `E2EE-${cleanHex.slice(0, 4).toUpperCase()}-${cleanHex.slice(4, 8).toUpperCase()}-${cleanHex.slice(8, 12).toUpperCase()}-${cleanHex.slice(12, 16).toUpperCase()}`;

  return {
    sasWords,
    sasIcons,
    sasEmoji: sasIcons,
    fingerprint: cleanHex,
    formattedFingerprint,
    epoch,
  };
}

/**
 * Verify whether two participant SAS hashes match.
 */
export function verifySasMatch(
  localFingerprint: string,
  remoteFingerprint: string,
): boolean {
  const normLocal = localFingerprint.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  const normRemote = remoteFingerprint
    .replace(/[^0-9a-fA-F]/g, '')
    .toLowerCase();
  if (!normLocal || !normRemote) return false;
  return normLocal === normRemote;
}
