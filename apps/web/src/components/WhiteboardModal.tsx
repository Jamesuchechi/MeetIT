import React, { useRef, useState, useEffect } from 'react';
import type { WhiteboardAction } from '@meetit/protocol';
import {
  Paintbrush,
  Pen,
  Square,
  Circle,
  Eraser,
  Trash2,
  Download,
  Printer,
  X,
} from 'lucide-react';

interface WhiteboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  selfId: string;
  onSendAction: (action: WhiteboardAction) => void;
  whiteboardHistory: WhiteboardAction[];
}

const COLORS = [
  '#ffffff',
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#f43f5e', // Rose
  '#06b6d4', // Cyan
  '#a855f7', // Purple
  '#000000',
];

export function WhiteboardModal({
  isOpen,
  onClose,
  selfId,
  onSendAction,
  whiteboardHistory,
}: WhiteboardModalProps) {
  if (!isOpen) return null;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<'pen' | 'rect' | 'circle' | 'eraser'>('pen');
  const [color, setColor] = useState('#6366f1');
  const [size, setSize] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<
    Array<{ x: number; y: number }>
  >([]);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Redraw canvas whenever history changes
  const redrawAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#171717';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const action of whiteboardHistory) {
      if (action.type === 'clear') {
        ctx.fillStyle = '#171717';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        continue;
      }

      ctx.strokeStyle = action.color;
      ctx.lineWidth = action.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (
        action.type === 'stroke' &&
        action.points &&
        action.points.length > 0
      ) {
        const firstPoint = action.points[0];
        if (firstPoint) {
          ctx.beginPath();
          ctx.moveTo(firstPoint.x, firstPoint.y);
          for (let i = 1; i < action.points.length; i++) {
            const p = action.points[i];
            if (p) {
              ctx.lineTo(p.x, p.y);
            }
          }
          ctx.stroke();
        }
      } else if (
        action.type === 'rect' &&
        action.points &&
        action.points.length >= 2
      ) {
        const p1 = action.points[0];
        const p2 = action.points[1];
        if (p1 && p2) {
          ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
        }
      } else if (
        action.type === 'circle' &&
        action.points &&
        action.points.length >= 2
      ) {
        const p1 = action.points[0];
        const p2 = action.points[1];
        if (p1 && p2) {
          const radius = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          ctx.beginPath();
          ctx.arc(p1.x, p1.y, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  };

  useEffect(() => {
    redrawAll();
  }, [whiteboardHistory]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    setIsDrawing(true);
    setStartPos(coords);

    if (tool === 'pen' || tool === 'eraser') {
      setCurrentPoints([coords]);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = tool === 'eraser' ? '#171717' : color;
        ctx.lineWidth = tool === 'eraser' ? size * 4 : size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(coords.x, coords.y);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const coords = getCanvasCoords(e);

    if (tool === 'pen' || tool === 'eraser') {
      setCurrentPoints((prev) => [...prev, coords]);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
      }
    } else if (startPos && (tool === 'rect' || tool === 'circle')) {
      redrawAll();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        if (tool === 'rect') {
          ctx.strokeRect(
            startPos.x,
            startPos.y,
            coords.x - startPos.x,
            coords.y - startPos.y,
          );
        } else if (tool === 'circle') {
          const radius = Math.hypot(
            coords.x - startPos.x,
            coords.y - startPos.y,
          );
          ctx.beginPath();
          ctx.arc(startPos.x, startPos.y, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const coords = getCanvasCoords(e);

    if (tool === 'pen' || tool === 'eraser') {
      const allPoints = [...currentPoints, coords];
      if (allPoints.length > 0) {
        onSendAction({
          id: `wb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'stroke',
          color: tool === 'eraser' ? '#171717' : color,
          size: tool === 'eraser' ? size * 4 : size,
          points: allPoints,
          peerId: selfId,
          ts: Date.now(),
        });
      }
    } else if (startPos && (tool === 'rect' || tool === 'circle')) {
      onSendAction({
        id: `wb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: tool,
        color,
        size,
        points: [startPos, coords],
        peerId: selfId,
        ts: Date.now(),
      });
    }

    setCurrentPoints([]);
    setStartPos(null);
  };

  const handleClear = () => {
    onSendAction({
      id: `wb-clear-${Date.now()}`,
      type: 'clear',
      color: '#000000',
      size: 1,
      peerId: selfId,
      ts: Date.now(),
    });
  };

  const handleExportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `meetit-whiteboard-${Date.now()}.png`;
    a.click();
  };

  const handleExportPdf = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head><title>MeetIT Whiteboard</title></head>
          <body style="margin:0; background:#171717; display:flex; align-items:center; justify-content:center; height:100vh;">
            <img src="${dataUrl}" style="max-width:100%; max-height:100%;" />
            <script>window.onload = function() { window.print(); window.close(); };</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <div
      className="app-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whiteboard-title"
      onClick={onClose}
    >
      <div
        className="app-modal-dialog full-canvas"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header toolbar */}
        <div
          className="app-modal-header"
          style={{ padding: '12px 18px', flexWrap: 'wrap' }}
        >
          <div className="app-modal-title-group">
            <div className="app-modal-icon">
              <Paintbrush size={18} />
            </div>
            <div>
              <h2
                id="whiteboard-title"
                className="app-modal-title"
                style={{ fontSize: '16px' }}
              >
                Collaborative Whiteboard
              </h2>
              <span className="app-modal-subtitle">
                Drawings are synced live across all participants
              </span>
            </div>
          </div>

          {/* Tools & Colors */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--bg)',
              padding: '4px 8px',
              borderRadius: '10px',
              border: '1px solid var(--line)',
            }}
          >
            {/* Tool buttons */}
            <button
              type="button"
              onClick={() => setTool('pen')}
              className={
                tool === 'pen' ? 'panel-btn-primary' : 'app-modal-close'
              }
              style={{ padding: '6px 8px' }}
              title="Pen"
            >
              <Pen size={15} />
            </button>
            <button
              type="button"
              onClick={() => setTool('rect')}
              className={
                tool === 'rect' ? 'panel-btn-primary' : 'app-modal-close'
              }
              style={{ padding: '6px 8px' }}
              title="Rectangle"
            >
              <Square size={15} />
            </button>
            <button
              type="button"
              onClick={() => setTool('circle')}
              className={
                tool === 'circle' ? 'panel-btn-primary' : 'app-modal-close'
              }
              style={{ padding: '6px 8px' }}
              title="Circle"
            >
              <Circle size={15} />
            </button>
            <button
              type="button"
              onClick={() => setTool('eraser')}
              className={
                tool === 'eraser' ? 'panel-btn-primary' : 'app-modal-close'
              }
              style={{ padding: '6px 8px' }}
              title="Eraser"
            >
              <Eraser size={15} />
            </button>

            <div
              style={{
                width: '1px',
                height: '18px',
                background: 'var(--line)',
                margin: '0 4px',
              }}
            />

            {/* Colors */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    border:
                      color === c
                        ? '2px solid var(--accent)'
                        : '1px solid var(--line)',
                    backgroundColor: c,
                    cursor: 'pointer',
                    transform: color === c ? 'scale(1.2)' : 'scale(1)',
                    transition: 'transform 0.15s ease',
                  }}
                  title={c}
                />
              ))}
            </div>

            <div
              style={{
                width: '1px',
                height: '18px',
                background: 'var(--line)',
                margin: '0 4px',
              }}
            />

            {/* Sizes */}
            <select
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="panel-select"
              style={{ padding: '4px 8px', fontSize: '12px', width: 'auto' }}
            >
              <option value={2}>Thin</option>
              <option value={4}>Medium</option>
              <option value={8}>Thick</option>
              <option value={16}>Extra</option>
            </select>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={handleClear}
              className="panel-btn-secondary"
              style={{ padding: '5px 10px', fontSize: '12px' }}
            >
              <Trash2 size={13} /> Clear
            </button>
            <button
              type="button"
              onClick={handleExportPng}
              className="panel-btn-secondary"
              style={{ padding: '5px 10px', fontSize: '12px' }}
              title="Export as PNG image"
            >
              <Download size={13} /> PNG
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="panel-btn-secondary"
              style={{ padding: '5px 10px', fontSize: '12px' }}
              title="Print or save PDF"
            >
              <Printer size={13} /> PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="app-modal-close"
              aria-label="Close whiteboard"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Canvas viewport */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            background: '#171717',
            overflow: 'hidden',
          }}
        >
          <canvas
            ref={canvasRef}
            width={1920}
            height={1080}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => setIsDrawing(false)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              cursor: tool === 'eraser' ? 'cell' : 'crosshair',
            }}
          />
        </div>
      </div>
    </div>
  );
}
