import React, { useRef, useState, useEffect } from 'react';
import type { WhiteboardAction } from '@meetit/protocol';

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
            const pt = action.points[i];
            if (pt) {
              ctx.lineTo(pt.x, pt.y);
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
  }, [whiteboardHistory, isOpen]);

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
    setCurrentPoints([coords]);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const coords = getCanvasCoords(e);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    if (tool === 'pen' || tool === 'eraser') {
      const strokeColor = tool === 'eraser' ? '#171717' : color;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = tool === 'eraser' ? size * 4 : size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const lastPoint = currentPoints[currentPoints.length - 1];
      if (lastPoint) {
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
      }
      setCurrentPoints((prev) => [...prev, coords]);
    } else if (tool === 'rect' || tool === 'circle') {
      // preview live shape
      redrawAll();
      if (!startPos) return;
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
      } else {
        const radius = Math.hypot(coords.x - startPos.x, coords.y - startPos.y);
        ctx.beginPath();
        ctx.arc(startPos.x, startPos.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const coords = getCanvasCoords(e);

    if (tool === 'pen' || tool === 'eraser') {
      if (currentPoints.length > 0) {
        onSendAction({
          id: `wb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'stroke',
          color: tool === 'eraser' ? '#171717' : color,
          size: tool === 'eraser' ? size * 4 : size,
          points: [...currentPoints, coords],
          peerId: selfId,
          ts: Date.now(),
        });
      }
    } else if ((tool === 'rect' || tool === 'circle') && startPos) {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whiteboard-title"
    >
      <div className="relative w-full max-w-5xl bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden h-[90vh]">
        {/* Header toolbar */}
        <div className="flex flex-wrap items-center justify-between p-3.5 bg-neutral-950 border-b border-neutral-800 gap-3">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 font-bold">
              🎨
            </span>
            <div>
              <h2
                id="whiteboard-title"
                className="font-bold text-white text-base"
              >
                Collaborative Whiteboard
              </h2>
              <span className="text-[11px] text-neutral-400">
                Drawings are synced live across all participants
              </span>
            </div>
          </div>

          {/* Tools & Colors */}
          <div className="flex items-center gap-2 bg-neutral-900 p-1.5 rounded-2xl border border-neutral-800">
            {/* Tool buttons */}
            <button
              onClick={() => setTool('pen')}
              className={`p-2 rounded-xl text-sm transition ${
                tool === 'pen'
                  ? 'bg-indigo-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Pen"
            >
              ✏️
            </button>
            <button
              onClick={() => setTool('rect')}
              className={`p-2 rounded-xl text-sm transition ${
                tool === 'rect'
                  ? 'bg-indigo-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Rectangle"
            >
              ▭
            </button>
            <button
              onClick={() => setTool('circle')}
              className={`p-2 rounded-xl text-sm transition ${
                tool === 'circle'
                  ? 'bg-indigo-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Circle"
            >
              ◯
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`p-2 rounded-xl text-sm transition ${
                tool === 'eraser'
                  ? 'bg-indigo-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Eraser"
            >
              🧹
            </button>

            <div className="w-[1px] h-5 bg-neutral-800 mx-1" />

            {/* Colors */}
            <div className="flex items-center gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded-full border transition ${
                    color === c
                      ? 'scale-125 border-white shadow-md'
                      : 'border-neutral-700'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>

            <div className="w-[1px] h-5 bg-neutral-800 mx-1" />

            {/* Sizes */}
            <select
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="bg-neutral-800 border border-neutral-700 text-white text-xs rounded-lg px-2 py-1 focus:outline-none"
            >
              <option value={2}>Thin</option>
              <option value={4}>Medium</option>
              <option value={8}>Thick</option>
              <option value={16}>Extra</option>
            </select>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              className="text-xs px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl transition"
            >
              Clear
            </button>
            <button
              onClick={handleExportPng}
              className="text-xs px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl transition flex items-center gap-1"
            >
              <span>🖼️</span> PNG
            </button>
            <button
              onClick={handleExportPdf}
              className="text-xs px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl transition flex items-center gap-1"
            >
              <span>📄</span> PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
              aria-label="Close whiteboard"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Canvas Workspace */}
        <div className="flex-1 bg-neutral-950 p-2 overflow-hidden flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="w-full h-full object-contain bg-[#171717] rounded-2xl cursor-crosshair shadow-inner border border-neutral-800"
          />
        </div>
      </div>
    </div>
  );
}
