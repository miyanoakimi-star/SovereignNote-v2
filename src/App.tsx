import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  FileText, 
  RotateCw, 
  Download, 
  Upload, 
  Tag, 
  Layout, 
  Eye, 
  Edit3, 
  CloudOff,
  Cloud,
  FileDown,
  Info
} from 'lucide-react';
import { Note, getLocalNotes, saveLocalNotes, syncWithBackend } from './lib/api';
import { parseMarkdown, extractTags } from './utils/markdown';

// 生成临时 UUID 的小函数
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function App() {
  // 核心管理状态
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  
  // 编辑与显示过滤器
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [sortBy, setSortBy] = useState<'updated' | 'title'>('updated');

  // 连接/同步状态
  const [backendAlive, setBackendAlive] = useState<boolean | null>(null);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'success' | 'failed'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string>('');

  // 快捷参考文件上传 Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. 初始化时，加载本地 notes 缓存，并探测后台服务状态
  useEffect(() => {
    const cached = getLocalNotes();
    setNotes(cached);
    if (cached.length > 0) {
      // 默认选中第一个未删除的 note
      const active = cached.find(n => !n.deleted);
      if (active) setActiveId(active.id);
    }
    
    checkBackendHealth();

    // 每一分钟自动静默同步一次
    const interval = setInterval(() => {
      autoSync();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // 探测后台是否在线
  async function checkBackendHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        setBackendAlive(true);
      } else {
        setBackendAlive(false);
      }
    } catch {
      setBackendAlive(false);
    }
  }

  // 首次或静默自动同步
  async function autoSync() {
    try {
      const result = await syncWithBackend();
      if (result.success) {
        setNotes(result.notes);
        setBackendAlive(true);
      } else {
        setBackendAlive(false);
      }
    } catch {
      setBackendAlive(false);
    }
  }

  // 2. 交互更新 Notes & 本地缓存
  const activeNote = useMemo(() => {
    return notes.find(n => n.id === activeId) || null;
  }, [notes, activeId]);

  // 修改 Note 字段高精度更新
  function updateActiveNote(title: string, content: string) {
    if (!activeId) return;
    const now = Date.now();
    const updated = notes.map(n => {
      if (n.id === activeId) {
        return {
          ...n,
          title,
          content,
          updated_at: now, // 触发高精度 LWW 修改标记
        };
      }
      return n;
    });
    setNotes(updated);
    saveLocalNotes(updated);
  }

  // 创建新 Note
  function handleCreateNote() {
    const now = Date.now();
    const newNote: Note = {
      id: generateUUID(),
      title: 'Untitled Note',
      content: '# Untitled Note\n\nWrite something beautiful here... #notes',
      created_at: now,
      updated_at: now,
      deleted: false,
    };
    const updated = [newNote, ...notes];
    setNotes(updated);
    saveLocalNotes(updated);
    setActiveId(newNote.id);
  }

  // 物理软删除 note (标为 deleted: true 以支持 Tombstone 云同步)
  function handleDeleteNote(id: string) {
    const confirmDelete = window.confirm('Are you sure you want to delete this note? This action is offline-reversible but will sync deletion globally.');
    if (!confirmDelete) return;

    const now = Date.now();
    const updated = notes.map(n => {
      if (n.id === id) {
        return {
          ...n,
          deleted: true,
          updated_at: now, // LWW 基准：删除也是一次最新的高精度更新
        };
      }
      return n;
    });

    setNotes(updated);
    saveLocalNotes(updated);

    // 如果删除了当前的，重新寻找新的活跃笔记
    if (activeId === id) {
      const nextActive = updated.find(n => !n.deleted);
      setActiveId(nextActive ? nextActive.id : null);
    }

    // 触发 LWW 静默同步
    setTimeout(() => {
      handleManualSync();
    }, 500);
  }

  // 3. 过滤及排序
  // 过滤未删除
  const nonDeletedNotes = useMemo(() => {
    return notes.filter(n => !n.deleted);
  }, [notes]);

  // 动态合并所有笔记中的 #tags
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    nonDeletedNotes.forEach(note => {
      const tags = extractTags(note.content);
      tags.forEach(t => tagsSet.add(t));
    });
    return Array.from(tagsSet);
  }, [nonDeletedNotes]);

  // 搜索和标签组合过滤
  const filteredNotes = useMemo(() => {
    return nonDeletedNotes.filter(note => {
      const matchesSearch = 
        note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.content.toLowerCase().includes(searchQuery.toLowerCase());
      
      const tags = extractTags(note.content);
      const matchesTag = !selectedTag || tags.includes(selectedTag);

      return matchesSearch && matchesTag;
    }).sort((a, b) => {
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      } else {
        return b.updated_at - a.updated_at; // 最新排在最前
      }
    });
  }, [nonDeletedNotes, searchQuery, selectedTag, sortBy]);

  // 4. 手动触发 LWW 后台同步
  async function handleManualSync() {
    setSyncState('syncing');
    setSyncError(null);
    setSyncMessage('Establishing communication with Sovereign Core...');
    
    // 延迟 300ms 显得同步动感自然
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      const result = await syncWithBackend();
      if (result.success) {
        setNotes(result.notes);
        setSyncState('success');
        setBackendAlive(true);
        setSyncMessage('Decentralized LWW Sync complete. All nodes synchronized.');
      } else {
        setSyncState('failed');
        setBackendAlive(false);
        setSyncError(result.error || 'Server unreachable.');
        setSyncMessage('Offline local mode. Changes buffered locally.');
      }
    } catch (err: any) {
      setSyncState('failed');
      setBackendAlive(false);
      setSyncError(err.message || 'Connection lost.');
      setSyncMessage('Offline local mode. Changes buffered locally.');
    }

    // 提示信息 3 秒后清空
    setTimeout(() => {
      setSyncState('idle');
    }, 3000);
  }

  // 5. 导入 & 导出备份
  // 导出单篇 Markdown 文件
  function handleExportMarkdown() {
    if (!activeNote) return;
    const blob = new Blob([activeNote.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeNote.title.replace(/\s+/g, '_')}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // 导出完整的 JSON 本地 LWW 数据集
  function handleExportJSONBackup() {
    const dataStr = JSON.stringify(notes, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SovereignNote_Backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // 导入并合流 JSON 备份文件
  function handleImportJSONBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported: Note[] = JSON.parse(event.target?.result as string);
        if (!Array.isArray(imported)) {
          alert('Invalid backup format: Expected a JSON array of Notes.');
          return;
        }

        // LWW 递归对两端合流
        const mergedMap = new Map<string, Note>();

        // 载入当前
        for (const n of notes) {
          mergedMap.set(n.id, n);
        }

        // 交叉合并导入的 (LWW机制)
        let mergedCount = 0;
        let addedCount = 0;

        for (const imp of imported) {
          if (!imp.id || typeof imp.title !== 'string') continue;
          
          const current = mergedMap.get(imp.id);
          if (!current) {
            mergedMap.set(imp.id, imp);
            addedCount++;
          } else if (imp.updated_at > current.updated_at) {
            mergedMap.set(imp.id, imp);
            mergedCount++;
          }
        }

        const newlyMerged = Array.from(mergedMap.values());
        setNotes(newlyMerged);
        saveLocalNotes(newlyMerged);
        
        alert(`Backup imported successfully!\n- Added ${addedCount} new notes\n- Merged ${mergedCount} newer notes`);
        
        if (newlyMerged.length > 0) {
          const nextActive = newlyMerged.find(n => !n.deleted);
          if (nextActive) setActiveId(nextActive.id);
        }

        // 重新同步至后台
        handleManualSync();

      } catch (err) {
        alert('Failed to parse backup JSON. Please ensure it is a valid SovereignNote backup.');
      }
    };
    reader.readAsText(file);
    // 重置 input
    e.target.value = '';
  }

  // 快捷编辑器插入 markdown 语法
  function insertMarkdownShortcut(prefix: string, suffix: string = '') {
    const textarea = document.getElementById('note-textarea') as HTMLTextAreaElement;
    if (!textarea || !activeNote) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);

    const replacement = prefix + (selected || 'text') + suffix;
    const newContent = text.substring(0, start) + replacement + text.substring(end);
    
    updateActiveNote(activeNote.title, newContent);

    // 插入后重新获取焦点
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + (selected || 'text').length);
    }, 50);
  }

  return (
    <div id="sovereign-workspace" className="min-h-screen flex flex-col bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      
      {/* 顶部状态与功能标题栏 */}
      <header className="h-16 px-6 bg-slate-950 border-b border-slate-800 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-lg text-white shadow-md shadow-indigo-900/30">
            S
          </div>
          <div>
            <h1 className="text-md font-bold tracking-wider text-slate-50 uppercase">SovereignNote v2</h1>
            <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">Decentralized LWW Core</p>
          </div>
        </div>

        {/* 控制组：网络指示与核心同步 */}
        <div className="flex items-center space-x-4">
          
          {/* 服务器通信卡片 */}
          <div className="hidden md:flex items-center space-x-2.5 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs">
            {backendAlive === true ? (
              <>
                <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Sovereign Core Live</span>
              </>
            ) : backendAlive === false ? (
              <>
                <CloudOff className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                <span className="text-amber-500 font-medium">Standalone Local Node</span>
              </>
            ) : (
              <>
                <RotateCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />
                <span className="text-slate-400 font-medium">Probing local server...</span>
              </>
            )}
          </div>

          <button
            onClick={handleManualSync}
            disabled={syncState === 'syncing'}
            className="flex items-center space-x-2 text-xs font-semibold px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow-sm shadow-indigo-900/20"
          >
            <RotateCw className={`w-3.5 h-3.5 ${syncState === 'syncing' ? 'animate-spin' : ''}`} />
            <span>{syncState === 'syncing' ? 'Synchronizing...' : 'Sync Now'}</span>
          </button>

          {/* 备份提取选项 */}
          <div className="flex items-center border-l border-slate-800 pl-4 space-x-2">
            <button
              onClick={handleExportJSONBackup}
              title="Download entire database backup"
              className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-indigo-400 hover:border-indigo-500/40 transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Import and merge database backup (LWW)"
              className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-indigo-400 hover:border-indigo-500/40 transition-colors"
            >
              <Upload className="w-4 h-4" />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImportJSONBackup} 
              accept=".json" 
              className="hidden" 
            />
          </div>
        </div>
      </header>

      {/* 工作区提示条 */}
      {syncMessage && (
        <div className={`h-10 px-6 flex items-center justify-between text-xs font-medium transition-all duration-300 ${
          syncState === 'success' ? 'bg-emerald-950/80 border-b border-emerald-800 text-emerald-300' : 
          syncState === 'failed' ? 'bg-amber-950/80 border-b border-amber-800 text-amber-300' : 'bg-slate-950 border-b border-slate-800 text-indigo-300'
        }`}>
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4 text-indigo-400" />
            <span>{syncMessage}</span>
          </div>
          {syncError && <span className="font-mono text-[10px] bg-red-900/40 border border-red-800 px-1.5 py-0.5 rounded text-red-300">{syncError}</span>}
        </div>
      )}

      {/* 底部主体工作区 */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* 左侧：列表与过滤面板 */}
        <aside className="w-80 border-r border-slate-800 flex flex-col bg-slate-950 flex-shrink-0">
          
          {/* 搜索栏与创建按钮 */}
          <div className="p-4 space-y-3">
            <button
              onClick={handleCreateNote}
              className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 hover:border-indigo-500/60 font-semibold text-xs tracking-wider uppercase transition-all duration-200 active:scale-98"
            >
              <Plus className="w-4 h-4" />
              <span>Compose Note</span>
            </button>

            {/* 搜寻框 */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes / content..."
                className="w-full h-9 pl-9 pr-4 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
          </div>

          {/* 标签快选面板 */}
          {allTags.length > 0 && (
            <div className="px-4 pb-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <Tag className="w-3 h-3" />
                <span>Filter by tag</span>
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                <button
                  onClick={() => setSelectedTag(null)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                    !selectedTag 
                      ? 'bg-indigo-505/20 text-indigo-400 border-indigo-500/50' 
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  All Tags
                </button>
                {allTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${
                      tag === selectedTag 
                        ? 'bg-indigo-600 text-white border-indigo-500' 
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-300'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 排序及信息统计标头 */}
          <div className="px-4 py-2.5 bg-slate-900 border-y border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
            <span>{filteredNotes.length} Notes found</span>
            <div className="flex items-center space-x-2">
              <span className="text-slate-500 font-medium">Sort:</span>
              <button
                onClick={() => setSortBy(sortBy === 'updated' ? 'title' : 'updated')}
                className="text-indigo-400 font-bold hover:underline"
              >
                {sortBy === 'updated' ? 'Latest Edited' : 'Alphabetical'}
              </button>
            </div>
          </div>

          {/* 笔记卡片列表容器 */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-900/65">
            {filteredNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-slate-600 space-y-2">
                <FileText className="w-10 h-10 stroke-[1.5]" />
                <p className="text-xs">No notes found matching current filters.</p>
              </div>
            ) : (
              filteredNotes.map(note => {
                const isActive = note.id === activeId;
                const date = new Date(note.updated_at).toLocaleString('zh-CN', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });
                
                // 剔除 # 标签修饰直接获取第一行前20字简述
                const textWithoutTags = note.content.replace(/#[a-zA-Z0-9_\u4e00-\u9fa5]+/g, '').replace(/[#*`>-]/g, '').trim();
                const snippet = textWithoutTags.slice(0, 40) || 'Empty document content';

                return (
                  <div
                    key={note.id}
                    onClick={() => setActiveId(note.id)}
                    className={`p-4 relative cursor-pointer select-none border-l-2 transition-all ${
                      isActive 
                        ? 'bg-slate-900/80 border-indigo-500 text-slate-100' 
                        : 'hover:bg-slate-900/50 border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between space-x-2">
                      <h4 className="font-bold text-xs truncate max-w-[180px] text-slate-200">
                        {note.title || 'Untitled Note'}
                      </h4>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNote(note.id);
                        }}
                        className="p-1 rounded text-slate-600 hover:text-rose-400 hover:bg-slate-850 hover:border-rose-500/20 md:opacity-0 hover:opacity-100 focus:opacity-100 group-hover:opacity-100 transition-all"
                        style={{ contentVisibility: 'auto' }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-[11px] leading-relaxed line-clamp-2 text-slate-400 mt-1 mb-2 font-mono">
                      {snippet}
                    </p>

                    <div className="flex items-center justify-between text-[9px] text-slate-500">
                      <span>{date}</span>
                      
                      {/* 单笔记级标签提取小芯片 */}
                      <div className="flex space-x-1 overflow-hidden max-w-[120px]">
                        {extractTags(note.content).slice(0, 2).map(tag => (
                          <span key={tag} className="px-1 py-0.5 rounded bg-slate-800 text-[8px] text-indigo-400 font-semibold">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* 右侧：Markdown 编辑器与实时渲染视场 */}
        <main className="flex-1 flex flex-col bg-slate-900 overflow-hidden">
          {activeNote ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              
              {/* 编辑标题与快选栏 */}
              <div className="h-14 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-950 flex-shrink-0">
                <input
                  type="text"
                  value={activeNote.title}
                  onChange={(e) => updateActiveNote(e.target.value, activeNote.content)}
                  placeholder="Enter note title..."
                  className="bg-transparent text-sm font-extrabold text-slate-100 border-none focus:outline-none w-1/2 focus:ring-0 focus:border-none placeholder-slate-600"
                />

                {/* 编辑模式多端控制卡片 & 单Markdown文件导出 */}
                <div className="flex items-center space-x-3 text-xs">
                  
                  {/* 编辑器状态按钮组 */}
                  <div className="flex rounded-lg bg-slate-900 border border-slate-800 p-0.5">
                    <button
                      onClick={() => setEditorMode('edit')}
                      className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        editorMode === 'edit' 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Edit3 className="w-3 h-3" />
                      <span className="hidden sm:inline">Editor</span>
                    </button>
                    <button
                      onClick={() => setEditorMode('split')}
                      className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        editorMode === 'split' 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Layout className="w-3 h-3" />
                      <span className="hidden sm:inline">Split</span>
                    </button>
                    <button
                      onClick={() => setEditorMode('preview')}
                      className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        editorMode === 'preview' 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      <span className="hidden sm:inline">Preview</span>
                    </button>
                  </div>

                  <button
                    onClick={handleExportMarkdown}
                    title="Export active note as Markdown .md"
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:text-indigo-400 hover:border-indigo-500/40 text-slate-400 transition-colors"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline text-[10px] font-bold uppercase tracking-wider">Export MD</span>
                  </button>
                </div>
              </div>

              {/* 快捷排版工具条（仅在包含写动作的模式下显示） */}
              {editorMode !== 'preview' && (
                <div className="h-10 px-6 border-b border-slate-800/60 bg-slate-950 flex items-center space-x-4 flex-shrink-0 text-slate-500 text-xs">
                  <button onClick={() => insertMarkdownShortcut('# ', '')} className="hover:text-slate-200 font-bold">H1</button>
                  <button onClick={() => insertMarkdownShortcut('## ', '')} className="hover:text-slate-200 font-bold">H2</button>
                  <button onClick={() => insertMarkdownShortcut('### ', '')} className="hover:text-slate-200 font-bold">H3</button>
                  <div className="h-4 w-px bg-slate-800"></div>
                  <button onClick={() => insertMarkdownShortcut('**', '**')} className="hover:text-slate-200 font-semibold">B</button>
                  <button onClick={() => insertMarkdownShortcut('*', '*')} className="hover:text-slate-200 italic">I</button>
                  <button onClick={() => insertMarkdownShortcut('`', '`')} className="hover:text-slate-200 font-mono">Code</button>
                  <button onClick={() => insertMarkdownShortcut('```\n', '\n```')} className="hover:text-slate-200 font-mono">BlockCode</button>
                  <div className="h-4 w-px bg-slate-800"></div>
                  <button onClick={() => insertMarkdownShortcut('- ', '')} className="hover:text-slate-200">List</button>
                  <button onClick={() => insertMarkdownShortcut('> ', '')} className="hover:text-slate-200 italic">Quote</button>
                  <button onClick={() => insertMarkdownShortcut('#', '')} className="hover:text-slate-200 font-semibold text-indigo-400">#Tag</button>
                </div>
              )}

              {/* 下半部编辑及预览画布 */}
              <div className="flex-1 flex overflow-hidden">
                
                {/* 1. 纯文本框 (Editor) */}
                {(editorMode === 'edit' || editorMode === 'split') && (
                  <div className="flex-1 h-full overflow-hidden flex flex-col bg-[#111827]">
                    <textarea
                      id="note-textarea"
                      value={activeNote.content}
                      onChange={(e) => updateActiveNote(activeNote.title, e.target.value)}
                      placeholder="Compile markdown note workspace..."
                      className="flex-1 w-full h-full p-6 resize-none bg-slate-950/40 text-slate-250 font-mono text-sm border-none focus:outline-none focus:ring-0 leading-relaxed overflow-y-auto"
                    />
                  </div>
                )}

                {/* 2. 竖立切割线 */}
                {editorMode === 'split' && (
                  <div className="w-px bg-slate-800 flex-shrink-0 h-full"></div>
                )}

                {/* 3. 实时编译视窗 (Preview Canvas) */}
                {(editorMode === 'preview' || editorMode === 'split') && (
                  <div className="flex-1 h-full overflow-y-auto p-8 bg-slate-900 border-l border-transparent">
                    <div 
                      className="prose prose-invert prose-indigo max-w-none text-slate-300 font-sans"
                      dangerouslySetInnerHTML={{ __html: parseMarkdown(activeNote.content) }}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-600 space-y-3">
              <div className="w-16 h-16 rounded-full bg-slate-950 flex items-center justify-center text-indigo-400/80 border border-slate-800 shadow-xl">
                <FileText className="w-8 h-8 stroke-[1.2]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-350 tracking-wider">No active note selected</h3>
                <p className="text-[11px] text-slate-500 mt-1 max-w-xs">Create a new workspace entry or pick an existing note from the sidebar lists.</p>
              </div>
              <button
                onClick={handleCreateNote}
                className="px-4 py-2 mt-2 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors shadow shadow-indigo-900/30"
              >
                Create note now
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
