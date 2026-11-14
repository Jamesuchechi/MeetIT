export interface FaceLandmarkFrame {
  yaw: number;
  pitch: number;
  roll: number;
  mouthOpen: number;
  blinkLeft: number;
  blinkRight: number;
}

/**
 * Packs 6 face pose/expression parameters into 12 bytes (~1.44 kbps at 15 fps)
 * for photoreal avatar / Gaussian-splat streaming.
 */
export function encodeFaceLandmarks(frame: FaceLandmarkFrame): Uint8Array {
  const buf = new ArrayBuffer(12);
  const view = new DataView(buf);
  view.setInt16(0, Math.round(frame.yaw * 100), true);
  view.setInt16(2, Math.round(frame.pitch * 100), true);
  view.setInt16(4, Math.round(frame.roll * 100), true);
  view.setUint16(
    6,
    Math.round(Math.max(0, Math.min(1, frame.mouthOpen)) * 65535),
    true,
  );
  view.setUint16(
    8,
    Math.round(Math.max(0, Math.min(1, frame.blinkLeft)) * 65535),
    true,
  );
  view.setUint16(
    10,
    Math.round(Math.max(0, Math.min(1, frame.blinkRight)) * 65535),
    true,
  );
  return new Uint8Array(buf);
}

export function decodeFaceLandmarks(bytes: Uint8Array): FaceLandmarkFrame {
  if (bytes.byteLength < 12) {
    throw new Error(
      'Invalid face landmark packet: expected at least 12 bytes.',
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    yaw: view.getInt16(0, true) / 100,
    pitch: view.getInt16(2, true) / 100,
    roll: view.getInt16(4, true) / 100,
    mouthOpen: view.getUint16(6, true) / 65535,
    blinkLeft: view.getUint16(8, true) / 65535,
    blinkRight: view.getUint16(10, true) / 65535,
  };
}

/**
 * Frames ultra-low-bitrate neural audio codec tokens (< 3 kbps).
 * Example: 6 bytes per 20ms frame = 2,400 bps.
 */
export function packNeuralAudioFrame(
  tokens: Uint8Array,
  frameMs = 20,
): { packet: Uint8Array; bitrateBps: number } {
  const packet = new Uint8Array(2 + tokens.length);
  packet[0] = 0x4e; // 'N' magic
  packet[1] = frameMs & 0xff;
  packet.set(tokens, 2);
  const bitrateBps = Math.round(
    (packet.byteLength * 8 * 1000) / Math.max(1, frameMs),
  );
  return { packet, bitrateBps };
}

export function unpackNeuralAudioFrame(packet: Uint8Array): {
  frameMs: number;
  tokens: Uint8Array;
} {
  if (packet.byteLength < 2 || packet[0] !== 0x4e) {
    throw new Error('Invalid neural audio frame header.');
  }
  return {
    frameMs: packet[1] ?? 20,
    tokens: packet.slice(2),
  };
}

/**
 * Computes stereo/lightfield parallax view offset from commodity-camera head tracking.
 */
export function computeLightfieldViewOffset(
  headPos: { x: number; y: number; z: number },
  baselineMeters = 0.065,
): { leftEyeX: number; rightEyeX: number; parallaxScale: number } {
  const z = Math.max(0.2, headPos.z);
  const half = baselineMeters / 2;
  return {
    leftEyeX: Number((headPos.x - half).toFixed(4)),
    rightEyeX: Number((headPos.x + half).toFixed(4)),
    parallaxScale: Number((1 / z).toFixed(4)),
  };
}

/**
 * Formats a self-sovereign did:key descriptor for decentralized / offline-first mode.
 */
export function createDidKeyDescriptor(publicKeyMultibase: string): {
  did: string;
  verificationMethod: string;
} {
  const clean = publicKeyMultibase.trim();
  const did = `did:key:${clean}`;
  return {
    did,
    verificationMethod: `${did}#${clean}`,
  };
}
