import { useMemo } from 'react';
import { NavState, Note } from '../types';
import { Plus, ChevronLeft, Trash2 } from 'lucide-react';

interface PartitionBarProps {
  navState: NavState;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  notes: Note[];
  activeNoteId: string | null;
  setActiveNoteId: (id: string | null) => void;
  searchQuery: string;
  handleCreateNote: () => void;
  handleDeleteNote: (id: string) => void;
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
  handleDeleteNote
}: PartitionBarProps) {
  if (!isOpen) return null;

  const nonDeletedNotes = useMemo(() => notes.filter(n => !n.deleted), [notes]);

  // Handle Notes view
  if (navState === 'notes') {
    const filteredNotes = nonDeletedNotes.filter(note => 
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => b.updated_at - a.updated_at);

    return (
      <div className="w-80 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="h-14 px-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold text-slate-100">笔记列表</h2>
          <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-300">
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 shrink-0">
          <button
            onClick={handleCreateNote}
            className="w-full flex items-center justify-center space-x-2 py-2 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 font-semibold text-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>新建笔记</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
          {filteredNotes.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">未找到笔记。</div>
          ) : (
            filteredNotes.map(note => {
              const snippet = note.content.replace(/#[a-zA-Z0-9_\u4e00-\u9fa5]+/g, '').replace(/[#*`>-]/g, '').trim().slice(0, 40);
              return (
                <div
                  key={note.id}
                  onClick={() => setActiveNoteId(note.id)}
                  className={`p-4 cursor-pointer border-l-2 transition-all ${
                    note.id === activeNoteId ? 'bg-slate-800/80 border-indigo-500 text-slate-100' : 'border-transparent text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                  }`}
                >
                  <div className="flex justify-between">
                    <h4 className="font-bold text-xs truncate">{note.title || '无标题'}</h4>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }} className="text-slate-600 hover:text-rose-400">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{snippet}</p>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  if (navState === 'settings') {
    return (
      <div className="w-80 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="h-14 px-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold text-slate-100">设置</h2>
          <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-300">
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 p-2 space-y-1">
          {['通用', '同步备份', 'WebDAV 配置', '局域网同步', '导出数据'].map((item) => (
             <div key={item} className="p-3 text-sm text-slate-400 hover:bg-slate-800 rounded cursor-pointer">{item}</div>
          ))}
        </div>
      </div>
    );
  }

  if (navState === 'tags') {
    return (
      <div className="w-80 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="h-14 px-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold text-slate-100">标签目录</h2>
          <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-300">
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 p-4 text-xs text-slate-400 overflow-y-auto">
          <div className="space-y-2">
            <div className="font-bold text-indigo-400"># Development</div>
            <div className="pl-4"># React</div>
            <div className="pl-4"># Rust (2)</div>
            <div className="pl-8 text-slate-500">## Embedded (支持6级深度)</div>
            <div className="font-bold text-indigo-400 mt-4"># Personal</div>
            <div className="pl-4"># Ideas</div>
          </div>
        </div>
      </div>
    );
  }

  if (navState === 'calendar') {
    return (
      <div className="w-80 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="h-14 px-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold text-slate-100">日程安排</h2>
          <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-300">
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 p-4 flex items-center justify-center text-xs text-slate-400 text-center">
          事件和日程列表将显示在这里。主区域显示月视图。
        </div>
      </div>
    )
  }

  // Placeholder for Tags, Calendar, Settings partitions
  return (
    <div className="w-80 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
      <div className="h-14 px-4 border-b border-slate-800 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-bold text-slate-100 capitalize">{navState} Partition</h2>
        <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-300">
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 p-4 text-slate-400 text-xs text-center flex flex-col items-center justify-center">
        此视图即将推出。请从“笔记”中选择一条笔记以查看编辑器。
      </div>
    </div>
  );
}
