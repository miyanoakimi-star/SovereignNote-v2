import { useState } from 'react';
import { NavState, Note } from '../types';
import { parseMarkdown } from '../utils/markdown';
import { Layout, Eye, FileDown, EyeOff, Settings, Calendar as CalendarIcon, Database } from 'lucide-react';

interface MainAreaProps {
  navState: NavState;
  activeNote: Note | null;
  updateActiveNote: (title: string, content: string) => void;
}

export default function MainArea({ navState, activeNote, updateActiveNote }: MainAreaProps) {
  const [editorMode, setEditorMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [isToolbarOpen, setIsToolbarOpen] = useState(true);

  if (navState === 'settings') {
    return (
      <div className="flex-1 flex flex-col bg-slate-900 border-l border-slate-800 text-slate-200 overflow-y-auto w-full">
        <div className="h-14 px-8 border-b border-slate-800 flex items-center shrink-0">
          <Settings className="w-5 h-5 mr-3 text-indigo-400" />
          <h1 className="font-bold">设置与配置</h1>
        </div>
        <div className="p-8 max-w-2xl space-y-8">
          
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Database className="w-4 h-4" /> 本地与网络同步
            </h2>
            <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">局域网 (LAN) 同步</h3>
                  <p className="text-xs text-slate-500 mt-1">通过 WebRTC 或内部 IP 直接与局域网节点同步</p>
                </div>
                <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold shadow-sm transition-colors">开启</button>
              </div>
            </div>
            <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-800 space-y-4">
              <div>
                <h3 className="font-semibold text-sm">WebDAV 配置</h3>
                <p className="text-xs text-slate-500 mt-1">连接至 Nextcloud、ownCloud 或通用 WebDAV 服务</p>
              </div>
              <div className="space-y-3">
                <input className="w-full bg-slate-900 border border-slate-700 p-2.5 rounded text-sm focus:border-indigo-500 outline-none" placeholder="WebDAV 服务器 URL (https://...)" />
                <input className="w-full bg-slate-900 border border-slate-700 p-2.5 rounded text-sm focus:border-indigo-500 outline-none" placeholder="用户名" />
                <input className="w-full bg-slate-900 border border-slate-700 p-2.5 rounded text-sm focus:border-indigo-500 outline-none" type="password" placeholder="应用密码" />
              </div>
              <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold transition-colors">测试连接</button>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">备份与导入</h2>
            <div className="flex gap-4">
              <button className="flex-1 p-4 bg-slate-800/50 rounded-xl border border-slate-800 hover:border-indigo-500/50 text-left transition-colors">
                 <h3 className="font-bold text-sm text-indigo-400 mb-1">导出数据库</h3>
                 <p className="text-xs text-slate-500">下载完整的数据和同步状态 (JSON 等格式)</p>
              </button>
              <button className="flex-1 p-4 bg-slate-800/50 rounded-xl border border-slate-800 hover:border-indigo-500/50 text-left transition-colors">
                 <h3 className="font-bold text-sm text-indigo-400 mb-1">从文件夹导入</h3>
                 <p className="text-xs text-slate-500">批量扫描并导入本地 MD、TXT 文件夹</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (navState === 'calendar') {
    return (
      <div className="flex-1 flex flex-col bg-slate-900 border-l border-slate-800 text-slate-200 overflow-hidden w-full">
        <div className="h-14 px-8 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center">
            <CalendarIcon className="w-5 h-5 mr-3 text-indigo-400" />
            <h1 className="font-bold">2026年 5月</h1>
          </div>
          <div className="flex bg-slate-800 rounded p-1 space-x-1">
             <button className="px-3 py-1 bg-slate-700 rounded text-xs shadow-sm shadow-slate-900">月视图</button>
             <button className="px-3 py-1 text-slate-400 hover:text-slate-200 text-xs text-center">周视图</button>
             <button className="px-3 py-1 text-slate-400 hover:text-slate-200 text-xs text-center">日程</button>
          </div>
        </div>
        <div className="flex-1 p-8 overflow-y-auto">
          {/* Mock Calendar Grid with robust spacing */}
          <div className="grid grid-cols-7 gap-px bg-slate-800 rounded-xl overflow-hidden border border-slate-800 shadow-xl shadow-slate-950/20">
            {['日', '一', '二', '三', '四', '五', '六'].map(day => (
              <div key={day} className="bg-slate-900 p-3 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">{day}</div>
            ))}
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className={`bg-slate-950 p-2 min-h-[120px] max-h-[140px] border-t border-slate-800 group hover:bg-slate-900/50 transition-colors ${i === 15 ? 'bg-indigo-900/10' : ''}`}>
                 <div className="flex justify-between items-start">
                    <span className={`text-xs font-semibold ${i === 15 ? 'text-indigo-400' : 'text-slate-400'}`}>
                      {i < 31 ? i + 1 : i - 30}
                    </span>
                    {i === 9 || i === 15 || i === 24 ? (
                      <span className="text-[9px] text-slate-600 font-medium">廿三</span> // Mock Lunar
                    ) : null}
                 </div>
                 
                 {i === 15 && (
                   <div className="mt-2 p-1.5 bg-indigo-600/20 border border-indigo-500/30 rounded text-[10px] text-indigo-300 truncate cursor-pointer hover:bg-indigo-600/40">
                     ✈️ 飞往东京
                   </div>
                 )}
                 {i === 9 && (
                   <div className="mt-2 p-1.5 bg-emerald-600/20 border border-emerald-500/30 rounded text-[10px] text-emerald-300 truncate cursor-pointer hover:bg-emerald-600/40">
                     🎉 App 发布会
                   </div>
                 )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!activeNote) {

    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900 text-slate-500 flex-col">
        <Layout className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-sm">请从侧边栏中选择一条笔记以查看内容</p>
      </div>
    );
  }

  function handleExportMarkdown() {
    const blob = new Blob([activeNote!.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeNote!.title.replace(/\\s+/g, '_')}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden">
      <div className="h-14 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-950 shrink-0">
        <div className="flex items-center space-x-2">
          <button onClick={() => setIsToolbarOpen(!isToolbarOpen)} className="text-slate-500 hover:text-slate-300 mr-2" title="切换工具栏">
            {isToolbarOpen ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <input
            type="text"
            value={activeNote.title}
            onChange={(e) => updateActiveNote(e.target.value, activeNote.content)}
            placeholder="输入标题..."
            className="bg-transparent text-sm font-bold text-slate-100 border-none focus:outline-none focus:ring-0 placeholder-slate-600 w-64"
          />
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <div className="flex rounded-lg bg-slate-900 border border-slate-800 p-0.5">
            <button onClick={() => setEditorMode('edit')} className={`px-2 py-1 rounded text-[10px] uppercase font-bold ${editorMode === 'edit' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>编辑</button>
            <button onClick={() => setEditorMode('split')} className={`px-2 py-1 rounded text-[10px] uppercase font-bold ${editorMode === 'split' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>双屏</button>
            <button onClick={() => setEditorMode('preview')} className={`px-2 py-1 rounded text-[10px] uppercase font-bold ${editorMode === 'preview' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>预览</button>
          </div>
          <button onClick={handleExportMarkdown} className="flex items-center gap-1 text-slate-400 hover:text-indigo-400">
            <FileDown className="w-4 h-4" /> <span className="hidden sm:inline">导出 MD</span>
          </button>
        </div>
      </div>

      {isToolbarOpen && editorMode !== 'preview' && (
        <div className="h-10 px-6 border-b border-slate-800/60 bg-slate-950 flex items-center space-x-4 shrink-0 text-slate-500 text-xs">
          <button className="hover:text-slate-200 font-bold">H1</button>
          <button className="hover:text-slate-200 font-bold">H2</button>
          <button className="hover:text-slate-200 font-semibold text-indigo-400">#标签</button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {(editorMode === 'edit' || editorMode === 'split') && (
          <div className="flex-1 h-full bg-[#111827]">
            <textarea
              value={activeNote.content}
              onChange={(e) => updateActiveNote(activeNote.title, e.target.value)}
              className="w-full h-full p-6 bg-transparent text-slate-200 font-mono text-sm resize-none focus:outline-none focus:ring-0"
              placeholder="在此编写 Markdown..."
            />
          </div>
        )}

        {editorMode === 'split' && <div className="w-px bg-slate-800" />}

        {(editorMode === 'preview' || editorMode === 'split') && (
          <div className="flex-1 h-full overflow-y-auto p-8 bg-slate-900 code-preview">
            <div 
              className="prose prose-invert prose-indigo max-w-none text-slate-300 font-sans"
              dangerouslySetInnerHTML={{ __html: parseMarkdown(activeNote.content) }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
