import { useState, useMemo } from 'react';
import { NavState, Note, CalendarEvent } from '../types';
import { 
  Plus, ChevronLeft, Trash2, Folder, FolderOpen, Tag, Download, 
  Upload, Hash, Calendar, Sliders, HardDrive, FileText, CheckCircle2, Rocket, Info 
} from 'lucide-react';
import { safeStorage } from '../utils/safeStorage';

interface PartitionBarProps {
  navState: NavState;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  notes: Note[];
  activeNoteId: string | null;
  setActiveNoteId: (id: string | null) => void;
  searchQuery: string;
  handleCreateNote: (initialTitle?: string, initialContent?: string, folder?: string, extraFields?: Partial<Note>) => void;
  handleDeleteNote: (id: string) => void;
  updateNote: (id: string, title: string, content: string, extraFields?: Partial<Note>) => void;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  selectedFolder: string | null;
  setSelectedFolder: (folder: string | null) => void;
  fontSizeLevel: number;
  setFontSizeLevel: (level: number) => void;
  customEvents: CalendarEvent[];
  handleExportDatabase: () => void;
  handleImportDatabase: (jsonData: string) => void;
  handleImportNotesFromFiles: (files: FileList) => void;
  activeTool: string;
  setActiveTool: (tool: string) => void;
  independentTags: string[];
  setIndependentTags: (tags: string[]) => void;
  noteTagsMap: Record<string, string[]>;
  setNoteTagsMap: (map: Record<string, string[]>) => void;
}

interface TreeNode {
  name: string;
  fullPath: string;
  children: Record<string, TreeNode>;
  count: number;
}

export default function PartitionBar({
  navState,
  isOpen,
  setIsOpen,
  notes,
  activeNoteId,
  setActiveNoteId,
  searchQuery,
  handleCreateNote,
  handleDeleteNote,
  updateNote,
  selectedTag,
  setSelectedTag,
  selectedFolder,
  setSelectedFolder,
  fontSizeLevel,
  setFontSizeLevel,
  customEvents,
  handleExportDatabase,
  handleImportDatabase,
  handleImportNotesFromFiles,
  activeTool,
  setActiveTool,
  independentTags,
  setIndependentTags,
  noteTagsMap,
  setNoteTagsMap,
}: PartitionBarProps) {
  const [collapsedPaths, setCollapsedPaths] = useState<Record<string, boolean>>({});
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Record<string, boolean>>({});

  const getDynamicFontSizeStyle = (level: number, baseSize: number) => {
    const factors = [0.85, 1.0, 1.15, 1.3, 1.45];
    const factor = factors[level - 1] || 1.0;
    return { fontSize: `${baseSize * factor}px`, lineHeight: `${baseSize * factor * 1.35}px` };
  };

  const nonDeletedNotes = useMemo(() => notes.filter(n => !n.deleted), [notes]);

  // Recursively build tag directory up to 6 levels deep from independent catalog & tag map & fallback
  const { tagTree, allUniqueTags } = useMemo(() => {
    const root: TreeNode = { name: 'Root', fullPath: '', children: {}, count: 0 };
    
    // 1. O(N) Pass: Accumulate global unique tags and prefix count mapping
    const uniqueTagsSet = new Set<string>(independentTags);
    const tagCountMap = new Map<string, number>();

    for (const note of nonDeletedNotes) {
      const noteUniqueTags = new Set<string>();

      // Fallback: extract hashtags from markdown content
      const content = note.content || '';
      const matches = content.match(/(^|\s)#([a-zA-Z0-9_\u4e00-\u9fa5/]+)/g);
      if (matches) {
        matches.forEach(m => {
          const t = m.trim().substring(1);
          if (!t.endsWith('/') && t.length > 0) {
            noteUniqueTags.add(t);
            uniqueTagsSet.add(t);
          }
        });
      }

      // Independent tags mapping associated with this note
      const indTags = noteTagsMap[note.id] || [];
      indTags.forEach(t => {
        if (t.length > 0) {
          noteUniqueTags.add(t);
          uniqueTagsSet.add(t);
        }
      });

      // Expand note tags into paths to deduplicate parent level count mapping
      const prefixPaths = new Set<string>();
      for (const tag of noteUniqueTags) {
        const parts = tag.split('/');
        let acc = '';
        for (const p of parts) {
          acc = acc ? `${acc}/${p}` : p;
          prefixPaths.add(acc);
        }
      }

      // Record occurrence
      for (const prefix of prefixPaths) {
        tagCountMap.set(prefix, (tagCountMap.get(prefix) || 0) + 1);
      }
    }

    // 2. O(T) Pass: Build tree directly from all known tags & O(1) query counts
    for (const fullTag of Array.from(uniqueTagsSet)) {
      const parts = fullTag.split('/');
      const cappedParts = parts.slice(0, 6); // STRICTLY up to 6 levels supported
      
      let current = root;
      let pathAccumulator = '';

      for (let i = 0; i < cappedParts.length; i++) {
        const part = cappedParts[i];
        pathAccumulator = pathAccumulator ? `${pathAccumulator}/${part}` : part;

        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            fullPath: pathAccumulator,
            children: {},
            count: tagCountMap.get(pathAccumulator) || 0
          };
        }
        current = current.children[part];
      }
    }
    
    return { tagTree: root, allUniqueTags: Array.from(uniqueTagsSet) };
  }, [nonDeletedNotes, independentTags, noteTagsMap]);

  // Export structured nested tags list
  const exportTags = () => {
    // Dynamically fully export ALL tags not just manually configured independent ones
    const tagList = allUniqueTags.map(t => `#${t}`);
    import('../utils/export').then(({ universalExport }) => {
      universalExport(tagList.join('\n'), `sovereign_tags_catalog_${new Date().toISOString().slice(0,10)}.txt`, 'text/plain');
    });
  };

  // Import high fidelity multi levels tags
  const importTags = () => {
    const text = prompt("请输入您想批量导入的标签(以 # 开头，用 / 分割层级，多个由换行、空格或逗号分隔)，例如：\n#工作/代码/React\n#个人/健身/计划");
    if (!text) return;
    const matches = text.match(/#([a-zA-Z0-9_\u4e00-\u9fa5/]+)/g);
    if (!matches) {
       alert("未提取到合规的标签组合！请确保每个标签以 # 开始。");
       return;
    }
    const cleanList = matches.map(m => m.trim().substring(1));
    const nextTags = Array.from(new Set([...independentTags, ...cleanList]));
    setIndependentTags(nextTags);
    alert(`成功批量引入并生成了 ${cleanList.length} 个独立的系统嵌套标签！`);
  };

  // Drag and drop for bulk importing files
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleImportNotesFromFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await handleImportNotesFromFiles(e.target.files);
    }
  };

  // Render collapsible nested nodes elegantly (up to 6 depth)
  const renderTagNodes = (node: TreeNode, depth: number = 0) => {
    return Object.values(node.children)
      .sort((a, b) => b.count - a.count)
      .map(child => {
        const isCollapsed = !!collapsedPaths[child.fullPath];
        const hasChildren = Object.keys(child.children).length > 0;
        const isSelected = selectedTag === child.fullPath;
        
        return (
          <div key={child.fullPath} className="space-y-0.5">
            <div 
              className={`group flex items-center justify-between py-1.5 px-2.5 rounded text-xs transition-transform duration-100 ${
                isSelected 
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/20' 
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
              style={{ paddingLeft: `${Math.min(depth * 14 + 10, 96)}px` }}
              onClick={() => {
                setSelectedTag(isSelected ? null : child.fullPath);
              }}
            >
              <div className="flex items-center space-x-2 truncate cursor-pointer select-none">
                {hasChildren ? (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsedPaths(prev => ({ ...prev, [child.fullPath]: !isCollapsed }));
                    }}
                    className="text-slate-500 hover:text-slate-300 p-0.5 rounded shrink-0 duration-150 transform hover:scale-110"
                  >
                    {isCollapsed ? <Folder className="w-3.5 h-3.5" /> : <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />}
                  </button>
                ) : (
                  <Hash className="w-3 h-3 text-slate-500 shrink-0" />
                )}
                <span className="truncate font-semibold text-slate-200" style={getDynamicFontSizeStyle(fontSizeLevel, 12)}>{child.name}</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.2 bg-slate-950 text-slate-400 rounded-full shrink-0 scale-90" style={getDynamicFontSizeStyle(fontSizeLevel, 10)}>{child.count}</span>
            </div>
            {!isCollapsed && hasChildren && (
              <div className="border-l border-slate-800/80 ml-3.5">
                {renderTagNodes(child, depth + 1)}
              </div>
            )}
          </div>
        );
      });
  };

  const allFolders = useMemo(() => {
    const foldersSet = new Set<string>();
    nonDeletedNotes.forEach((n) => {
      if (n.folder) {
        foldersSet.add(n.folder);
      }
    });
    return Array.from(foldersSet);
  }, [nonDeletedNotes]);

  // Filtered Notes based on search query AND optionally clicked tag and folder
  const filteredNotes = useMemo(() => {
    return nonDeletedNotes.filter(note => {
      // 1. Matches Search query
      const matchesSearch = 
        note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.content.toLowerCase().includes(searchQuery.toLowerCase());
      
      // 2. Matches selected tag (including sub-paths, checking both content fallback and independent tag storage)
      let matchesTag = true;
      if (selectedTag) {
        const noteTagsSet = new Set<string>();
        const content = note.content || '';
        const matches = content.match(/(^|\s)#([a-zA-Z0-9_\u4e00-\u9fa5/]+)/g);
        if (matches) {
          matches.forEach(m => {
            const t = m.trim().substring(1);
            if (!t.endsWith('/') && t.length > 0) noteTagsSet.add(t);
          });
        }
        const indTags = noteTagsMap[note.id] || [];
        indTags.forEach(t => noteTagsSet.add(t));

        matchesTag = Array.from(noteTagsSet).some(t => t === selectedTag || t.startsWith(`${selectedTag}/`));
      }

      // 3. Matches folder
      let matchesFolder = true;
      if (selectedFolder) {
        matchesFolder = note.folder === selectedFolder;
      }
      
      return matchesSearch && matchesTag && matchesFolder;
    }).sort((a, b) => b.updated_at - a.updated_at);
  }, [nonDeletedNotes, searchQuery, selectedTag, selectedFolder, noteTagsMap]);

  return (
    <div className={`w-80 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col overflow-hidden select-none ${!isOpen ? 'hidden' : ''}`}>
      {/* SECTION HEADER */}
      <div className="h-14 px-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/40">
        <h2 className="text-sm font-bold text-slate-100 flex items-center animate-fade-in">
          {navState === 'notes' && <FileText className="w-4 h-4 mr-2 text-indigo-400" />}
          {navState === 'tags' && <Tag className="w-4 h-4 mr-2 text-pink-400" />}
          {navState === 'calendar' && <Calendar className="w-4 h-4 mr-2 text-emerald-400" />}
          {navState === 'settings' && <Sliders className="w-4 h-4 mr-2 text-sky-400" />}
          {navState === 'about' && <Info className="w-4 h-4 mr-2 text-sky-400" />}
          {navState === 'releases' && <Rocket className="w-4 h-4 mr-2 text-amber-400 animate-pulse" />}
          {navState === 'tools' && <Rocket className="w-4 h-4 mr-2 text-amber-400 animate-pulse" />}
          {navState === 'notes' && '笔记列表'}
          {navState === 'tags' && '多级标签目录'}
          {navState === 'calendar' && '今日日程计划'}
          {navState === 'settings' && '系统管理'}
          {navState === 'about' && '关于与版本'}
          {navState === 'releases' && '自动化部署中心'}
          {navState === 'tools' && '系统小工具'}
        </h2>
        <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-300">
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {navState === 'notes' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-3 bg-slate-950/10 shrink-0 space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => handleCreateNote(undefined, undefined, selectedFolder || undefined)}
                className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 font-semibold text-xs transition-colors"
                style={getDynamicFontSizeStyle(fontSizeLevel, 12)}
              >
                <Plus className="w-4 h-4" />
                <span>笔记</span>
              </button>
              <button
                onClick={() => handleCreateNote('白板', '[]', selectedFolder || undefined, { type: 'whiteboard' })}
                className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-semibold text-xs transition-colors"
                style={getDynamicFontSizeStyle(fontSizeLevel, 12)}
              >
                <Plus className="w-4 h-4" />
                <span>白板</span>
              </button>
              <button
                onClick={() => handleCreateNote('导图', '', selectedFolder || undefined, { type: 'mindmap' })}
                className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-lg bg-rose-600/15 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 font-semibold text-xs transition-colors"
                style={getDynamicFontSizeStyle(fontSizeLevel, 12)}
              >
                <Plus className="w-4 h-4" />
                <span>导图</span>
              </button>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setIsBatchMode(!isBatchMode);
                  setSelectedNoteIds({});
                }}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 shrink-0 ${
                  isBatchMode 
                    ? 'bg-rose-600 border-rose-500 text-white shadow' 
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-slate-100'
                }`}
                style={getDynamicFontSizeStyle(fontSizeLevel, 11)}
              >
                <span>⚙️ {isBatchMode ? '退出批量' : '批量操作'}</span>
              </button>
            </div>

            {/* Batch Panel */}
            {isBatchMode && (
              <div className="p-2.5 bg-slate-950/40 border border-indigo-500/15 rounded-xl space-y-2.5 animate-fade-in">
                <div className="flex items-center justify-between text-[10px] text-slate-400" style={getDynamicFontSizeStyle(fontSizeLevel, 10)}>
                  <span>已选: <span className="text-indigo-400 font-bold">{Object.values(selectedNoteIds).filter(Boolean).length}</span> 个</span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        const nextSelects: Record<string, boolean> = {};
                        filteredNotes.forEach(n => nextSelects[n.id] = true);
                        setSelectedNoteIds(nextSelects);
                      }}
                      className="text-indigo-400 hover:underline font-semibold"
                    >
                      全选
                    </button>
                    <button 
                      onClick={() => setSelectedNoteIds({})}
                      className="text-slate-500 hover:underline"
                    >
                      清空
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  <button
                    onClick={() => {
                      const selectedList = filteredNotes.filter(n => selectedNoteIds[n.id]);
                      if (selectedList.length === 0) {
                        alert("请选定需要移动的笔记！");
                        return;
                      }
                      const folderName = prompt("请输入将所选笔记批量归入的文件夹名称（若留空则调整为未分类）:");
                      if (folderName === null) return;
                      const cleanFolder = folderName.trim() || undefined;
                      selectedList.forEach(n => {
                        updateNote(n.id, n.title, n.content, { folder: cleanFolder });
                      });
                      alert(`已将 ${selectedList.length} 条笔记移动至 [${cleanFolder || "未分类"}] 文件夹！`);
                      setSelectedNoteIds({});
                      setIsBatchMode(false);
                    }}
                    className="py-1 bg-indigo-650 hover:bg-indigo-600 text-white font-bold rounded flex items-center justify-center gap-1"
                    style={getDynamicFontSizeStyle(fontSizeLevel, 9)}
                  >
                    📁 归档
                  </button>
                  <button
                    onClick={() => {
                      const selectedList = filteredNotes.filter(n => selectedNoteIds[n.id]);
                      if (selectedList.length === 0) {
                        alert("请选定需要附加标签的笔记！");
                        return;
                      }
                      const tagName = prompt("请输入需批量增设的独立系统标签名称 (例如: 日报/重要):");
                      if (!tagName || !tagName.trim()) return;
                      const cleanTag = tagName.trim().replace(/^#+/, '');
                      
                      // Save to independent state
                      if (!independentTags.includes(cleanTag)) {
                        setIndependentTags([...independentTags, cleanTag]);
                      }

                      const updatedMap = { ...noteTagsMap };
                      selectedList.forEach(n => {
                        const currentTags = updatedMap[n.id] || [];
                        if (!currentTags.includes(cleanTag)) {
                          updatedMap[n.id] = [...currentTags, cleanTag];
                        }
                      });
                      setNoteTagsMap(updatedMap);
                      
                      alert(`已将 ${selectedList.length} 条笔记通过独立存储关联至标签 #${cleanTag}！`);
                      setSelectedNoteIds({});
                      setIsBatchMode(false);
                    }}
                    className="py-1 bg-pink-655 hover:bg-pink-600 text-white font-bold rounded flex items-center justify-center gap-1"
                    style={getDynamicFontSizeStyle(fontSizeLevel, 9)}
                  >
                    🏷️ 贴签
                  </button>
                  <button
                    onClick={() => {
                      const selectedList = filteredNotes.filter(n => selectedNoteIds[n.id]);
                      if (selectedList.length === 0) {
                        alert("请选定需要删除的笔记！");
                        return;
                      }
                      if (!confirm(`确定要直接彻底删除这 ${selectedList.length} 条选中的笔记吗？`)) return;
                      selectedList.forEach(n => {
                        handleDeleteNote(n.id);
                      });
                      setSelectedNoteIds({});
                      setIsBatchMode(false);
                    }}
                    className="py-1 bg-rose-650 hover:bg-rose-600 text-white font-bold rounded flex items-center justify-center gap-1"
                    style={getDynamicFontSizeStyle(fontSizeLevel, 9)}
                  >
                    🗑️ 删除
                  </button>
                </div>
              </div>
            )}

            {selectedTag && !isBatchMode && (
              <div className="mt-2 text-[11px] bg-indigo-950/40 text-indigo-300 border border-indigo-900/40 p-2 rounded-lg flex items-center justify-between" style={getDynamicFontSizeStyle(fontSizeLevel, 11)}>
                <span>过滤标签: <span className="font-bold underline">#{selectedTag}</span></span>
                <button onClick={() => setSelectedTag(null)} className="hover:text-rose-400 font-extrabold px-1 text-xs">清除</button>
              </div>
            )}

            {/* Folders List Inside Create Block */}
            <div className="pt-2.5 border-t border-slate-800/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1" style={getDynamicFontSizeStyle(fontSizeLevel, 10)}>
                  📁 文件夹分类
                </span>
                <button
                  onClick={() => {
                    const folderName = prompt("请输入新建文件夹名称:");
                    if (folderName && folderName.trim()) {
                      handleCreateNote(`在 ${folderName.trim()} 中的新笔记`, `# 欢迎\n\n这是在 [${folderName.trim()}] 文件夹中的第一篇笔记。`, folderName.trim());
                      setSelectedFolder(folderName.trim());
                    }
                  }}
                  className="text-[9px] bg-slate-800 hover:bg-slate-700 hover:text-white text-indigo-400 border border-slate-750 px-1.5 py-0.5 rounded font-bold transition-all animate-fade-in"
                  style={getDynamicFontSizeStyle(fontSizeLevel, 9)}
                >
                  + 新建
                </button>
              </div>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto py-1">
                <button
                  onClick={() => setSelectedFolder(null)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-all flex items-center gap-1 ${
                    selectedFolder === null
                      ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30 font-bold'
                      : 'bg-slate-950/30 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                  style={getDynamicFontSizeStyle(fontSizeLevel, 10)}
                >
                  全部 ({nonDeletedNotes.length})
                </button>
                {allFolders.map(folderName => {
                  const count = nonDeletedNotes.filter(n => n.folder === folderName).length;
                  return (
                    <button
                      key={folderName}
                      onClick={() => setSelectedFolder(folderName === selectedFolder ? null : folderName)}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-all flex items-center gap-1 ${
                        selectedFolder === folderName
                          ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/40 font-bold'
                          : 'bg-slate-950/30 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                      style={getDynamicFontSizeStyle(fontSizeLevel, 10)}
                    >
                      <span className="truncate max-w-[80px]">📁 {folderName}</span>
                      <span className="text-[8px] bg-slate-900/60 text-slate-500 px-1 rounded-sm">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Notes List with visual touch */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40 animate-fade-in">
            {filteredNotes.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
                <FileText className="w-8 h-8 opacity-20 text-slate-400" />
                <p>无匹配笔记</p>
                {(selectedTag || selectedFolder) && <p className="scale-90 opacity-60">此分类/标签下暂无符合文章</p>}
              </div>
            ) : (
              filteredNotes.map(note => {
                // Strip tags from summary
                const summaryText = note.content
                  .replace(/#[a-zA-Z0-9_\u4e00-\u9fa5/]+/g, '')
                  .replace(/[#*`>-]/g, '')
                  .trim()
                  .slice(0, 45);

                // Extract tag badges for this specific note
                const noteTagsMatches = note.content.match(/(?:^|\s)#([a-zA-Z0-9_\u4e00-\u9fa5/]+)/g);
                const noteTags = noteTagsMatches 
                  ? Array.from(new Set(noteTagsMatches.map(m => m.trim().substring(1))))
                  : [];
                
                return (
                  <div
                    key={note.id}
                    onClick={() => {
                      if (isBatchMode) {
                        setSelectedNoteIds(prev => ({ ...prev, [note.id]: !prev[note.id] }));
                      } else {
                        setActiveNoteId(note.id);
                      }
                    }}
                    className={`p-4 cursor-pointer border-l-2 transition-all group ${
                      note.id === activeNoteId 
                        ? 'bg-slate-800/80 border-indigo-500 text-slate-100 shadow-inner' 
                        : 'border-transparent text-slate-400 hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5 truncate max-w-[210px]">
                        {isBatchMode && (
                          <input 
                            type="checkbox"
                            checked={!!selectedNoteIds[note.id]}
                            onChange={(e) => {
                              e.stopPropagation();
                              setSelectedNoteIds(prev => ({ ...prev, [note.id]: e.target.checked }));
                            }}
                            className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-800 accent-indigo-500 cursor-pointer shrink-0"
                          />
                        )}
                        <h4 className="font-bold truncate" style={getDynamicFontSizeStyle(fontSizeLevel, 12)}>{note.title || '无标题'}</h4>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }} 
                        className="text-slate-600 hover:text-rose-400 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="删除笔记"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-slate-500 mt-1 line-clamp-2 leading-relaxed" style={getDynamicFontSizeStyle(fontSizeLevel, 11)}>
                      {summaryText || "点击编辑笔记具体内容..."}
                    </p>

                    {/* Tags List & Quick Add Tag Badge */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {noteTags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[9px] text-indigo-400 font-semibold px-1 py-0.2 bg-indigo-950/40 border border-indigo-900/40 rounded truncate max-w-[90px]" title={`#${tag}`}>
                          #{tag.substring(tag.lastIndexOf('/') + 1)}
                        </span>
                      ))}
                      {noteTags.length > 3 && (
                        <span className="text-[9px] text-slate-500 font-mono px-1">+{noteTags.length - 3}</span>
                      )}
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const tagName = prompt(`请输入要添加至笔记【${note.title}】的独立系统标签 (支持多级嵌套，如: 个人/备忘):`);
                          if (tagName && tagName.trim()) {
                            const cleanTag = tagName.trim().replace(/^#+/, '');
                            if (!independentTags.includes(cleanTag)) {
                              setIndependentTags([...independentTags, cleanTag]);
                            }
                            const currentTags = noteTagsMap[note.id] || [];
                            if (!currentTags.includes(cleanTag)) {
                              setNoteTagsMap({ ...noteTagsMap, [note.id]: [...currentTags, cleanTag] });
                            }
                            alert(`已通过独立存储成功为笔记添加 #${cleanTag} 标签！`);
                          }
                        }}
                        className="text-[9px] text-slate-500 hover:text-indigo-400 bg-slate-950/20 hover:bg-slate-950/45 px-1 py-0.2 rounded border border-slate-805 font-bold transition-all cursor-pointer inline-flex items-center gap-0.5"
                        title="在此笔记列表直接快捷添加状态标签"
                      >
                        + 贴标签
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-slate-600 mt-2 font-mono" style={getDynamicFontSizeStyle(fontSizeLevel, 10)}>
                      <span>{new Date(note.updated_at).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
                      {note.folder && (
                        <span className="text-[9px] bg-slate-950 text-indigo-400 px-1.5 py-0.2 rounded-full border border-indigo-500/10 truncate max-w-[80px]">📁 {note.folder}</span>
                      )}
                      <span>{note.content.length} 字</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* MULTI LEVEL TAGS INDEX */}
      {navState === 'tags' && (
        <div className="flex-1 flex flex-col overflow-hidden p-3 space-y-3">
          <div className="flex items-center gap-2 justify-between shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">标签目录(最大支持6层级)</span>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => {
                  const tagName = prompt("请输入新建标签名称 (包括多层级如: 书籍/科幻/三体):");
                  if (tagName && tagName.trim()) {
                    const cleanTag = tagName.trim().replace(/^#+/, '');
                    if (activeNoteId) {
                      const active = notes.find(n => n.id === activeNoteId);
                      if (active) {
                        const separator = active.content.endsWith(' ') || active.content.endsWith('\n') ? '' : ' ';
                        updateNote(active.id, active.title, `${active.content}${separator}#${cleanTag}`, {});
                        alert(`标签 #${cleanTag} 已成功附加到当前打开的笔记：【${active.title}】！`);
                        return;
                      }
                    }
                    handleCreateNote(`新建 ${cleanTag} 关联笔记`, `# 新关联笔记\n\n此笔记附带您刚才在多级标签分类中配置的标签：\n\n#${cleanTag}\n\n您现在可以在此编辑内容。`);
                    alert(`由于当前无活跃笔记，已自动生成一篇包含 #${cleanTag} 标签的新笔记！`);
                  }
                }} 
                className="p-1 px-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-extrabold flex items-center gap-1 cursor-pointer transition-colors"
                title="在多级标签目录直连新增项目"
              >
                + 新增标签
              </button>
              <button 
                onClick={importTags} 
                className="p-1 px-1.5 bg-slate-800 hover:bg-slate-705 text-indigo-400 border border-slate-700 rounded text-[10px] font-bold flex items-center gap-1"
                title="批量导入嵌套标签"
              >
                <Upload className="w-2.5 h-2.5" /> 导入
              </button>
              <button 
                onClick={exportTags} 
                className="p-1 px-1.5 bg-slate-800 hover:bg-slate-705 text-indigo-400 border border-slate-700 rounded text-[10px] font-bold flex items-center gap-1"
                title="导出标签纲要"
              >
                <Download className="w-2.5 h-2.5" /> 导出
              </button>
            </div>
          </div>

          <div className="flex-1 bg-slate-950/30 rounded-xl border border-slate-800/60 p-2 overflow-y-auto space-y-1">
            {Object.keys(tagTree.children).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-600 space-y-2">
                <Tag className="w-8 h-8 opacity-10 text-slate-400" />
                <p className="text-xs font-semibold">无活跃标签层级</p>
                <p className="text-[10px] opacity-70">在笔记内容中键入如 #工作/开发 即可动态生成无限六级目录</p>
              </div>
            ) : (
              renderTagNodes(tagTree)
            )}
          </div>
        </div>
      )}

      {/* UPCOMING EVENTS SCHEDULES */}
      {navState === 'calendar' && (
        <div className="flex-1 flex flex-col p-4 overflow-hidden space-y-4">
          <div className="flex items-center justify-between shrink-0 text-slate-400 text-xs">
            <span className="font-bold">日程纲要计划</span>
            <span className="text-[10px] bg-emerald-600/10 text-emerald-400 border border-emerald-500/10 px-2 py-0.5 rounded-full">2026年5-6月同步</span>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto">
            {customEvents.map((evt) => {
              const matchedNote = notes.find(n => n.id === evt.noteId && !n.deleted);
              return (
                <div 
                  key={evt.id} 
                  className="bg-slate-950/40 p-3 rounded-lg border border-slate-800 space-y-2 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-slate-200">{evt.title}</h4>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{evt.date}</p>
                    </div>
                    {evt.noteId && (
                      <span className="text-[9px] bg-indigo-500/15 border border-indigo-400/20 text-indigo-400 px-1.5 rounded-full font-bold">已联动笔记</span>
                    )}
                  </div>
                  
                  {evt.noteId && matchedNote ? (
                    <button 
                      onClick={() => {
                        setActiveNoteId(matchedNote.id);
                      }}
                      className="w-full text-left p-1.5 bg-slate-900 border border-slate-850 hover:bg-slate-800 rounded text-[10px] text-indigo-300 flex items-center justify-between truncate"
                    >
                      <span className="truncate">👀 关联: {matchedNote.title}</span>
                      <CheckCircle2 className="w-3 h-3 text-indigo-400 shrink-0 ml-1" />
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          const title = `关于 ${evt.title} 的日程笔记`;
                          const content = `# 关于 ${evt.title} \n\n时间: ${evt.date}\n\n开始记录与此日程相关的要点...`;
                          handleCreateNote(title, content);
                        }}
                        className="text-[10px] py-1 px-2.5 bg-indigo-600/10 hover:bg-indigo-600/25 text-indigo-400 rounded border border-indigo-500/20 font-bold transition-all"
                      >
                        + 建立联动笔记
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>


        </div>
      )}

      {/* QUICK DATABASE BACKUP & FONT SIZER CONTROL IN THE PARTITION BAR */}
      {navState === 'settings' && (
        <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-5">
          {/* Quick Accessibility Setting */}
          <div className="p-3 bg-slate-950/30 rounded-xl border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-300">快速字体调节 (支持5级)</h3>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500">小</span>
              <input 
                type="range" 
                min="1" 
                max="5" 
                value={fontSizeLevel} 
                onChange={(e) => setFontSizeLevel(parseInt(e.target.value, 10))}
                className="w-32 accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
              <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">大 <span className="bg-indigo-500/20 text-indigo-300 px-1 rounded-sm scale-90">{fontSizeLevel}级</span></span>
            </div>
            <p className="text-[10px] text-slate-500 text-center leading-relaxed">
              即时控制全局笔记管理列表、文章撰写以及侧边视图字号。限制特大字屏防视疲劳。
            </p>
          </div>

          {/* Database Backup Tool */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
              <HardDrive className="w-3 h-3" /> 数据导入导出 (LWW完整状态)
            </span>
            
            <div className="flex gap-2 shrink-0">
              <button 
                onClick={handleExportDatabase}
                className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1 shadow transition-colors"
                title="导出整个LWW数据库"
              >
                <Download className="w-3.5 h-3.5" /> 导出数据库
              </button>
              
              <label 
                className="flex-1 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-colors"
                title="导入LWW数据库"
              >
                <Upload className="w-3.5 h-3.5" /> 导入数据库
                <input 
                  type="file" 
                  accept=".json" 
                  className="hidden" 
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const text = await file.text();
                      handleImportDatabase(text);
                    }
                  }} 
                />
              </label>
            </div>
          </div>

          {/* Sync Server URL Tool */}
          <div className="space-y-2 pt-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
              <HardDrive className="w-3 h-3" /> 数据中心同步绑定 (移动端特供)
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="例如: http://192.168.1.100:3000"
                defaultValue={safeStorage.getItem('sovereign_sync_url') || ''}
                className="flex-1 px-3 py-2 text-xs bg-slate-900 border border-slate-800 text-slate-300 rounded focus:border-indigo-500 outline-none"
                id="sync-server-input"
              />
              <button
                onClick={() => {
                  const val = (document.getElementById('sync-server-input') as HTMLInputElement).value.trim();
                  if (val) {
                    safeStorage.setItem('sovereign_sync_url', val);
                    alert('数据中心同步地址已设定，后续同步将推向此IP源。');
                  } else {
                    safeStorage.removeItem('sovereign_sync_url');
                    alert('已清除同步IP，恢复仅本体闭合环境与相对路由模式。');
                  }
                }}
                className="px-4 bg-slate-800 hover:bg-slate-700 text-indigo-400 font-bold text-[11px] border border-slate-700 rounded transition-colors whitespace-nowrap"
              >
                保存网络配置
              </button>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              安卓端如需热同步笔记至电脑端主机，可输入主机的 IP 与端口，配合局域网穿透完成云端互联。
            </p>
          </div>

          {/* Virtual Drag and Drop Multi Folder / Batch File Parser */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
               文件夹扫描 & 批量导入 (支持 MD/TXT/HTML/JSON)
            </span>
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                dragActive 
                  ? 'border-indigo-500 bg-indigo-500/10' 
                  : dragActive === false 
                    ? 'border-slate-800 hover:border-indigo-500/40 bg-slate-950/20'
                    : 'border-slate-800'
              }`}
            >
              <Upload className="w-6 h-6 mx-auto mb-2 text-slate-500 opacity-60" />
              <p className="text-[10px] text-slate-300 font-bold">拖拽本地文件到此处导入</p>
              <p className="text-[9px] text-slate-500 mt-1">支持拖拉或批量选择多个文件</p>
              <label className="mt-2.5 inline-block px-3 py-1 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-[10px] font-bold text-indigo-400 rounded cursor-pointer">
                浏览文件
                <input 
                  type="file" 
                  multiple 
                  accept=".md,.txt,.html,.json" 
                  className="hidden" 
                  onChange={handleFileInput} 
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL DISCOVERY TOOLS BOX IN SIDE BAR */}
      {navState === 'tools' && (
        <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4 animate-fade-in">
          {/* Tool Selector Tab Bar */}
          <div className="grid grid-cols-3 gap-1 bg-slate-950/40 p-1 rounded-xl border border-slate-800/80">
            <button
              onClick={() => setActiveTool('releases')}
              className={`py-2 rounded-lg text-[10px] font-bold text-center transition-all flex flex-col items-center justify-center gap-1 ${
                activeTool === 'releases'
                  ? 'bg-indigo-600 text-slate-100 shadow border border-indigo-505 font-extrabold shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
              }`}
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>版本发布</span>
            </button>
            <button
              onClick={() => setActiveTool('backup')}
              className={`py-2 rounded-lg text-[10px] font-bold text-center transition-all flex flex-col items-center justify-center gap-1 ${
                activeTool === 'backup'
                  ? 'bg-indigo-600 text-slate-100 shadow border border-indigo-505 font-extrabold shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>整库备份</span>
            </button>
            <button
              onClick={() => setActiveTool('device')}
              className={`py-2 rounded-lg text-[10px] font-bold text-center transition-all flex flex-col items-center justify-center gap-1 ${
                activeTool === 'device'
                  ? 'bg-indigo-600 text-slate-100 shadow border border-indigo-505 font-extrabold shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>多端调试</span>
            </button>
          </div>

          <div className="border-t border-slate-800/50 pt-1 shrink-0"></div>

          {/* Render active tool panel inside the sub-sidebar */}
          {activeTool === 'releases' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-3 bg-indigo-950/20 border border-indigo-900/40 rounded-xl space-y-2">
                <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                  <Rocket className="w-3.5 h-3.5 animate-bounce" /> CI/CD 自动部署已就绪
                </h3>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  检测到内置 <code>.github/workflows/build.yml</code>。推送 <code>v*</code> 标签自动编译 Windows / Android 独立客户端。
                </p>
              </div>

              <div className="space-y-1 bg-slate-950/40 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider font-mono">触发规则</span>
                <div className="flex items-center justify-between text-xs py-1">
                  <span className="font-mono text-slate-300">tags: ['v*']</span>
                  <span className="text-[9px] bg-emerald-600/10 text-emerald-400 border border-emerald-500/10 px-1.5 py-0.2 rounded-full font-bold">已绑定</span>
                </div>
              </div>

              <div className="space-y-1 bg-slate-950/40 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider font-mono">目标平台</span>
                <div className="text-[10px] text-slate-300 space-y-1.5 pt-1 font-mono">
                  <div className="flex justify-between">
                    <span>• Windows Desktop (x64)</span>
                    <span className="text-slate-500">MSVC 编译</span>
                  </div>
                  <div className="flex justify-between">
                    <span>• Android Device (APK)</span>
                    <span className="text-slate-500">cargo-apk</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTool === 'backup' && (
            <div className="space-y-4 animate-fade-in">
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <HardDrive className="w-3 h-3 text-indigo-400" /> 数据导入导出 (LWW共识)
                </span>
                <div className="flex gap-2">
                  <button 
                    onClick={handleExportDatabase}
                    className="flex-1 py-1.5 px-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] rounded flex items-center justify-center gap-1 shadow transition-colors"
                  >
                    <Download className="w-3 h-3" /> 导出
                  </button>
                  <label className="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-[10px] rounded flex items-center justify-center gap-1 cursor-pointer transition-colors">
                    <Upload className="w-3 h-3" /> 导入
                    <input 
                      type="file" 
                      accept=".json" 
                      className="hidden" 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const text = await file.text();
                          handleImportDatabase(text);
                        }
                      }} 
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-2 pt-1 border-t border-slate-800/40">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  文件夹快速扫描 & 批量导入
                </span>
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border border-dashed rounded-xl p-3 text-center cursor-pointer transition-all ${
                    dragActive 
                      ? 'border-indigo-500 bg-indigo-500/10' 
                      : 'border-slate-850 bg-slate-950/20 hover:border-indigo-500/40'
                  }`}
                >
                  <Upload className="w-5 h-5 mx-auto mb-1 text-slate-500 opacity-60" />
                  <p className="text-[9px] text-slate-300 font-bold">拖拽本地文件到此处导入</p>
                  <label className="mt-1.5 inline-block px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[8px] font-bold text-indigo-400 rounded cursor-pointer">
                    浏览文件
                    <input 
                      type="file" 
                      multiple 
                      accept=".md,.txt,.html,.json" 
                      className="hidden" 
                      onChange={(e) => {
                        if (e.target.files) handleImportNotesFromFiles(e.target.files);
                      }} 
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTool === 'device' && (
            <div className="space-y-4 animate-fade-in text-slate-300">
              <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800 space-y-3">
                <h3 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">字号缩放调试</h3>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">小</span>
                  <input 
                    type="range" 
                    min="1" 
                    max="5" 
                    value={fontSizeLevel} 
                    onChange={(e) => setFontSizeLevel(parseInt(e.target.value, 10))}
                    className="w-32 accent-indigo-500 cursor-pointer h-1 bg-slate-800 rounded-lg"
                  />
                  <span className="text-[10px] text-indigo-400 font-bold">{fontSizeLevel}级</span>
                </div>
              </div>
              <div className="p-3 bg-slate-950/20 border border-slate-850 rounded-lg text-center">
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  多端设备模拟预设已位于左边栏主面板中。您也可以直接在侧边栏底端极速切换分辨率，感受铁血级自适应高分排版对齐。
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
