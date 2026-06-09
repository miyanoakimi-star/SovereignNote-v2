import React, { useState, useEffect, useRef } from 'react';
import { MindmapNode, MindmapPayload } from '../types';
import { FileDown, Upload } from 'lucide-react';

interface MindmapProps {
  data: MindmapPayload | undefined;
  onChange: (data: MindmapPayload) => void;
  title?: string;
}

export default function Mindmap({ data, onChange, title: activeNoteTitle }: MindmapProps) {
  const [nodes, setNodes] = useState<MindmapNode[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (data?.nodes && data.nodes.length > 0) {
      if (JSON.stringify(data.nodes) !== JSON.stringify(nodes)) {
        setNodes(data.nodes);
      }
    } else {
      // Default structure
      const defaultRoot = [{ id: 'root', label: '中心主题', parentId: null, x: window.innerWidth / 2 || 400, y: window.innerHeight / 2 || 300 }];
      if (JSON.stringify(nodes) !== JSON.stringify(defaultRoot)) {
        setNodes(defaultRoot);
      }
    }
  }, [data]);

  // Handle saving with structural comparison
  useEffect(() => {
    if (nodes.length > 0 && JSON.stringify(nodes) !== JSON.stringify(data?.nodes)) {
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

  const reparentNode = (id: string, newParentId: string | null) => {
    if (id === 'root' || !newParentId) return;
    const newParent = nodes.find(n => n.id === newParentId);
    if (!newParent) return;

    // Adjust position relative to the new parent to make it visually immediate and clean
    const isRight = newParent.direction === 'right' || (!newParent.direction && Math.random() > 0.5);
    const newDir = isRight ? 'right' : 'left';
    const offsetX = isRight ? 200 : -200;
    const countSameParent = nodes.filter(n => n.parentId === newParentId).length;
    const offsetY = (countSameParent * 60) - 30;

    setNodes(nodes.map(n => n.id === id ? {
      ...n,
      parentId: newParentId,
      direction: newDir as 'left' | 'right',
      x: (newParent.x || 0) + offsetX,
      y: (newParent.y || 0) + offsetY,
    } : n));
  };

  // --- EXPORT FUNCTIONALITIES ---
  const getTreeRows = () => {
    const rows: string[][] = [];
    const traverse = (nodeId: string, depth: number) => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;
      
      const row: string[] = Array(6).fill('');
      row[Math.min(depth, 4)] = node.label || '';
      row[5] = node.id;
      rows.push(row);
      
      const children = nodes.filter(n => n.parentId === nodeId);
      children.forEach(child => traverse(child.id, depth + 1));
    };
    
    traverse('root', 0);
    return rows;
  };

  const exportXLS = () => {
    const rows = getTreeRows();
    const header = ['一级主题', '二级层级', '三级层级', '四级层级', '五级层级', '节点ID'];
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8" /></head>
<body><table border="1"><thead><tr>${header.map(h => `<th style="background-color:#4f46e5;color:#ffffff;font-weight:bold;">${h}</th>`).join('')}</tr></thead><tbody>`;
    
    rows.forEach(r => {
      html += `<tr>${r.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
    });
    html += '</tbody></table></body></html>';
    
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mindmap_${activeNoteTitle || 'export'}_${new Date().toISOString().slice(0, 10)}.xls`;
    link.click();
  };

  const exportCSV = () => {
    const rows = getTreeRows();
    const header = ['一级主题', '二级层级', '三级层级', '四级层级', '五级层级', '节点ID'];
    const csvContent = [
      header.join(','),
      ...rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mindmap_${activeNoteTitle || 'export'}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const exportFreeMind = () => {
    const buildNodeXML = (nodeId: string): string => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return '';
      const children = nodes.filter(n => n.parentId === nodeId);
      const escapedLabel = (node.label || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      
      let xml = `<node TEXT="${escapedLabel}">`;
      children.forEach(c => {
        xml += buildNodeXML(c.id);
      });
      xml += `</node>`;
      return xml;
    };
    
    let fullXML = `<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.0.1">\n`;
    fullXML += buildNodeXML('root');
    fullXML += `\n</map>`;
    
    const blob = new Blob([fullXML], { type: 'application/xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mindmap_${activeNoteTitle || 'export'}_${new Date().toISOString().slice(0, 10)}.mm`;
    link.click();
  };

  const exportMarkdown = () => {
    const buildMapMD = (nodeId: string, depth: number): string => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return '';
      const children = nodes.filter(n => n.parentId === nodeId);
      const indent = '  '.repeat(depth);
      let md = `${indent}- ${node.label || ''}\n`;
      children.forEach(c => {
        md += buildMapMD(c.id, depth + 1);
      });
      return md;
    };
    
    const fullMD = buildMapMD('root', 0);
    const blob = new Blob([fullMD], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mindmap_${activeNoteTitle || 'export'}_${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
  };

  const exportJSON = () => {
    const jsonStr = JSON.stringify({ nodes }, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mindmap_${activeNoteTitle || 'export'}_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
  };

  // --- IMPORT FUNCTIONALITIES ---
  const parseFreeMindXML = (xmlText: string) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      const rootMapNode = xmlDoc.querySelector('node');
      if (!rootMapNode) return null;
      
      const importedNodes: MindmapNode[] = [];
      
      const traverseXML = (xmlNode: Element, parentId: string | null, depth: number) => {
        const label = xmlNode.getAttribute('TEXT') || '无标题';
        const id = parentId === null ? 'root' : `node_${Math.random().toString(36).substr(2, 9)}`;
        
        let x = 400;
        let y = 300;
        let direction: 'left' | 'right' | undefined = undefined;
        
        if (parentId === null) {
          x = window.innerWidth / 2 || 600;
          y = window.innerHeight / 2 || 400;
        } else {
          const parent = importedNodes.find(n => n.id === parentId);
          direction = depth % 2 === 1 ? 'right' : 'left';
          const offsetX = direction === 'right' ? 200 : -200;
          const parentX = parent ? parent.x || 400 : 400;
          const parentY = parent ? parent.y || 300 : 300;
          const indexCount = importedNodes.filter(n => n.parentId === parentId).length;
          
          x = parentX + offsetX;
          y = parentY + (indexCount * 65) - 30;
        }
        
        importedNodes.push({
          id,
          label,
          parentId,
          direction,
          x,
          y
        });
        
        const children = Array.from(xmlNode.children).filter(c => c.tagName === 'node');
        children.forEach(c => traverseXML(c, id, depth + 1));
      };
      
      traverseXML(rootMapNode, null, 0);
      return importedNodes;
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  const parseMarkdownOutline = (text: string) => {
    const lines = text.split(/\r?\n/);
    const importedNodes: MindmapNode[] = [];
    const stack: { depth: number; id: string; x: number; y: number; dir?: 'left' | 'right' }[] = [];
    
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      
      const listMatch = line.match(/^(\s*)([-*+>]|\d+\.)?\s*(.*)$/);
      if (!listMatch) return;
      
      const whitespace = listMatch[1] || '';
      const label = listMatch[3].trim();
      if (!label) return;
      
      const depth = whitespace.replace(/\t/g, '  ').length;
      let parentId: string | null = null;
      let parentX = window.innerWidth / 2 || 600;
      let parentY = window.innerHeight / 2 || 400;
      let isRight = Math.random() > 0.5;
      
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }
      
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        parentId = parent.id;
        parentX = parent.x;
        parentY = parent.y;
        isRight = parent.dir === 'right' || (!parent.dir && Math.random() > 0.5);
      }
      
      const id = parentId === null ? 'root' : `node_${Math.random().toString(36).substr(2, 9)}`;
      const direction = parentId === null ? undefined : (isRight ? 'right' : 'left');
      const offsetX = direction === 'right' ? 200 : -200;
      const countInParent = importedNodes.filter(n => n.parentId === parentId).length;
      
      const x = parentId === null ? parentX : parentX + offsetX;
      const y = parentId === null ? parentY : parentY + (countInParent * 65) - 30;
      
      const newNode: MindmapNode = {
        id,
        label,
        parentId,
        direction: direction as 'left' | 'right' | undefined,
        x,
        y,
      };
      
      importedNodes.push(newNode);
      stack.push({ depth, id, x, y, dir: direction });
    });
    
    if (importedNodes.length > 0) {
      const roots = importedNodes.filter(n => n.parentId === null);
      if (roots.length === 0) {
        importedNodes[0].id = 'root';
        importedNodes[0].parentId = null;
      } else if (roots.length > 1) {
        const realRoot = roots[0];
        realRoot.id = 'root';
        for (let i = 1; i < importedNodes.length; i++) {
          if (importedNodes[i].parentId === null && importedNodes[i].id !== 'root') {
            importedNodes[i].parentId = 'root';
          }
        }
      }
      return importedNodes;
    }
    return null;
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const ext = file.name.split('.').pop()?.toLowerCase();
      
      let parsed: MindmapNode[] | null = null;
      if (ext === 'json') {
        try {
          const data = JSON.parse(content);
          if (data && Array.isArray(data.nodes)) {
            parsed = data.nodes;
          } else if (Array.isArray(data)) {
            parsed = data;
          }
        } catch {}
      } else if (ext === 'mm') {
        parsed = parseFreeMindXML(content);
      } else if (ext === 'md' || ext === 'txt') {
        parsed = parseMarkdownOutline(content);
      }
      
      if (parsed && parsed.length > 0) {
        setNodes(parsed);
        alert(`成功导入 ${parsed.length} 个脑图节点！`);
      } else {
        alert("导入脑图失败：格式无法识别，支持 Markdown (.md/.txt) bullet大纲列表 / FreeMind (.mm) 节点脑图 / JSON 数据。");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex-1 w-full h-full relative bg-slate-950 overflow-auto" ref={containerRef}>
      {/* Mindmap Toolbar floating in the workspace */}
      <div className="absolute top-4 right-4 z-20 flex flex-wrap items-center gap-2 bg-slate-900/90 backdrop-blur-sm p-2 rounded-xl border border-slate-800 shadow-2xl pointer-events-auto">
        <span className="text-[10px] text-indigo-400 font-extrabold uppercase px-2 py-1 bg-indigo-950/40 rounded border border-indigo-900/20">
          🧠 脑图工具箱
        </span>
        
        {/* EXPORT DROP-DOWN */}
        <div className="relative group/export">
          <button className="flex items-center gap-1 text-[11px] font-bold py-1 px-2.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer">
            <FileDown className="w-3.5 h-3.5" /> 导出脑图
          </button>
          
          <div className="absolute right-0 mt-1 hidden group-hover/export:block w-48 bg-slate-950 border border-slate-800 rounded-lg shadow-xl p-1 z-30 space-y-0.5">
            <button onClick={exportXLS} className="w-full text-left py-1.5 px-2.5 rounded text-[10px] hover:bg-indigo-600 hover:text-white text-slate-300 font-medium transition-colors">
              Excel 数据表格 (.xls)
            </button>
            <button onClick={exportCSV} className="w-full text-left py-1.5 px-2.5 rounded text-[10px] hover:bg-indigo-600 hover:text-white text-slate-300 font-medium transition-colors">
              CSV 纯文本表格 (.csv)
            </button>
            <button onClick={exportFreeMind} className="w-full text-left py-1.5 px-2.5 rounded text-[10px] hover:bg-indigo-600 hover:text-white text-slate-300 font-medium transition-colors">
              FreeMind 脑图 (.mm)
            </button>
            <button onClick={exportMarkdown} className="w-full text-left py-1.5 px-2.5 rounded text-[10px] hover:bg-indigo-600 hover:text-white text-slate-300 font-medium transition-colors">
              Markdown 大纲列表 (.md)
            </button>
            <button onClick={exportJSON} className="w-full text-left py-1.5 px-2.5 rounded text-[10px] hover:bg-indigo-600 hover:text-white text-slate-300 font-medium transition-colors">
              数据流 JSON (.json)
            </button>
          </div>
        </div>

        {/* IMPORT TRIGGER BUTTON */}
        <label className="flex items-center gap-1 text-[11px] font-bold py-1 px-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer border border-slate-700">
          <Upload className="w-3.5 h-3.5" /> 导入脑图
          <input 
            type="file" 
            accept=".md,.txt,.mm,.json" 
            className="hidden" 
            onChange={handleImportFile}
          />
        </label>
      </div>

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
            nodes={nodes}
            onUpdate={updateNodeLabel} 
            onAdd={addNode} 
            onRemove={removeNode} 
            onDragEnd={handleDragEnd} 
            onReparent={reparentNode}
          />
        ))}
      </div>
    </div>
  );
}

function DraggableNode({ node, nodes, onUpdate, onAdd, onRemove, onDragEnd, onReparent }: any) {
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState({ x: node.x, y: node.y });
  
  useEffect(() => { setPos({ x: node.x, y: node.y }); }, [node.x, node.y]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only drag on non-input, non-controls
    const tagName = (e.target as HTMLElement).tagName;
    if (tagName === 'INPUT' || tagName === 'BUTTON' || tagName === 'SELECT' || tagName === 'OPTION') return;
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
  const parentNode = !isRoot ? nodes.find((n: any) => n.id === node.parentId) : null;
  const grandparent = parentNode && parentNode.parentId ? nodes.find((n: any) => n.id === parentNode.parentId) : null;
  const hasGrandparent = !!grandparent;

  const siblings = parentNode ? nodes.filter((n: any) => n.parentId === parentNode.id && n.id !== node.id) : [];
  const sibling = siblings.length > 0 ? siblings[0] : null;
  const hasSibling = !!sibling;

  const descendants = new Set<string>();
  const findDescendants = (id: string) => {
    nodes.forEach((n: any) => {
      if (n.parentId === id) {
        descendants.add(n.id);
        findDescendants(n.id);
      }
    });
  };
  if (!isRoot) {
    findDescendants(node.id);
  }
  const eligibleParents = nodes.filter((n: any) => n.id !== node.id && !descendants.has(n.id));

  return (
    <div 
      className={`absolute pointer-events-auto flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-lg transition-colors group ${isRoot ? 'bg-indigo-600 border-indigo-400 text-white z-10 p-3' : 'bg-slate-800 border-slate-600 text-slate-200 z-0 p-2'}`}
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

      {/* Mini Controls Bar visible on Hover */}
      {!isRoot && (
        <div className="absolute top-full mt-1.5 hidden group-hover:flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg p-1 shadow-xl z-30 pointer-events-auto">
          {/* Outdent Button */}
          {hasGrandparent && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onReparent(node.id, grandparent.id);
              }}
              className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[9px] font-bold text-indigo-400 border border-slate-700/50 cursor-pointer"
              title="向上升级 (设为祖父的子节点)"
            >
              ← 升级
            </button>
          )}
          {/* Indent Button */}
          {hasSibling && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onReparent(node.id, sibling.id);
              }}
              className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[9px] font-bold text-emerald-400 border border-slate-700/50 cursor-pointer"
              title="向下降级 (设为兄弟节点的子节点)"
            >
              → 降级
            </button>
          )}
          
          {/* Parent Select Dropdown */}
          <select
            value={node.parentId || ""}
            onChange={(e) => {
              e.stopPropagation();
              onReparent(node.id, e.target.value);
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="bg-slate-850 border border-slate-700 text-[9px] text-slate-300 rounded font-semibold outline-none py-0.5 px-1 max-w-[80px]"
            title="选择任意新父节点"
          >
            <option value="" disabled>设为子/孙节点...</option>
            {eligibleParents.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.label || '未命名'}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

