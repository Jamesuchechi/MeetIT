import {
  checkWebXRSupport,
  computeLightfieldViewOffset,
  decodeFaceLandmarks,
  encodeFaceLandmarks,
  generateDidKeyIdentity,
  requestWebXRSession,
  ServerlessLocalMesh,
} from '@meetit/media';
import { useEffect, useRef, useState } from 'react';

export function Phase13ExperimentalWidgets({
  roomCode,
  latestCaption,
}: {
  roomCode: string;
  latestCaption?: string;
}) {
  // 1. Avatar Landmarks state
  const avatarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mouthOpen, setMouthOpen] = useState(0.25);
  const [headYaw, setHeadYaw] = useState(0);

  useEffect(() => {
    const canvas = avatarCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const packet = encodeFaceLandmarks({
      yaw: headYaw,
      pitch: 0,
      roll: headYaw * 0.15,
      mouthOpen,
      blinkLeft: 0.05,
      blinkRight: 0.05,
    });
    const decoded = decodeFaceLandmarks(packet);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2 + decoded.yaw * 14;
    const cy = canvas.height / 2 + decoded.pitch * 10;

    // Shaded head
    const grad = ctx.createRadialGradient(cx - 8, cy - 10, 6, cx, cy, 38);
    grad.addColorStop(0, '#fcd5b5');
    grad.addColorStop(1, '#d99b72');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 28, 34, decoded.roll, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#1e293b';
    const eyeY = cy - 6;
    ctx.beginPath();
    ctx.ellipse(
      cx - 10,
      eyeY,
      3.5,
      Math.max(1, 3.5 * (1 - decoded.blinkLeft)),
      0,
      0,
      Math.PI * 2,
    );
    ctx.ellipse(
      cx + 10,
      eyeY,
      3.5,
      Math.max(1, 3.5 * (1 - decoded.blinkRight)),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Mouth driven by decoded 12-byte landmark packet
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 14, 9, 2 + decoded.mouthOpen * 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }, [mouthOpen, headYaw]);

  // 2. Lightfield Parallax state
  const lightfieldCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = lightfieldCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const view = computeLightfieldViewOffset({
      x: pointerPos.x,
      y: pointerPos.y,
      z: 0.55,
    });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Multi-plane stereo parallax layers
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.strokeStyle = 'rgba(56,189,248,0.45)';
    ctx.strokeRect(
      cx - 34 + view.leftEyeX * 40,
      cy - 22 + pointerPos.y * 12,
      68,
      44,
    );
    ctx.strokeStyle = 'rgba(244,114,182,0.45)';
    ctx.strokeRect(
      cx - 34 + view.rightEyeX * 40,
      cy - 22 + pointerPos.y * 12,
      68,
      44,
    );
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '10px sans-serif';
    ctx.fillText(`Parallax ${view.parallaxScale}x`, 8, 14);
  }, [pointerPos]);

  // 3. Sign-Language Avatar state
  const signCanvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = signCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const text = (latestCaption || 'Ready').slice(-18);
    const seed = text.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const leftAngle = ((seed % 60) - 30) * (Math.PI / 180);
    const rightAngle = (((seed * 3) % 60) - 30) * (Math.PI / 180);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Torso & head
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, 24, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(canvas.width / 2 - 14, 38, 28, 34);

    // Animated signing arms
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - 14, 44);
    ctx.lineTo(
      canvas.width / 2 - 32 + Math.sin(leftAngle) * 12,
      58 + Math.cos(leftAngle) * 10,
    );
    ctx.moveTo(canvas.width / 2 + 14, 44);
    ctx.lineTo(
      canvas.width / 2 + 32 + Math.sin(rightAngle) * 12,
      58 - Math.cos(rightAngle) * 10,
    );
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '10px sans-serif';
    ctx.fillText(text, 8, canvas.height - 6);
  }, [latestCaption]);

  // 4. WebXR & did:key Decentralized Mesh state
  const [xrStatus, setXrStatus] = useState<string>('Checking WebXR...');
  const [didStatus, setDidStatus] = useState<string>('');

  useEffect(() => {
    void checkWebXRSupport().then((ok) =>
      setXrStatus(
        ok
          ? 'WebXR headset ready'
          : 'WebXR headset not detected (3D fallback active)',
      ),
    );
  }, []);

  const handleLaunchXr = async () => {
    const session = await requestWebXRSession();
    setXrStatus(
      session
        ? 'WebXR immersive-vr session active'
        : 'WebXR session unavailable in this browser',
    );
  };

  const handleInitDidMesh = async () => {
    try {
      const id = await generateDidKeyIdentity();
      const mesh = new ServerlessLocalMesh(roomCode);
      mesh.send({
        type: 'announce',
        fromDid: id.did,
        payload: { ts: Date.now() },
      });
      mesh.close();
      setDidStatus(`${id.did.slice(0, 26)}… (local mesh announced)`);
    } catch {
      setDidStatus('WebCrypto did:key unavailable');
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gap: 10,
        padding: 10,
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.03)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>
        Phase 13 Experimental Renderers (Avatar · Lightfield · Sign Avatar ·
        WebXR / DID)
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
        }}
      >
        <div>
          <canvas
            ref={avatarCanvasRef}
            width={150}
            height={100}
            style={{ width: '100%', borderRadius: 8 }}
          />
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <input
              type="range"
              min={-0.6}
              max={0.6}
              step={0.05}
              value={headYaw}
              onChange={(e) => setHeadYaw(Number(e.target.value))}
              title="Avatar yaw"
              style={{ width: '50%' }}
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={mouthOpen}
              onChange={(e) => setMouthOpen(Number(e.target.value))}
              title="Avatar mouth"
              style={{ width: '50%' }}
            />
          </div>
        </div>

        <div>
          <canvas
            ref={lightfieldCanvasRef}
            width={150}
            height={100}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setPointerPos({
                x: ((e.clientX - rect.left) / rect.width - 0.5) * 0.2,
                y: ((e.clientY - rect.top) / rect.height - 0.5) * 0.2,
              });
            }}
            style={{ width: '100%', borderRadius: 8, cursor: 'crosshair' }}
          />
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
            Lightfield parallax (move cursor)
          </div>
        </div>

        <div>
          <canvas
            ref={signCanvasRef}
            width={150}
            height={100}
            style={{ width: '100%', borderRadius: 8 }}
          />
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
            Sign-language avatar
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          onClick={() => void handleLaunchXr()}
          style={{
            padding: '5px 10px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(59,130,246,0.2)',
            color: '#fff',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Launch WebXR
        </button>
        <span style={{ fontSize: 11, opacity: 0.8 }}>{xrStatus}</span>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          onClick={() => void handleInitDidMesh()}
          style={{
            padding: '5px 10px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(16,185,129,0.2)',
            color: '#fff',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Init did:key P2P Mesh
        </button>
        {didStatus && (
          <span style={{ fontSize: 11, opacity: 0.8 }}>{didStatus}</span>
        )}
      </div>
    </div>
  );
}
