/**
 * WebRTC Encoded Transform (Insertable Streams) SFrame / AES-GCM Frame Processor.
 * Encrypts and decrypts audio/video media frames before network transmission and after reception.
 */

import type { E2eeKeyManager } from './e2eeKeyManager.js';

const MAGIC_BYTE = 0xe2;
const VERSION_BYTE = 0x01;
const HEADER_SIZE = 20; // 1 magic + 1 version + 2 epoch + 4 seq + 12 IV

export interface RTCEncodedFrameLike {
  data: ArrayBuffer;
  timestamp: number;
  type?: 'key' | 'delta' | 'empty';
  getMetadata?: () => Record<string, unknown>;
}

export function hasInsertableStreamsSupport(): boolean {
  if (typeof window === 'undefined') return false;
  const hasSenderStreams =
    typeof RTCRtpSender !== 'undefined' &&
    ('createEncodedStreams' in RTCRtpSender.prototype ||
      'transform' in RTCRtpSender.prototype);
  const hasReceiverStreams =
    typeof RTCRtpReceiver !== 'undefined' &&
    ('createEncodedStreams' in RTCRtpReceiver.prototype ||
      'transform' in RTCRtpReceiver.prototype);
  return Boolean(hasSenderStreams && hasReceiverStreams);
}

let globalFrameCounter = 0;

/**
 * Builds a deterministic 12-byte IV for AES-GCM from epoch and frame counter.
 */
function buildIv(epoch: number, counter: number): Uint8Array {
  const iv = new Uint8Array(12);
  const view = new DataView(iv.buffer);
  view.setUint16(0, epoch, false);
  view.setUint32(2, counter, false);
  // Trailing 6 bytes are deterministic random-fill
  iv[6] = 0x4d;
  iv[7] = 0x65;
  iv[8] = 0x65;
  iv[9] = 0x74;
  iv[10] = 0x49;
  iv[11] = 0x54;
  return iv;
}

/**
 * Encrypts a raw media frame using AES-GCM and prepends the SFrame header.
 */
export async function encryptFrameData(
  rawBuffer: ArrayBuffer,
  key: CryptoKey,
  epoch: number,
  counter: number,
): Promise<ArrayBuffer> {
  const cryptoSubtle = globalThis.crypto?.subtle;
  if (!cryptoSubtle) {
    return rawBuffer;
  }

  const iv = buildIv(epoch, counter);
  const ciphertextBuffer = await cryptoSubtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    rawBuffer,
  );

  const out = new Uint8Array(HEADER_SIZE + ciphertextBuffer.byteLength);
  const headerView = new DataView(out.buffer);
  headerView.setUint8(0, MAGIC_BYTE);
  headerView.setUint8(1, VERSION_BYTE);
  headerView.setUint16(2, epoch, false);
  headerView.setUint32(4, counter, false);
  out.set(iv, 8);
  out.set(new Uint8Array(ciphertextBuffer), HEADER_SIZE);

  return out.buffer;
}

/**
 * Decrypts an encrypted media frame using the key manager matching the frame's epoch.
 */
export async function decryptFrameData(
  encBuffer: ArrayBuffer,
  keyManager: E2eeKeyManager,
): Promise<ArrayBuffer> {
  const encBytes = new Uint8Array(encBuffer);
  if (encBytes.length < HEADER_SIZE + 16) {
    // Too small to be an encrypted frame, return as is
    return encBuffer;
  }

  const view = new DataView(encBuffer);
  const magic = view.getUint8(0);
  const version = view.getUint8(1);
  if (magic !== MAGIC_BYTE || version !== VERSION_BYTE) {
    // Unencrypted or incompatible frame pass-through
    return encBuffer;
  }

  const epoch = view.getUint16(2, false);
  const iv = encBytes.subarray(8, 20);
  const ciphertext = encBytes.subarray(HEADER_SIZE);

  const key = await keyManager.getKeyForEpoch(epoch);
  if (!key) {
    // Key for this epoch not yet available, return buffer
    return encBuffer;
  }

  const cryptoSubtle = globalThis.crypto?.subtle;
  if (!cryptoSubtle) {
    return encBuffer;
  }

  try {
    const decryptedBuffer = await cryptoSubtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource,
    );
    return decryptedBuffer;
  } catch (err) {
    // Failed decryption (e.g. tag mismatch or corrupt frame)
    return encBuffer;
  }
}

/**
 * Creates a TransformStream for encrypting outbound WebRTC encoded frames.
 */
export function createEncryptionTransform(
  keyManager: E2eeKeyManager,
): TransformStream {
  return new TransformStream({
    async transform(frame: RTCEncodedFrameLike, controller) {
      const key = await keyManager.getCurrentKey();
      if (!key) {
        controller.enqueue(frame);
        return;
      }

      try {
        const counter = ++globalFrameCounter;
        const encryptedData = await encryptFrameData(
          frame.data,
          key,
          keyManager.getEpoch(),
          counter,
        );
        frame.data = encryptedData;
        controller.enqueue(frame);
      } catch (e) {
        // Enqueue unmodified frame on transform failure to prevent pipeline stall
        controller.enqueue(frame);
      }
    },
  });
}

/**
 * Creates a TransformStream for decrypting inbound WebRTC encoded frames.
 */
export function createDecryptionTransform(
  keyManager: E2eeKeyManager,
): TransformStream {
  return new TransformStream({
    async transform(frame: RTCEncodedFrameLike, controller) {
      try {
        const decryptedData = await decryptFrameData(frame.data, keyManager);
        frame.data = decryptedData;
        controller.enqueue(frame);
      } catch (e) {
        controller.enqueue(frame);
      }
    },
  });
}

/**
 * Attaches the E2EE encryption transform to an RTCRtpSender.
 */
export function attachSenderE2ee(
  sender: RTCRtpSender,
  keyManager: E2eeKeyManager,
): boolean {
  try {
    const anySender = sender as unknown as {
      createEncodedStreams?: () => {
        readable: ReadableStream;
        writable: WritableStream;
      };
    };
    if (typeof anySender.createEncodedStreams === 'function') {
      const { readable, writable } = anySender.createEncodedStreams();
      const transform = createEncryptionTransform(keyManager);
      void readable.pipeThrough(transform).pipeTo(writable);
      return true;
    }
  } catch (e) {
    // Error or unsupported
  }
  return false;
}

/**
 * Attaches the E2EE decryption transform to an RTCRtpReceiver.
 */
export function attachReceiverE2ee(
  receiver: RTCRtpReceiver,
  keyManager: E2eeKeyManager,
): boolean {
  try {
    const anyReceiver = receiver as unknown as {
      createEncodedStreams?: () => {
        readable: ReadableStream;
        writable: WritableStream;
      };
    };
    if (typeof anyReceiver.createEncodedStreams === 'function') {
      const { readable, writable } = anyReceiver.createEncodedStreams();
      const transform = createDecryptionTransform(keyManager);
      void readable.pipeThrough(transform).pipeTo(writable);
      return true;
    }
  } catch (e) {
    // Error or unsupported
  }
  return false;
}
