import React, { useState, useEffect, useRef } from 'react';
import { MindmapNode, MindmapPayload } from '../types';

interface MindmapProps {
  data: MindmapPayload | undefined;
  onChange: (data: MindmapPayload) => void;
}

export default function Mindmap({ data, onChange }: MindmapProps) {
  const [nodes, setNodes] = useState<MindmapNode[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (data?.nodes && data.nodes.length > 0) {
      setNodes(data.nodes);
    } else {
      // Default structure
      setNodes([{ id: 'root', label: '中心主题', parentId: null, x: window.innerWidth / 2 || 400, y: window.innerHeight / 2 || 300 }]);
    }
  }, [data]);

  // Handle saving
  useEffect(() => {
    if (nodes.length > 0 && nodes !== data?.nodes) {
      const timeoutId = setTimeout(() => {
        onChange({ nodes });
      }, 500); // debounce save
      return () => clearTimeout(timeoutId);
    }
  }, [nodes]);

  const addNode = (parentId: string, direction?: 'left' | 'right') => {
    const parent = nodes.find(n => n.id === parentId);
    if (!parent) return;
    
    // Determine offset
    const isRight = direction === 'right' || (parent.direction === 'right') || (!parent.direction && Math.random() > 0.5);
    const newDir = isRight ? 'right' : 'left';
    const offsetX = isRight ? 200 : -200;
    const countSameParent = nodes.filter(n => n.parentId === parentId).length;
    const offsetY = (countSameParent * 60) - 30; // spread vertically

    const newNode: MindmapNode = {
      id: `node_${Math.random().toString(36).substr(2, 9)}`,
      label: '子节点',
      parentId,
      direction: newDir as 'left' | 'right',
      x: (parent.x || 0) + offsetX,
      y: (parent.y || 0) + offsetY,
    };
    
    setNodes([...nodes, newNode]);
  };

  const updateNodeLabel = (id: string, label: string) => {
    setNodes(nodes.map(n => n.id === id ? { ...n, label } : n));
  };

  const removeNode = (id: string) => {
    if (id === 'root') return;
    // Recursive delete
    const idsToRemove = new Set([id]);
    let added = true;
    while (added) {
      added = false;
      nodes.forEach(n => {
        if (n.parentId && idsToRemove.has(n.parentId) && !idsToRemove.has(n.id)) {
          idsToRemove.add(n.id);
          added = true;
        }
      });
    }
    setNodes(nodes.filter(n => !idsToRemove.has(n.id)));
  };

  const handleDragEnd = (id: string, x: number, y: number) => {
    setNodes(nodes.map(n => n.id === id ? { ...n, x, y } : n));
  };

  return (
    <div className="flex-1 w-full h-full relative bg-slate-950 overflow-auto" ref={containerRef}>
      <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ minWidth: '2000px', minHeight: '2000px' }}>
        {nodes.map(node => {
          if (!node.parentId) return null;
          const parent = nodes.find(n => n.id === node.parentId);
          if (!parent) return null;
          
          const px = parent.x || 0;
          const py = parent.y || 0;
          const nx = node.x || 0;
          const ny = node.y || 0;
          
          let d = "";
          if (node.direction === "right") {
            const controlX1 = px + 90;
            const controlX2 = nx - 90;
            d = `M ${px} ${py} C ${controlX1} ${py}, ${controlX2} ${ny}, ${nx} ${ny}`;
          } else {
            const controlX1 = px - 90;
            const controlX2 = nx + 90;
            d = `M ${px} ${py} C ${controlX1} ${py}, ${controlX2} ${ny}, ${nx} ${ny}`;
          }
          
          return (
            <path key={`edge_${node.id}`} d={d} stroke="#4f46e5" strokeWidth="2" fill="none" className="opacity-50" />
          );
        })}
      </svg>
      
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ minWidth: '2000px', minHeight: '2000px' }}>
        {nodes.map(node => (
          <DraggableNode 
            key={node.id} 
            node={node} 
            onUpdate={updateNodeLabel} 
            onAdd={addNode} 
            onRemove={removeNode} 
            onDragEnd={handleDragEnd} 
          />
        ))}
      </div>
    </div>
  );
}

function DraggableNode({ node, onUpdate, onAdd, onRemove, onDragEnd }: any) {
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState({ x: node.x, y: node.y });
  
  useEffect(() => { setPos({ x: node.x, y: node.y }); }, [node.x, node.y]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only drag on non-input
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setPos({ x: pos.x + e.movementX, y: pos.y + e.movementY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onDragEnd(node.id, pos.x, pos.y);
  };

  const isRoot = node.id === 'root';

  return (
    <div 
      className={`absolute pointer-events-auto flex items-center justify-center transform -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-lg transition-colors group ${isRoot ? 'bg-indigo-600 border-indigo-400 text-white z-10 p-3' : 'bg-slate-800 border-slate-600 text-slate-200 z-0 p-2'}`}
      style={{ left: pos.x, top: pos.y, cursor: isDragging ? 'grabbing' : 'grab' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {!isRoot && (
        <button onClick={() => onRemove(node.id)} className="absolute -top-3 -right-3 w-5 h-5 bg-rose-600 text-white rounded-full text-xs font-bold leading-none flex items-center justify-center hover:bg-rose-500 scale-0 group-hover:scale-100 transition-transform">×</button>
      )}
      
      {isRoot && <button onClick={() => onAdd(node.id, 'left')} className="absolute -left-6 bg-indigo-500 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold hover:bg-indigo-400">+</button>}
      
      <input 
        value={node.label}
        onChange={e => onUpdate(node.id, e.target.value)}
        className={`bg-transparent outline-none border-none text-center font-bold ${isRoot ? 'w-24 text-sm' : 'w-20 text-xs'}`}
      />
      
      {isRoot ? (
        <button onClick={() => onAdd(node.id, 'right')} className="absolute -right-6 bg-indigo-500 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold hover:bg-indigo-400">+</button>
      ) : (
        <button onClick={() => onAdd(node.id, node.direction)} className={`absolute ${node.direction === 'right' ? '-right-6' : '-left-6'} bg-slate-700 border border-slate-600 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold hover:bg-slate-600`}>+</button>
      )}
    </div>
  );
}
