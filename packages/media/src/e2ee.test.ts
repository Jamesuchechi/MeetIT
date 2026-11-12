import { describe, expect, it } from 'vitest';
import { E2eeKeyManager } from './e2eeKeyManager.js';
import {
  SAS_EMOJILIST,
  SAS_WORDLIST,
  generateSasFromFingerprint,
  verifySasMatch,
} from './e2eeVerification.js';
import {
  decryptFrameData,
  encryptFrameData,
  hasInsertableStreamsSupport,
} from './e2eeTransform.js';

describe('E2EE Key Ratchet & Session Management', () => {
  it('manages key ratchet epochs and derives valid CryptoKeys', async () => {
    const keyManager = new E2eeKeyManager('test-room-master-secret-12345');
    expect(keyManager.getEpoch()).toBe(0);

    const key0 = await keyManager.getCurrentKey();
    expect(key0).toBeDefined();
    expect(key0?.algorithm.name).toBe('AES-GCM');

    // Advancing epoch rotates epoch counter and derives new key
    const newEpoch = await keyManager.advanceEpoch();
    expect(newEpoch).toBe(1);
    expect(keyManager.getEpoch()).toBe(1);

    const key1 = await keyManager.getCurrentKey();
    expect(key1).toBeDefined();

    // Fingerprint generation
    const fp1 = await keyManager.getFingerprint();
    expect(fp1).toBeDefined();
    expect(fp1.length).toBe(64); // 32-byte SHA-256 hex string
  });
});

describe('E2EE SAS Verification & Fingerprints', () => {
  it('generates 4 phonetic words and 4 visual emojis from fingerprint', () => {
    const fakeFp =
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const sas = generateSasFromFingerprint(fakeFp, 0);

    expect(sas.sasWords).toHaveLength(4);
    expect(sas.sasEmoji).toHaveLength(4);
    expect(sas.epoch).toBe(0);
    expect(sas.formattedFingerprint.startsWith('E2EE-')).toBe(true);

    // Words and emojis belong to allowed lists
    sas.sasWords.forEach((word) => {
      expect(SAS_WORDLIST).toContain(word);
    });
    sas.sasEmoji.forEach((emoji) => {
      expect(SAS_EMOJILIST).toContain(emoji);
    });
  });

  it('correctly matches and verifies SAS fingerprints', () => {
    const fpA = '4a8a08f09d37b73795649038408b5f33';
    const fpB = '4A8A08F09D37B73795649038408B5F33'; // case insensitive
    const fpDiff = '11223344556677889900aabbccddeeff';

    expect(verifySasMatch(fpA, fpB)).toBe(true);
    expect(verifySasMatch(fpA, fpDiff)).toBe(false);
  });
});

describe('E2EE WebRTC Encoded Transform (SFrame / AES-GCM)', () => {
  it('detects insertable streams support safely', () => {
    // In node environment, window is undefined or RTCRtpSender is absent
    const supported = hasInsertableStreamsSupport();
    expect(typeof supported).toBe('boolean');
  });

  it('encrypts and decrypts media frame buffer with header preservation', async () => {
    const keyManager = new E2eeKeyManager(
      'confidential-voice-and-video-secret',
    );
    const key = await keyManager.getCurrentKey();
    expect(key).toBeDefined();
    if (!key) return;

    // Simulate an encoded audio/video frame payload
    const originalText = 'WebRTC-Opus-Audio-Frame-Packet-Bytes-0102030405';
    const rawBuffer = new TextEncoder().encode(originalText).buffer;

    // Encrypt frame
    const encryptedBuffer = await encryptFrameData(rawBuffer, key, 0, 101);
    expect(encryptedBuffer.byteLength).toBeGreaterThan(rawBuffer.byteLength);

    // Verify SFrame header
    const headerView = new DataView(encryptedBuffer);
    expect(headerView.getUint8(0)).toBe(0xe2); // magic byte
    expect(headerView.getUint8(1)).toBe(0x01); // version byte
    expect(headerView.getUint16(2, false)).toBe(0); // epoch
    expect(headerView.getUint32(4, false)).toBe(101); // frame counter

    // Decrypt frame
    const decryptedBuffer = await decryptFrameData(encryptedBuffer, keyManager);
    const decryptedText = new TextDecoder().decode(decryptedBuffer);
    expect(decryptedText).toBe(originalText);
  });
});
