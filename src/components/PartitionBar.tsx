import { useState, useMemo } from 'react';
import { NavState, Note, CalendarEvent } from '../types';
import { 
  Plus, ChevronLeft, Trash2, Folder, FolderOpen, Tag, Download, 
  Upload, Hash, Calendar, Sliders, HardDrive, FileText, CheckCircle2, Rocket 
} from 'lucide-react';

interface PartitionBarProps {
  navState: NavState;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  notes: Note[];
  activeNoteId: string | null;
  setActiveNoteId: (id: string | null) => void;
  searchQuery: string;
  handleCreateNote: (initialTitle?: string, initialContent?: string) => void;
  handleDeleteNote: (id: string) => void;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  fontSizeLevel: number;
  setFontSizeLevel: (level: number) => void;
  customEvents: CalendarEvent[];
  handleExportDatabase: () => void;
  handleImportDatabase: (jsonData: string) => void;
  handleImportNotesFromFiles: (files: FileList) => void;
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
  selectedTag,
  setSelectedTag,
  fontSizeLevel,
  setFontSizeLevel,
  customEvents,
  handleExportDatabase,
  handleImportDatabase,
  handleImportNotesFromFiles,
}: PartitionBarProps) {
  const [collapsedPaths, setCollapsedPaths] = useState<Record<string, boolean>>({});
  const [dragActive, setDragActive] = useState<boolean>(false);

  if (!isOpen) return null;

  const nonDeletedNotes = useMemo(() => notes.filter(n => !n.deleted), [notes]);

  // Recursively build tag directory up to 6 levels deep from notes
  const tagTree = useMemo(() => {
    const root: TreeNode = { name: 'Root', fullPath: '', children: {}, count: 0 };
    for (const note of nonDeletedNotes) {
      const content = note.content || '';
      const matches = content.match(/(^|\s)#([a-zA-Z0-9_\u4e00-\u9fa5/]+)/g);
      if (!matches) continue;

      const uniqueTags = Array.from(new Set(
        matches.map(m => m.trim().substring(1)).filter(t => !t.endsWith('/') && t.length > 0)
      ));

      for (const fullTag of uniqueTags) {
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
              count: 0
            };
          }
          current.children[part].count += 1;
          current = current.children[part];
        }
      }
    }
    return root;
  }, [nonDeletedNotes]);

  // Export structured nested tags list
  const exportTags = () => {
    const tagList: string[] = [];
    const extractPaths = (node: TreeNode) => {
      for (const child of Object.values(node.children)) {
        tagList.push(`#${child.fullPath}`);
        extractPaths(child);
      }
    };
    extractPaths(tagTree);
    const textBlob = new Blob([tagList.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(textBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sovereign_tags_catalog_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
    const cleanList = matches.map(m => m.trim());
    const mockNoteTitle = "批量导入的标签包";
    const mockNoteContent = `# 批量导入的标签包\n\n系统已检测并解析您导入的嵌套层级：\n\n${cleanList.join(' ')}\n\n(提示：此文章包含这些多层标签，若不再需要此笔记，后续可以通过在笔记内部编辑、修改具体内容来重构整体标签结构)`;
    
    handleCreateNote(mockNoteTitle, mockNoteContent);
    alert(`成功批量引入并生成了 ${cleanList.length} 个多层嵌套标签！`);
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
                <span className="truncate font-semibold text-slate-200">{child.name}</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.2 bg-slate-950 text-slate-400 rounded-full shrink-0 scale-90">{child.count}</span>
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

  // Filtered Notes based on search query AND optionally clicked tag
  const filteredNotes = useMemo(() => {
    return nonDeletedNotes.filter(note => {
      // 1. Matches Search query
      const matchesSearch = 
        note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.content.toLowerCase().includes(searchQuery.toLowerCase());
      
      // 2. Matches selected tag (including sub-paths)
      if (selectedTag) {
        const matches = note.content.match(/(^|\s)#([a-zA-Z0-9_\u4e00-\u9fa5/]+)/g);
        if (!matches) return false;
        const noteTags = matches.map(m => m.trim().substring(1));
        const hasTagMatch = noteTags.some(t => t === selectedTag || t.startsWith(`${selectedTag}/`));
        return matchesSearch && hasTagMatch;
      }
      return matchesSearch;
    }).sort((a, b) => b.updated_at - a.updated_at);
  }, [nonDeletedNotes, searchQuery, selectedTag]);

  return (
    <div className="w-80 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col overflow-hidden select-none">
      {/* SECTION HEADER */}
      <div className="h-14 px-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/40">
        <h2 className="text-sm font-bold text-slate-100 flex items-center animate-fade-in">
          {navState === 'notes' && <FileText className="w-4 h-4 mr-2 text-indigo-400" />}
          {navState === 'tags' && <Tag className="w-4 h-4 mr-2 text-pink-400" />}
          {navState === 'calendar' && <Calendar className="w-4 h-4 mr-2 text-emerald-400" />}
          {navState === 'settings' && <Sliders className="w-4 h-4 mr-2 text-sky-400" />}
          {navState === 'releases' && <Rocket className="w-4 h-4 mr-2 text-amber-400 animate-pulse" />}
          {navState === 'notes' && '笔记列表'}
          {navState === 'tags' && '多级标签目录'}
          {navState === 'calendar' && '今日日程计划'}
          {navState === 'settings' && '系统管理'}
          {navState === 'releases' && '自动化部署中心'}
        </h2>
        <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-300">
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* QUICK COMPONENT SCROLLER */}
      {navState === 'notes' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Create Button */}
          <div className="p-3 bg-slate-950/10 shrink-0">
            <button
              onClick={() => handleCreateNote()}
              className="w-full flex items-center justify-center space-x-2 py-2 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 font-semibold text-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>新建笔记</span>
            </button>
            {selectedTag && (
              <div className="mt-2 text-[11px] bg-indigo-950/40 text-indigo-300 border border-indigo-900/40 p-2 rounded-lg flex items-center justify-between">
                <span>过滤标签: <span className="font-bold underline">#{selectedTag}</span></span>
                <button onClick={() => setSelectedTag(null)} className="hover:text-rose-400 font-extrabold px-1 text-xs">清除</button>
              </div>
            )}
          </div>

          {/* Notes List with visual touch */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
            {filteredNotes.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
                <FileText className="w-8 h-8 opacity-20 text-slate-400" />
                <p>无匹配笔记</p>
                {selectedTag && <p className="scale-90 opacity-60">标签包含的字级目前无符合文章</p>}
              </div>
            ) : (
              filteredNotes.map(note => {
                // Strip tags from summary
                const summaryText = note.content
                  .replace(/#[a-zA-Z0-9_\u4e00-\u9fa5/]+/g, '')
                  .replace(/[#*`>-]/g, '')
                  .trim()
                  .slice(0, 45);
                
                return (
                  <div
                    key={note.id}
                    onClick={() => setActiveNoteId(note.id)}
                    className={`p-4 cursor-pointer border-l-2 transition-all group ${
                      note.id === activeNoteId 
                        ? 'bg-slate-800/80 border-indigo-500 text-slate-100 shadow-inner' 
                        : 'border-transparent text-slate-400 hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-xs truncate max-w-[190px]">{note.title || '无标题'}</h4>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }} 
                        className="text-slate-600 hover:text-rose-400 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="删除笔记"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {summaryText || "点击编辑笔记具体内容..."}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-slate-600 mt-2 font-mono">
                      <span>{new Date(note.updated_at).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
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
            <div className="flex items-center gap-1.5">
              <button 
                onClick={importTags} 
                className="p-1 px-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-slate-700 rounded text-[10px] font-bold flex items-center gap-1"
                title="批量导入嵌套标签"
              >
                <Upload className="w-2.5 h-2.5" /> 导入
              </button>
              <button 
                onClick={exportTags} 
                className="p-1 px-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-slate-700 rounded text-[10px] font-bold flex items-center gap-1"
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

      {/* GLOBAL AUTO RELEASE CONTROLS IN THE PARTITION BAR */}
      {navState === 'releases' && (
        <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4 animate-fade-in">
          <div className="p-3 bg-indigo-950/20 border border-indigo-900/40 rounded-xl space-y-2">
            <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
              <Rocket className="w-3.5 h-3.5 animate-bounce" /> CI/CD 自动部署已就绪
            </h3>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              检测到内置 <code>.github/workflows/build.yml</code>。支持推送 <code>v*</code> 标签时自动编译 Windows 与 Android 客户端并全自动部署到 GitHub Releases 资产发布区。
            </p>
          </div>

          <div className="space-y-1 bg-slate-950/40 p-3 rounded-lg border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">监听触发规则</span>
            <div className="flex items-center justify-between text-xs py-1">
              <span className="font-mono text-slate-300">tags: ['v*']</span>
              <span className="text-[9px] bg-emerald-600/10 text-emerald-400 border border-emerald-500/10 px-1.5 py-0.2 rounded-full font-bold">已绑定</span>
            </div>
          </div>

          <div className="space-y-1 bg-slate-950/40 p-3 rounded-lg border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">自动构建平台</span>
            <div className="text-[10px] text-slate-300 space-y-1.5 pt-1 font-mono">
              <div className="flex justify-between">
                <span>• Windows x64 App</span>
                <span className="text-slate-500">MSVC 编译</span>
              </div>
              <div className="flex justify-between">
                <span>• Windows ia32 App</span>
                <span className="text-slate-500">微软编译器</span>
              </div>
              <div className="flex justify-between">
                <span>• Android APK Store</span>
                <span className="text-slate-500">cargo-apk 工具</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-950/20 border border-slate-850 p-3 rounded-lg space-y-2 text-center">
            <p className="text-[10px] text-slate-500 leading-relaxed">
              需要切换到右侧主视图进行版本发布配置、编写变更日志、更新 GitHub Actions 及本地命令行手动/全自动发布控指。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
