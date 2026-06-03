import React, { useEffect, useRef, useState } from 'react';

export type StrokeType = 'pen' | 'rect' | 'circle' | 'eraser' | 'line';

export interface StrokePath {
  id: string;
  type: StrokeType;
  color: string;
  lineWidth: number;
  points?: {x: number; y: number}[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface WhiteboardProps {
  paths: StrokePath[];
  onChange: (paths: StrokePath[]) => void;
}

export default function Whiteboard({ paths, onChange }: WhiteboardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<StrokeType>('pen');
  const [color, setColor] = useState('#818cf8'); // indigo-400
  const lineWidth = 3;
  const [currentStroke, setCurrentStroke] = useState<StrokePath | null>(null);

  // Resize canvas to match container dynamically
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        // Debounced resize to avoid flickering
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
        redraw();
      }
    };
    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 50); // initial sizing
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Redraw all strokes
  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const drawPath = (stroke: StrokePath) => {
      ctx.beginPath();
      ctx.strokeStyle = stroke.type === 'eraser' ? '#020617' : stroke.color; // eraser uses app background color
      ctx.lineWidth = stroke.type === 'eraser' ? stroke.lineWidth * 3 : stroke.lineWidth;

      if (stroke.type === 'pen' || stroke.type === 'eraser') {
        if (!stroke.points || stroke.points.length === 0) return;
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      } else if (stroke.type === 'rect') {
        if (stroke.x !== undefined && stroke.y !== undefined && stroke.width !== undefined && stroke.height !== undefined) {
          ctx.strokeRect(stroke.x, stroke.y, stroke.width, stroke.height);
        }
      } else if (stroke.type === 'circle') {
        if (stroke.x !== undefined && stroke.y !== undefined && stroke.width !== undefined && stroke.height !== undefined) {
          const rx = stroke.width / 2;
          const ry = stroke.height / 2;
          ctx.beginPath();
          ctx.ellipse(stroke.x + rx, stroke.y + ry, Math.abs(rx), Math.abs(ry), 0, 0, 2 * Math.PI);
          ctx.stroke();
        }
      } else if (stroke.type === 'line') {
        if (stroke.x !== undefined && stroke.y !== undefined && stroke.width !== undefined && stroke.height !== undefined) {
          ctx.beginPath();
          ctx.moveTo(stroke.x, stroke.y);
          ctx.lineTo(stroke.x + stroke.width, stroke.y + stroke.height);
          ctx.stroke();
        }
      }
    };

    paths.forEach(drawPath);
    if (currentStroke) drawPath(currentStroke);
  };

  useEffect(() => {
    redraw();
  }, [paths, currentStroke]);

  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const { x, y } = getCoords(e);
    setIsDrawing(true);

    setCurrentStroke({
      id: `shape_${Math.random().toString(36).substr(2, 9)}`,
      type: tool,
      color,
      lineWidth,
      points: (tool === 'pen' || tool === 'eraser') ? [{ x, y }] : undefined,
      x: (tool === 'rect' || tool === 'circle' || tool === 'line') ? x : undefined,
      y: (tool === 'rect' || tool === 'circle' || tool === 'line') ? y : undefined,
      width: 0,
      height: 0
    });
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing || !currentStroke) return;
    const { x, y } = getCoords(e);

    if (tool === 'pen' || tool === 'eraser') {
      setCurrentStroke({
        ...currentStroke,
        points: [...(currentStroke.points || []), { x, y }]
      });
    } else if (tool === 'rect' || tool === 'circle' || tool === 'line') {
      setCurrentStroke({
        ...currentStroke,
        width: x - (currentStroke.x || 0),
        height: y - (currentStroke.y || 0)
      });
    }
  };

  const handleEnd = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing || !currentStroke) return;
    setIsDrawing(false);
    onChange([...paths, currentStroke]);
    setCurrentStroke(null);
  };

  const undo = () => {
    if (paths.length > 0) {
      onChange(paths.slice(0, -1));
    }
  };

  const clear = () => {
    if (confirm('确定要清空画布吗？')) {
      onChange([]);
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center justify-between bg-slate-900 border-b border-slate-800 p-2 shrink-0">
        <div className="flex flex-wrap gap-1 md:gap-2">
          {['pen', 'line', 'rect', 'circle', 'eraser'].map(t => (
            <button
              key={t}
              onClick={() => setTool(t as StrokeType)}
              className={`px-3 py-1 rounded text-xs font-bold transition-colors ${tool === t ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              {t === 'pen' ? '✏️ 画笔' : t === 'line' ? '📏 直线' : t === 'eraser' ? '🧽 橡皮' : t === 'rect' ? '⬛️ 矩形' : '⭕️ 圆形'}
            </button>
          ))}
          {tool !== 'eraser' && (
            <input 
              type="color" 
              value={color} 
              onChange={e => setColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-none bg-transparent"
            />
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={undo} className="px-3 py-1 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded text-xs font-bold">撤销</button>
          <button onClick={clear} className="px-3 py-1 bg-rose-900/30 text-rose-400 hover:bg-rose-800/50 border border-rose-800/50 rounded text-xs font-bold">清空</button>
        </div>
      </div>
      
      <div ref={containerRef} className="flex-1 bg-slate-950 relative overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseOut={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          className="w-full h-full cursor-crosshair absolute top-0 left-0 block"
        />
      </div>
    </div>
  );
}
