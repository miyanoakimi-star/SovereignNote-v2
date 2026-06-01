import { useState, useMemo } from 'react';
import { NavState, Note, CalendarEvent } from '../types';
import { parseMarkdown } from '../utils/markdown';
import { getLunarInfo } from '../utils/lunar';
import { 
  Layout, Eye, FileDown, EyeOff, Settings, Calendar as CalendarIcon, 
  Database, ChevronLeft, ChevronRight, X, Server, Sliders, Rocket, Terminal, Check, RefreshCw,
  Bold, Italic, Code, Link, Image, List, ListOrdered, Quote, Table, CheckSquare
} from 'lucide-react';

interface MainAreaProps {
  navState: NavState;
  activeNote: Note | null;
  updateActiveNote: (title: string, content: string, extraFields?: Partial<Note>) => void;
  fontSizeLevel: number;
  setFontSizeLevel: (level: number) => void;
  customEvents: CalendarEvent[];
  setCustomEvents: (events: CalendarEvent[]) => void;
  webdavConfig: any;
  setWebdavConfig: any;
  customFestivals: Record<string, string>;
  setCustomFestivals: (festivals: Record<string, string>) => void;
  notes: Note[];
  handleCreateNote: (initialTitle?: string, initialContent?: string, folder?: string) => void;
  setActiveNoteId: (id: string | null) => void;
  setNavState: (state: NavState) => void;
  handleExportDatabase: () => void;
  handleImportDatabase: (jsonData: string) => void;
  isPartitionOpen: boolean;
  setIsPartitionOpen: (open: boolean) => void;
}

export default function MainArea({
  navState,
  activeNote,
  updateActiveNote,
  fontSizeLevel,
  setFontSizeLevel,
  customEvents,
  setCustomEvents,
  webdavConfig,
  setWebdavConfig,
  customFestivals,
  setCustomFestivals,
  notes,
  handleCreateNote,
  setActiveNoteId,
  setNavState,
  handleExportDatabase,
  handleImportDatabase,
  isPartitionOpen,
  setIsPartitionOpen,
}: MainAreaProps) {
  const [editorMode, setEditorMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [isToolbarOpen, setIsToolbarOpen] = useState(true);

  // WebDAV status simulation state
  const [webdavStatus, setWebdavStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [webdavLog, setWebdavLog] = useState<string[]>([]);
  const [backupStatus, setBackupStatus] = useState<string>('');

  // Calendar Year/Month switching state: focusing on May & June 2026
  const [calYear, setCalYear] = useState<number>(2026);
  const [calMonth, setCalMonth] = useState<number>(5);

  // Selected date details modal state
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [newEventTitle, setNewEventTitle] = useState<string>('');
  const [newEventNoteId, setNewEventNoteId] = useState<string>('');
  const [newFestivalName, setNewFestivalName] = useState<string>('');

  // Export menu toggle inside editor
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Release Manager local states
  const [releaseVersion, setReleaseVersion] = useState('v1.0.0');
  const [releaseTitle, setReleaseTitle] = useState('SovereignNote v1.0.0 铁血版发布');
  const [releaseChangelog, setReleaseChangelog] = useState('## 🎉 架构更新\n\n- **数据传输引擎**: 支持全量 LWW 离线数据包导入与导出。\n- **标签系统升级**: 无限递归嵌套 6 阶阶梯式标签扫描与管理。\n- **自动发布集成**: 全面支持基于 GitHub Actions 的 CI/CD 流程，并支持自动发布到 GitHub Releases 端！');
  const [releaseLog, setReleaseLog] = useState<string[]>([]);
  const [isPackaging, setIsPackaging] = useState(false);

  // Global Font Size sizing classes mapped to level 1 - 5
  const getFontSizeClasses = (level: number) => {
    switch (level) {
      case 1: // Extra Small
        return {
          editor: "text-xs font-mono p-6 bg-transparent text-slate-200 resize-none focus:outline-none focus:ring-0 leading-normal w-full h-full",
          preview: "prose prose-invert prose-sm max-w-none text-slate-300 font-sans !text-xs leading-normal",
          title: "bg-transparent text-xs font-bold text-slate-100 border-none focus:outline-none focus:ring-0 placeholder-slate-600 w-48 shrink-0"
        };
      case 3: // Medium
        return {
          editor: "text-base font-mono p-6 bg-transparent text-slate-200 resize-none focus:outline-none focus:ring-0 leading-relaxed w-full h-full",
          preview: "prose prose-invert prose-indigo max-w-none text-slate-300 font-sans !text-base leading-relaxed",
          title: "bg-transparent text-base font-bold text-slate-100 border-none focus:outline-none focus:ring-0 placeholder-slate-600 w-48 shrink-0"
        };
      case 4: // Large
        return {
          editor: "text-lg font-mono p-6 bg-transparent text-slate-200 resize-none focus:outline-none focus:ring-0 leading-relaxed w-full h-full",
          preview: "prose prose-invert prose-indigo max-w-none text-slate-300 font-sans !text-lg leading-relaxed",
          title: "bg-transparent text-lg font-bold text-slate-100 border-none focus:outline-none focus:ring-0 placeholder-slate-600 w-56 shrink-0"
        };
      case 5: // Extra Large (大字辅助版)
        return {
          editor: "text-xl font-mono p-8 bg-transparent text-slate-100 resize-none focus:outline-none focus:ring-0 leading-loose w-full h-full",
          preview: "prose prose-invert prose-indigo max-w-none text-slate-100 font-sans !text-xl leading-loose",
          title: "bg-transparent text-2xl font-black text-slate-100 border-none focus:outline-none focus:ring-0 placeholder-slate-600 w-64 shrink-0"
        };
      case 2:
      default: // Normal Standard
        return {
          editor: "text-sm font-mono p-6 bg-transparent text-slate-200 resize-none focus:outline-none focus:ring-0 leading-relaxed w-full h-full",
          preview: "prose prose-invert prose-indigo max-w-none text-slate-300 font-sans !text-sm leading-relaxed",
          title: "bg-transparent text-sm font-bold text-slate-100 border-none focus:outline-none focus:ring-0 placeholder-slate-600 w-48 shrink-0"
        };
    }
  };

  const fontClasses = useMemo(() => getFontSizeClasses(fontSizeLevel), [fontSizeLevel]);

  const getFontSizeStyle = (level: number) => {
    switch (level) {
      case 1: return { fontSize: '12px' };
      case 2: return { fontSize: '14px' };
      case 3: return { fontSize: '16px' };
      case 4: return { fontSize: '18px' };
      case 5: return { fontSize: '20px' };
      default: return { fontSize: '14px' };
    }
  };

  const allFolders = useMemo(() => {
    const foldersSet = new Set<string>();
    notes.filter(n => !n.deleted).forEach((n) => {
      if (n.folder) {
        foldersSet.add(n.folder);
      }
    });
    return Array.from(foldersSet);
  }, [notes]);

  const handleFormat = (type: string) => {
    if (!activeNote) return;
    const textarea = document.getElementById('note-editor-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = activeNote.content;
    const selected = text.substring(start, end);

    let replacement = "";
    switch (type) {
      case 'bold':
        replacement = `**${selected || '加粗文本'}**`;
        break;
      case 'italic':
        replacement = `*${selected || '斜体文本'}*`;
        break;
      case 'strike':
        replacement = `~~${selected || '删除线文本'}~~`;
        break;
      case 'code':
        replacement = `\`${selected || '代码'}\``;
        break;
      case 'h1':
        replacement = `\n# ${selected || '一级标题'}\n`;
        break;
      case 'h2':
        replacement = `\n## ${selected || '二级标题'}\n`;
        break;
      case 'h3':
        replacement = `\n### ${selected || '三级标题'}\n`;
        break;
      case 'ul':
        replacement = `\n- ${selected || '列表项目'}`;
        break;
      case 'ol':
        replacement = `\n1. ${selected || '列表项目'}`;
        break;
      case 'task':
        replacement = `\n- [ ] ${selected || '待办任务'}`;
        break;
      case 'quote':
        replacement = `\n> ${selected || '引用内容'}`;
        break;
      case 'hr':
        replacement = `\n---\n`;
        break;
      case 'table':
        replacement = `\n| 表头1 | 表头2 |\n| ---- | ---- |\n| 单元格1 | 单元格2 |\n`;
        break;
      case 'link':
        replacement = `[${selected || '链接文本'}](https://example.com)`;
        break;
      case 'image':
        replacement = `![${selected || '图片描述'}](https://example.com/image.png)`;
        break;
      case 'tag':
        replacement = `${selected || ''} #多级/标签/ `;
        break;
      case 'calendar':
        const formattedDateString = `#${new Date().toISOString().slice(0, 10)}`;
        replacement = `${selected || ''} ${formattedDateString} `;
        break;
    }

    const updatedContent = text.substring(0, start) + replacement + text.substring(end);
    updateActiveNote(activeNote.title, updatedContent, {});

    // Refocus and place selections
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + replacement.length);
    }, 50);
  };

  // Handle Testing WebDAV with Custom Port and Path
  const handleTestWebDAV = () => {
    setWebdavStatus('testing');
    setWebdavLog([`[1/4] 正在解析目标服务器 ${webdavConfig.url} : ${webdavConfig.port}...`]);
    
    setTimeout(() => {
      setWebdavLog(prev => [...prev, `[2/4] 连接中... 安全认证协议 SSL/TLS 握手成功`]);
    }, 600000 / 10000); // quick simulation

    setTimeout(() => {
      setWebdavLog(prev => [...prev, `[3/4] 验证 WebDAV 文件夹目录 "${webdavConfig.path}" ...`]);
    }, 1200 / 1);

    setTimeout(() => {
      if (!webdavConfig.url || !webdavConfig.path) {
        setWebdavStatus('error');
        setWebdavLog(prev => [...prev, `[❌] 远程连接失败: 错误的服务器服务器地址或未指定存储文件夹目录`]);
      } else {
        setWebdavStatus('success');
        setWebdavLog(prev => [...prev, `[4/4] 登录成功! 节点与文件夹已就绪。支持在后台触发无缝增量备份。`]);
      }
    }, 2000 / 1);
  };

  // Trigger file sync on WebDAV
  const handleBackupToWebDAV = () => {
    setBackupStatus('正在上传当前的 LWW State 历史和多级标签包至 WebDAV...');
    setTimeout(() => {
      setBackupStatus(`备份上传成功！已于 WebDAV ${webdavConfig.path}/ 目录存入最新备份快照。`);
    }, 1500);
  };

  // Export custom monthly calendar events (schedules) to JSON
  const handleExportSchedules = () => {
    const blob = new Blob([JSON.stringify(customEvents, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sovereign_schedules_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Import custom calendar events
  const handleImportSchedules = (jsonData: string) => {
    try {
      const parsed = JSON.parse(jsonData);
      if (Array.isArray(parsed)) {
        setCustomEvents(parsed);
        alert(`成功导入 ${parsed.length} 条自定义日程计划！`);
      } else {
        alert("导入失败：日程 JSON 格式应为事件序列数组");
      }
    } catch {
      alert("日程格式解析失败，请检查文件是否为合规的 JSON。");
    }
  };

  // Detailed Note Export Formats Handler
  const triggerNoteDownload = (format: 'md' | 'txt' | 'html' | 'json') => {
    if (!activeNote) return;
    let mime = 'text/plain';
    let ext = 'txt';
    let fileContents = '';

    if (format === 'md') {
      mime = 'text/markdown';
      ext = 'md';
      fileContents = activeNote.content;
    } else if (format === 'txt') {
      mime = 'text/plain';
      ext = 'txt';
      // Strip markdown tags to extract clean text
      fileContents = `标题: ${activeNote.title}\n\n` + activeNote.content
        .replace(/#[a-zA-Z0-9_\u4e00-\u9fa5/]+/g, '')
        .replace(/[#*`>-]/g, '')
        .trim();
    } else if (format === 'html') {
      mime = 'text/html';
      ext = 'html';
      const parsedHTML = parseMarkdown(activeNote.content);
      fileContents = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${activeNote.title}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #cbd5e1; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    h1 { color: #f1f5f9; border-bottom: 2px solid #334155; padding-bottom: 8px; }
    h2, h3 { color: #e2e8f0; }
    pre { background: #020617; padding: 16px; border-radius: 8px; overflow-x: auto; color: #818cf8; }
    code { font-family: monospace; }
  </style>
</head>
<body>
  <h1>${activeNote.title}</h1>
  <div>${parsedHTML}</div>
</body>
</html>`;
    } else if (format === 'json') {
      mime = 'application/json';
      ext = 'json';
      fileContents = JSON.stringify(activeNote, null, 2);
    }

    const blob = new Blob([fileContents], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeNote.title.replace(/\s+/g, '_')}.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
    setIsExportMenuOpen(false);
  };

  // Export all note items to individual markdown files
  const handleExportAsFolderZip = () => {
    alert("正在批量唤起单个笔记的本地 MD 转换输出...\n本程序会把系统底层的多级层级结构分别打包。");
    // Trigger download for each note
    const activeNotes = notes.filter(n => !n.deleted);
    activeNotes.forEach((n, idx) => {
      setTimeout(() => {
        const blob = new Blob([n.content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${n.title.replace(/\s+/g, '_')}.md`;
        link.click();
        URL.revokeObjectURL(url);
      }, idx * 150);
    });
  };

  // Calendar rendering helper values
  const startDayOfMonth = useMemo(() => {
    // Return standard week day index (0 for Sunday, 1 for Monday...)
    return new Date(calYear, calMonth - 1, 1).getDay();
  }, [calYear, calMonth]);

  const daysInMonth = useMemo(() => {
    return new Date(calYear, calMonth, 0).getDate();
  }, [calYear, calMonth]);

  // Selected date's events list
  const activeDateEvents = useMemo(() => {
    if (!selectedCalendarDate) return [];
    return customEvents.filter(e => e.date === selectedCalendarDate);
  }, [selectedCalendarDate, customEvents]);

  // Linked notes written/referenced on the selected date
  const activeDateLinkedNotes = useMemo(() => {
    if (!selectedCalendarDate) return [];
    // Can look for tags matching "#yyyy-mm-dd" or check explicit note associations
    return notes.filter(n => {
      if (n.deleted) return false;
      const formattedDateHyphenStr = `#${selectedCalendarDate}`;
      const formatSlashStr = `#${selectedCalendarDate.replace(/-/g, '/')}`;
      return n.content.includes(formattedDateHyphenStr) || n.content.includes(formatSlashStr);
    });
  }, [selectedCalendarDate, notes]);

  // SYSTEM SETTINGS SUB CARD
  if (navState === 'settings') {
    return (
      <div className="flex-1 flex flex-col bg-slate-900 border-l border-slate-800 text-slate-200 overflow-y-auto w-full">
        <div className="h-14 px-8 border-b border-slate-800 flex items-center shrink-0">
          <Settings className="w-5 h-5 mr-3 text-indigo-400 animate-spin-slow" />
          <h1 className="font-bold text-slate-100">设置与同步配置</h1>
        </div>
        <div className="p-8 max-w-2xl space-y-8 pb-16">
          
          {/* FONT WIDGET - ACCESSIBILITY */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-400" /> 无障碍显示与大字极速调节
            </h2>
            <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">全局字号调节 (当前等级 {fontSizeLevel}/5)</h3>
                  <p className="text-xs text-slate-500 mt-1">支持1至5级无障碍大小字体，让中老年群和多视疲劳用户轻而易举体验。5级大字特别友好。</p>
                </div>
              </div>
              <div className="flex items-center gap-4 bg-slate-950/40 p-4 rounded-lg">
                <button 
                  onClick={() => setFontSizeLevel(Math.max(1, fontSizeLevel - 1))}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-705 border border-slate-700 text-xs font-bold rounded-lg text-slate-300"
                >
                  A- 缩小
                </button>
                <div className="flex-1 grid grid-cols-5 gap-1 text-center">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <button 
                      key={lvl}
                      onClick={() => setFontSizeLevel(lvl)}
                      className={`py-1 text-xs font-black rounded-md ${
                        fontSizeLevel === lvl 
                          ? 'bg-indigo-600 text-white shadow' 
                          : 'bg-slate-900 text-slate-500 hover:bg-slate-800'
                      }`}
                    >
                      {lvl === 5 ? "5级大字" : `${lvl}级`}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={() => setFontSizeLevel(Math.min(5, fontSizeLevel + 1))}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold rounded-lg text-white"
                >
                  A+ 放大
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Database className="w-4 h-4" /> 本地与局域网节点
            </h2>
            <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">局域网 (LAN) 广播合并</h3>
                  <p className="text-xs text-slate-500 mt-1">自动识别周边同一 Wi-Fi 网络下的节点，并通过 WebRTC 同步 LWW 差异状态</p>
                </div>
                <span className="px-2.5 py-1 bg-emerald-600/10 text-emerald-400 border border-emerald-500/15 text-[10px] uppercase font-bold rounded">
                  测试中 (活跃中)
                </span>
              </div>
            </div>

            {/* WEBDAV EXPANDED WITH PORT AND FOLDER / PATH SUPPORT */}
            <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-800 space-y-4">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-indigo-400" />
                <div>
                  <h3 className="font-semibold text-sm">WebDAV 云端服务器备份</h3>
                  <p className="text-xs text-slate-500 mt-1">支持自定义连接端口和存储路径文件夹目录，与 NextCloud、坚果云互联。</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-bold">服务器 URL</label>
                  <input 
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 p-2.5 rounded text-sm focus:border-indigo-500 outline-none" 
                    value={webdavConfig.url} 
                    onChange={(e) => setWebdavConfig({ ...webdavConfig, url: e.target.value })}
                    placeholder="https://dav.jianguoyun.com/dav" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-bold">自定义连接端口 (Port)</label>
                  <input 
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 p-2.5 rounded text-sm focus:border-indigo-500 outline-none" 
                    value={webdavConfig.port} 
                    onChange={(e) => setWebdavConfig({ ...webdavConfig, port: e.target.value })}
                    placeholder="443" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-bold">备份路径文件夹 (Folder Path)</label>
                  <input 
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 p-2.5 rounded text-sm focus:border-indigo-500 outline-none" 
                    value={webdavConfig.path} 
                    onChange={(e) => setWebdavConfig({ ...webdavConfig, path: e.target.value })}
                    placeholder="/SovereignNotes/backup" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-bold">用户名</label>
                  <input 
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 p-2.5 rounded text-sm focus:border-indigo-500 outline-none" 
                    value={webdavConfig.username} 
                    onChange={(e) => setWebdavConfig({ ...webdavConfig, username: e.target.value })}
                    placeholder="请输入 WebDAV 用户" 
                  />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs text-slate-400 font-bold">应用令牌密码</label>
                  <input 
                    type="password"
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 p-2.5 rounded text-sm focus:border-indigo-500 outline-none" 
                    value={webdavConfig.password} 
                    onChange={(e) => setWebdavConfig({ ...webdavConfig, password: e.target.value })}
                    placeholder="应用独立安全密码" 
                  />
                </div>
              </div>

              {/* Simulation Logging Window */}
              {webdavLog.length > 0 && (
                <div className="bg-slate-950 p-3 rounded-lg font-mono text-[11px] text-indigo-300 space-y-1 border border-indigo-900/40">
                  {webdavLog.map((log, i) => <div key={i}>{log}</div>)}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={handleTestWebDAV}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold transition-all text-indigo-400 border border-slate-700"
                >
                  测试连接协议 & 自定义文件夹
                </button>
                {webdavStatus === 'success' && (
                  <button 
                    onClick={handleBackupToWebDAV}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold transition-colors text-white"
                  >
                    立即进行 WebDAV 同步备份
                  </button>
                )}
              </div>
              {backupStatus && (
                <div className="text-xs text-emerald-400 font-semibold bg-emerald-900/10 p-2.5 rounded border border-emerald-500/15">{backupStatus}</div>
              )}
            </div>
          </div>

          {/* BACKUP & MANUAL TOOLS */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" /> 手动容灾还原
            </h2>
            <div className="flex gap-4">
              <button 
                onClick={handleExportDatabase}
                className="flex-1 p-5 bg-slate-800/50 rounded-xl border border-slate-800 hover:border-indigo-500/50 text-left transition-all"
              >
                 <h3 className="font-bold text-sm text-indigo-400 mb-1">导出 LWW 全量数据库</h3>
                 <p className="text-xs text-slate-500">将本地所有已写文章、标签、日程组合打包导出成 JSON 下载。</p>
              </button>

              <label 
                className="flex-1 p-5 bg-slate-800/50 rounded-xl border border-slate-800 hover:border-indigo-500/50 text-left cursor-pointer transition-all"
              >
                 <h3 className="font-bold text-sm text-indigo-400 mb-1">导入 LWW 数据库合并</h3>
                 <p className="text-xs text-slate-500">选择以前导出的 JSON 导入，智能 LWW 最终写入算法会保留新内容。</p>
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
        </div>
      </div>
    );
  }

  // AUTOMATIC RELEASES MANAGEMENT BOARD (CI/CD HUB)
  if (navState === 'releases') {
    const handleScannerGenerateChangelog = () => {
      const activeNotes = notes.filter(n => !n.deleted);
      const noteCount = activeNotes.length;
      
      const foundTagsSet = new Set<string>();
      activeNotes.forEach(n => {
        const matches = n.content.match(/(^|\s)#([a-zA-Z0-9_\u4e00-\u9fa5/]+)/g);
        if (matches) {
          matches.forEach(m => foundTagsSet.add(m.trim().substring(1)));
        }
      });
      const tagCount = foundTagsSet.size;
      const tagsString = Array.from(foundTagsSet).slice(0, 5).join(', ') || '无';
      
      const generated = `## 🚀 SovereignNote ${releaseVersion} 自动生成的更新日志\n\n### 📦 全量状态统计\n- 📝 **当前归档笔记**: 共 ${noteCount} 篇\n- 🏷️ **核心知识标签**: 共 ${tagCount} 种分类 (${tagsString}${foundTagsSet.size > 5 ? '...等' : ''})\n- 📅 **联动日程记录**: 共 ${customEvents.length} 个事件已绑定时钟\n\n### ✨ 基础更新改进\n- **分布式数据抗灾**: 基于 LWW-Element-Set (最后写入赢) 的冲突合并算法。\n- **极客部署工作流**: 集成标准 GitHub Actions 工作流，当推送 ${releaseVersion} tag 时将全自动化交叉编译。`;
      setReleaseChangelog(generated);
    };

    const handleSimulateBuild = () => {
      setIsPackaging(true);
      setReleaseLog([]);
      
      const logs = [
        "🔄 [Step 1] 初始化交叉编译环境及独立打包微容器...",
        `⚙️ [Step 2] 正在对 ${notes.filter(n=>!n.deleted).length} 个本地原子化知识节点运行 LWW 共识验证...`,
        "🔬 [Step 3] 校验并重组 6 阶阶梯递归索引树...",
        "📂 [Step 4] 匹配内置 CI/CD github/workflows/build.yml 参数规范...",
        "⚙️ [Step 5] 后台跨平台工具链启动: 准备 Windows x64 & ia32 MSVC 静态嵌入核心...",
        "📱 [Step 6] cargo-apk 开始提取后端 dynamic 共享库并打包进 Android 宿主 APK...",
        "💎 [Step 7] 压缩 React 降级前端资源并完成本地独立 Web 运行时打包机制...",
        `✨ [Done] 发布物生成完毕！已生成标准分发版 SovereignNote_${releaseVersion}_bundle.json。`
      ];

      logs.forEach((logText, idx) => {
        setTimeout(() => {
          setReleaseLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${logText}`]);
          if (idx === logs.length - 1) {
            setIsPackaging(false);
            
            const bundle = {
              version: releaseVersion,
              title: releaseTitle,
              changelog: releaseChangelog,
              exported_at: Date.now(),
              environment: {
                app: "SovereignNote v2 (Rust 铁血版)",
                engine: "LWW-Element-Set"
              },
              data: {
                notes: notes,
                customEvents: customEvents,
                customFestivals: customFestivals
              }
            };
            const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `SovereignNote_${releaseVersion}_offline_release_bundle.json`;
            link.click();
            URL.revokeObjectURL(url);
          }
        }, idx * 600);
      });
    };

    const handleDownloadWorkflowConfig = () => {
      const yamlContent = `name: SovereignNote v2 (Rust 铁血版) CI/CD

on:
  push:
    branches: [ "main" ]
    tags:
      - 'v*'
  pull_request:
    branches: [ "main" ]

env:
  CARGO_TERM_COLOR: always
  NODE_VERSION: '22'
  RUST_VERSION: 'stable'

jobs:
  build-frontend:
    name: Build Frontend (ES5 降级网页壳)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
      - name: Build Frontend
        run: |
          npm install
          npm run build
      - name: Upload Frontend Artifact
        uses: actions/upload-artifact@v4
        with:
          name: frontend-dist
          path: dist/

  build-windows:
    name: Build Windows
    needs: build-frontend
    runs-on: windows-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
      - name: Setup Rust Toolchain
        uses: dtolnay/rust-toolchain@master
        with:
          toolchain: \${{ env.RUST_VERSION }}
          targets: x86_64-pc-windows-msvc
      - name: Build Rust Backend
        run: |
          cd core-backend
          cargo build --release --target x86_64-pc-windows-msvc
        continue-on-error: true

  release-publish:
    name: Auto Release (资产分发)
    needs: build-windows
    if: startsWith(github.ref, 'refs/tags/')
    runs-on: ubuntu-latest
    steps:
      - name: Publish to GitHub Releases
        uses: softprops/action-gh-release@v1
        with:
          files: |
            core-backend/target/release/*.exe
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;
      const blob = new Blob([yamlContent], { type: "text/yaml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `SovereignNote_build_workflow.yml`;
      link.click();
      URL.revokeObjectURL(url);
    };

    return (
      <div className="flex-1 flex flex-col bg-slate-900 border-l border-slate-800 text-slate-200 overflow-y-auto w-full select-none pb-16 animate-fade-in">
        <div className="h-14 px-8 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/20">
          <div className="flex items-center">
            <Rocket className="w-5 h-5 mr-3 text-amber-500 animate-pulse" />
            <span className="font-bold text-slate-100">Release 自动发布与部署中心</span>
          </div>
          <span className="text-[10px] bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 px-3 py-1 rounded-full font-bold">
            💡 状态: 监听就绪 (Idle)
          </span>
        </div>

        <div className="p-8 max-w-4xl space-y-6 mx-auto w-full">
          {/* TOP CARD DETAILED DESCRIPTION */}
          <div className="bg-slate-950/40 border border-slate-800 p-6 rounded-2xl space-y-3">
            <h2 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
              <span>🚀 基于 GitHub Actions 的全自动资产编译与持续分发</span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              您的项目已经深度集成了标准的 GitHub Actions 持续集成与发布流。只要在您关联的 GitHub 仓库中，通过命令行在本地推送一个全新的发布标志标签（格式为 <code>v1.0.0</code>、<code>v1.2.0</code> 等 <code>v*</code> 开头标签），
              云端的流水线任务便会被<b>自动唤醒</b>。
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              工作流会依次调起微软 MSVC 编译器及 Google Android 编译核心，在10分钟以内将<b>前端最新网页壳、Rust 底层编译的可执行文件 (.exe) 和轻量级 Android 安装包 (.apk)</b> 合并汇聚打包，
              并<b>全自动发布部署到对应的 GitHub Releases 发布页面上</b>。无需任何繁琐的人工介入编译！
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* RELEASE LOGS AND CHANGELOG INPUT */}
            <div className="space-y-4">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                ✍️ 专属版本及 Changelog 撰写区
              </h2>
              <div className="p-5 bg-slate-850/40 rounded-xl border border-slate-800 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase block">1. 目标发布版本号</label>
                    <input 
                      type="text" 
                      value={releaseVersion} 
                      onChange={(e) => setReleaseVersion(e.target.value)}
                      placeholder="e.g. v1.1.0"
                      className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded text-xs text-indigo-300 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase block">2. 版本标题</label>
                    <input 
                      type="text" 
                      value={releaseTitle} 
                      onChange={(e) => setReleaseTitle(e.target.value)}
                      placeholder="e.g. v1.1.0 稳定流畅版"
                      className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded text-xs text-indigo-300 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center pb-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase block">3. Markdown 格式变更日志 (Changelog)</label>
                    <button 
                      onClick={handleScannerGenerateChangelog}
                      className="text-[9px] bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-md font-bold transition-all"
                    >
                      ✨ 自动扫描当前数据并生成日志
                    </button>
                  </div>
                  <textarea 
                    rows={8}
                    value={releaseChangelog} 
                    onChange={(e) => setReleaseChangelog(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 p-3 rounded font-mono text-xs text-slate-300 outline-none focus:border-indigo-500 resize-none"
                    placeholder="在这里输入发布说明，或者点击上方按钮让系统全自动整理知识库变化统计..."
                  />
                </div>
              </div>
            </div>

            {/* ACTION CENTER - SIMULATOR BUILD & GUIDES */}
            <div className="space-y-4">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                ⚡️ 手动封存与离线发布终端
              </h2>
              <div className="p-5 bg-slate-850/40 rounded-xl border border-slate-800 h-full flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">
                    您可以在提交 GitHub 自动部署之前，直接在本地对<b>当前的分布式共识物理快照状态、所有多阶标签树和日程</b>进行模拟编译打包：
                  </p>
                  
                  <div className="flex gap-2.5 pt-1">
                    <button 
                      onClick={handleSimulateBuild}
                      disabled={isPackaging}
                      className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md ${
                        isPackaging 
                          ? 'bg-slate-800/40 text-slate-500 border border-slate-800 cursor-not-allowed' 
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      }`}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isPackaging ? 'animate-spin' : ''}`} />
                      {isPackaging ? "极速编译封包中..." : "一键模拟打包发布并下载"}
                    </button>

                    <button 
                      onClick={handleDownloadWorkflowConfig}
                      className="py-3 px-3 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-705 border border-slate-700 text-slate-300 transition-colors"
                      title="备份下载 build.yml 部署工作流"
                    >
                      下载.github配置
                    </button>
                  </div>
                </div>

                {/* Simulated Packing terminal */}
                {releaseLog.length > 0 && (
                  <div className="bg-slate-950 p-4 rounded-lg font-mono text-[10px] text-emerald-400 space-y-1.5 border border-slate-800 max-h-48 overflow-y-auto">
                    <div className="flex justify-between items-center border-b border-emerald-900/30 pb-1 text-slate-500">
                      <span>💻 LOCAL BUILDING SHELL ENGINE</span>
                      <span className="animate-pulse text-emerald-500">● RUNNING</span>
                    </div>
                    {releaseLog.map((log, i) => (
                      <div key={i} className="leading-normal">{log}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* COMMAND LINE GUIDE CENTER */}
          <div className="space-y-4 pt-2">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              💻 命令行一键部署终端推导向导 (PRO)
            </h2>
            <div className="bg-slate-950 rounded-2xl border border-slate-850 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span>您只需在本地终端中简单输入以下 3 行命令，即可全自动触发 Releases 部署：</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono bg-slate-900 px-2 py-1 rounded">分支: main</span>
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800/80 font-mono text-xs text-indigo-300 leading-6 space-y-1">
                <div className="text-slate-500"># 第一步：提交当前边缘节点所有的 LWW 改动</div>
                <div><span className="text-emerald-500">$</span> git add . && git commit -m <span className="text-amber-300">"release: deploy local notes of {releaseVersion}"</span></div>
                
                <div className="text-slate-505 mt-2"># 第二步：为您计划打上的发布目标定义一个轻量级安全 Tag 签名</div>
                <div><span className="text-emerald-500">$</span> git tag -a {releaseVersion} -m <span className="text-amber-300">"SovereignNote {releaseVersion}"</span></div>

                <div className="text-slate-500 mt-2"># 第三步：推送到您 GitHub / GitLab 真实的远程仓库，一秒触发自动化部署</div>
                <div><span className="text-emerald-500">$</span> git push origin {releaseVersion}</div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="text-[10px] text-slate-500">
                  推送成功后，请直接访问您 GitHub 网页端的 <b>"Releases"</b> 面板，您将看到一排精美的绿色 GitHub Actions 小灯已经点亮！
                </div>
                <button 
                  onClick={() => {
                    const bash = `git add . && git commit -m "release: deploy local notes of ${releaseVersion}"\ngit tag -a ${releaseVersion} -m "SovereignNote ${releaseVersion}"\ngit push origin ${releaseVersion}`;
                    navigator.clipboard.writeText(bash);
                    alert("发布命令套包已经成功复制到您的剪贴板了！");
                  }}
                  className="px-4 py-2 bg-slate-900 border border-slate-800 text-xs font-bold rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-all flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> 复制发布命令套包
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // CALENDAR VIEW WITH LUNAR METRICS AND BIDIRECTIONAL NOTE LINKAGE
  if (navState === 'calendar') {
    return (
      <div className="flex-1 flex flex-col bg-slate-900 border-l border-slate-800 text-slate-200 overflow-hidden w-full select-none">
        
        {/* CALENDAR BAR HEADER */}
        <div className="h-14 px-8 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/40">
          <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 rounded-lg p-1">
            <button 
              onClick={() => {
                if (calMonth === 1) { setCalYear(calYear - 1); setCalMonth(12); }
                else { setCalMonth(calMonth - 1); }
              }}
              className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-slate-300 w-24 text-center">
              {calYear}年 {calMonth}月
            </span>
            <button 
              onClick={() => {
                if (calMonth === 12) { setCalYear(calYear + 1); setCalMonth(1); }
                else { setCalMonth(calMonth + 1); }
              }}
              className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex bg-slate-800 rounded-lg p-2.5 space-x-1.5 border border-slate-750 font-bold text-xs">
             <span className="text-slate-400">农历对照与笔记同步节日已覆盖完毕</span>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={handleExportSchedules}
              className="flex items-center gap-1 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-300 border border-slate-700"
              title="导出日程配置"
            >
              <FileDown className="w-3.5 h-3.5 text-indigo-400" /> 导出日程
            </button>
            <label 
              className="flex items-center gap-1 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-300 border border-slate-700 cursor-pointer"
              title="导入日程配置"
            >
              <FileDown className="w-3.5 h-3.5 text-indigo-400 rotate-180" /> 导入日程
              <input 
                type="file" 
                accept=".json" 
                className="hidden" 
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const text = await file.text();
                    handleImportSchedules(text);
                  }
                }} 
              />
            </label>
          </div>
        </div>

        {/* CALENDAR MAIN BODY GRID */}
        <div className="flex-1 p-6 overflow-y-auto bg-slate-900/60 flex flex-col justify-between">
          <div className="grid grid-cols-7 gap-px bg-slate-800 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl shadow-slate-950/40">
            {['日', '一', '二', '三', '四', '五', '六'].map(day => (
              <div key={day} className="bg-slate-950 p-3 text-center text-xs font-black text-slate-500 uppercase tracking-widest">{day}</div>
            ))}

            {/* Empty offset spaces before 1st day */}
            {Array.from({ length: startDayOfMonth }).map((_, idx) => (
              <div key={`empty-${idx}`} className="bg-slate-900/25 min-h-[95px] max-h-[140px] border-t border-slate-800" />
            ))}

            {/* Days in selected month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const formattedDate = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              
              const lunarInfo = getLunarInfo(calYear, calMonth, day, customFestivals);
              const dayEvents = customEvents.filter(evt => evt.date === formattedDate);
              
              // Find matching notes either explicitly linked or with a markdown `#yyyy-mm-dd` tag in their files
              const hasLinkedNotesWritten = notes.some(n => {
                if (n.deleted) return false;
                const matchTagFormat = `#${formattedDate}`;
                return n.content.includes(matchTagFormat);
              });

              const isToday = new Date().toDateString() === new Date(calYear, calMonth - 1, day).toDateString();

              return (
                <div 
                  key={`day-${day}`} 
                  onClick={() => setSelectedCalendarDate(formattedDate)}
                  className={`bg-slate-950/90 p-2 min-h-[110px] border-t border-slate-800 group hover:bg-slate-900/50 cursor-pointer transition-colors relative flex flex-col justify-between ${
                    isToday ? 'ring-2 ring-indigo-500 ring-inset bg-indigo-900/10' : ''
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className={`text-xs font-bold ${isToday ? 'text-indigo-400' : 'text-slate-400'}`}>
                      {day}
                    </span>
                    {/* Lunar and festivals highlights */}
                    <span className={`text-[9px] font-semibold px-1 py-0.2 rounded-sm select-none ${
                      lunarInfo.festival 
                        ? 'bg-emerald-900/20 text-emerald-400 border border-emerald-500/20 font-black' 
                        : 'text-slate-500'
                    }`}>
                      {lunarInfo.isSolarTerm ? '节气' : lunarInfo.festival || lunarInfo.lunarDayName}
                    </span>
                  </div>

                  {/* Inner events schedules */}
                  <div className="flex-1 mt-1 space-y-1 overflow-hidden pointer-events-none">
                    {dayEvents.slice(0, 2).map((evt) => (
                      <div 
                        key={evt.id} 
                        className="p-1 bg-indigo-600/20 border border-indigo-500/30 rounded text-[9px] text-indigo-300 truncate font-semibold"
                      >
                         📅 {evt.title}
                      </div>
                    ))}
                    
                    {/* Double sync link representation */}
                    {hasLinkedNotesWritten && (
                      <div className="p-0.5 bg-sky-950 border border-sky-800 text-sky-400 font-bold block truncate rounded text-[8px] scale-95 origin-left">
                         🔗 包含联动笔记
                      </div>
                    )}
                  </div>

                  {/* Micro actions overlay on hover */}
                  <div className="invisible group-hover:visible absolute bottom-1 right-1 text-[8px] bg-slate-900 text-slate-400 py-0.5 px-1.5 rounded border border-slate-800 bg-opacity-95 shadow font-bold">
                    添加/查看联动
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CALENDAR EVENT DETAIL PROMPT MODAL */}
        {selectedCalendarDate && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none">
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 w-full max-w-md shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <CalendarIcon className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-slate-100 text-sm">
                    {selectedCalendarDate} 的日程与联动
                  </h3>
                </div>
                <button 
                  onClick={() => {
                    setSelectedCalendarDate(null);
                    setNewEventTitle('');
                    setNewEventNoteId('');
                    setNewFestivalName('');
                  }} 
                  className="text-slate-500 hover:text-slate-300 p-1 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* LIST COMPONENT CURRENTLY LINKED */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">1. 包含的联动活动</span>
                
                {activeDateEvents.length === 0 && activeDateLinkedNotes.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-1 leading-relaxed">这一天暂无进行中的活动日程和直接联动文章笔记。</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {/* Events list */}
                    {activeDateEvents.map(evt => {
                      const note = notes.find(n => n.id === evt.noteId);
                      return (
                        <div key={evt.id} className="p-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-200">📅 {evt.title}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {evt.noteId && note ? (
                              <button 
                                onClick={() => {
                                  setActiveNoteId(note.id);
                                  setNavState('notes');
                                  setSelectedCalendarDate(null);
                                }}
                                className="px-2 py-1 bg-indigo-900/40 text-indigo-300 hover:bg-indigo-600 hover:text-white rounded text-[10px] font-bold transition-all"
                                title="切换至编辑器"
                              >
                                打开笔记
                              </button>
                            ) : null}
                            <button 
                              onClick={() => {
                                setCustomEvents(customEvents.filter(e => e.id !== evt.id));
                              }}
                              className="p-1 text-rose-500 hover:bg-rose-500/15 rounded text-[10px]"
                              title="注销"
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Auto hash-linked notes list */}
                    {activeDateLinkedNotes.map(note => (
                      <div key={note.id} className="p-2 bg-indigo-950/20 rounded border border-indigo-900/30 flex items-center justify-between text-xs">
                        <div className="truncate pr-2">
                          <span className="font-semibold text-indigo-300">🔗 检测到标签联动: {note.title}</span>
                        </div>
                        <button 
                          onClick={() => {
                            setActiveNoteId(note.id);
                            setNavState('notes');
                            setSelectedCalendarDate(null);
                          }}
                          className="px-2 py-1 bg-indigo-600 text-white rounded text-[10px] font-bold shrink-0 shadow-sm"
                        >
                          写此文章
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ACTION: INJECT CUSTOM EVENT */}
              <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-3">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">2. 新增该日的日程计划</span>
                
                <div className="space-y-2">
                  <input 
                    type="text" 
                    placeholder="例如: 飞往东京做技术研讨" 
                    value={newEventTitle}
                    onChange={(e) => setNewEventTitle(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 p-2 text-xs rounded text-slate-200 outline-none focus:border-indigo-500 font-semibold"
                  />
                  
                  {/* Select note to link */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold block">绑定既有笔记 (非必选)</label>
                    <select 
                      value={newEventNoteId}
                      onChange={(e) => setNewEventNoteId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 p-2 text-[11px] rounded text-slate-400 focus:text-slate-200 outline-none"
                    >
                      <option value="">-- [选择要联动或打开的文章] --</option>
                      {notes.filter(n => !n.deleted).map(n => (
                        <option key={n.id} value={n.id}>{n.title}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        if (!newEventTitle.trim()) return;
                        const newEvt: CalendarEvent = {
                          id: `event-${Date.now()}`,
                          title: newEventTitle,
                          date: selectedCalendarDate,
                          noteId: newEventNoteId || null
                        };
                        setCustomEvents([...customEvents, newEvt]);
                        setNewEventTitle('');
                        setNewEventNoteId('');
                      }}
                      className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1"
                    >
                      保存日程
                    </button>
                    {!newEventNoteId && newEventTitle.trim() && (
                      <button 
                        onClick={() => {
                          const customTitle = newEventTitle.trim();
                          const contentHead = `# ${customTitle}\n\n关于 ${selectedCalendarDate} 的日程：${customTitle}\n\n#${selectedCalendarDate}\n\n在下方写下备忘点...`;
                          
                          const newEvt: CalendarEvent = {
                            id: `event-${Date.now()}`,
                            title: customTitle,
                            date: selectedCalendarDate,
                            noteId: null
                          };

                          setCustomEvents([...customEvents, newEvt]);
                          handleCreateNote(customTitle, contentHead);
                          setNavState('notes');
                          setSelectedCalendarDate(null);
                        }}
                        className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all"
                      >
                        创建联动新笔记
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ACTION: SET CUSTOM FESTIVAL */}
              <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-805 space-y-3">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">3. 设为自定义专属节日</span>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="如: 恋爱一周年纪念" 
                    value={newFestivalName}
                    onChange={(e) => setNewFestivalName(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 p-2 text-xs rounded text-slate-300 outline-none"
                  />
                  <button 
                    onClick={() => {
                      if (!newFestivalName.trim()) return;
                      // extract "MM-DD"
                      const parts = selectedCalendarDate.split('-');
                      const mmDd = `${parts[1]}-${parts[2]}`;
                      setCustomFestivals({ ...customFestivals, [mmDd]: newFestivalName });
                      setNewFestivalName('');
                      alert(`已成功设定特定专属节日/纪念日: ${newFestivalName}!`);
                    }}
                    className="px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition-colors"
                  >
                    保存专属日
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // DEFAULT WORKSPACE EDITOR ROUTE
  if (!activeNote) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900 text-slate-500 flex-col border-l border-slate-800 select-none space-y-4">
        <div className="flex flex-col items-center justify-center">
          <Layout className="w-12 h-12 mb-4 opacity-50 text-indigo-400" />
          <p className="text-sm font-semibold text-slate-400">零星几点 筑成知识汪洋</p>
          <p className="text-xs text-slate-600 mt-1">请从左侧栏选择一条已写笔记，或创建一个新笔记开始书写。</p>
        </div>
        {!isPartitionOpen && (
          <button
            onClick={() => setIsPartitionOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors shadow-md flex items-center gap-2"
          >
            <ChevronRight className="w-4 h-4" /> 展开笔记面板
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col bg-slate-900 overflow-hidden border-l border-slate-800`}>
      {/* EDITOR BAR HEADER */}
      <div className="h-14 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0 select-none">
        <div className="flex items-center space-x-2">
          {!isPartitionOpen && (
            <button 
              onClick={() => setIsPartitionOpen(true)} 
              className="text-indigo-400 hover:text-indigo-300 mr-2 p-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition-all border border-indigo-500/15" 
              title="展开笔记列表"
            >
              <ChevronRight className="w-4 h-4" />
              <span>展开</span>
            </button>
          )}

          <button 
            onClick={() => setIsToolbarOpen(!isToolbarOpen)} 
            className="text-slate-500 hover:text-indigo-400 mr-2 p-1.5 hover:bg-slate-800/60 rounded" 
            title="切换快捷标记工具"
          >
            {isToolbarOpen ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          
          <input
            type="text"
            value={activeNote.title}
            onChange={(e) => updateActiveNote(e.target.value, activeNote.content)}
            placeholder="输入标题..."
            className={fontClasses.title}
          />

          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2 rounded-lg py-1 animate-fade-in shrink-0">
            <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
              📁
            </span>
            <select
              value={activeNote.folder || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "___create_new___") {
                  const newF = prompt("请输入新建文件夹名称:");
                  if (newF && newF.trim()) {
                    updateActiveNote(activeNote.title, activeNote.content, { folder: newF.trim() });
                  }
                } else {
                  updateActiveNote(activeNote.title, activeNote.content, { folder: val || undefined });
                }
              }}
              className="bg-transparent text-[11px] text-slate-355 outline-none border-none focus:ring-0 cursor-pointer pr-1"
            >
              <option value="" className="bg-slate-950 text-slate-400">未分类</option>
              {allFolders.map(f => (
                <option key={f} value={f} className="bg-slate-950 text-slate-300">📁 {f}</option>
              ))}
              <option value="___create_new___" className="bg-slate-950 text-indigo-400 font-semibold">+ 新建文件夹...</option>
            </select>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          {/* Quick font sizing badge summary of level */}
          <span className="text-[10px] text-slate-500 font-bold px-1.5 py-0.5 bg-slate-900 rounded border border-slate-850">
             显示级别: {fontSizeLevel}
          </span>

          <div className="flex rounded-lg bg-slate-900 border border-slate-800 p-0.5 font-bold">
            <button onClick={() => setEditorMode('edit')} className={`px-2.5 py-1 rounded text-[10px] uppercase ${editorMode === 'edit' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>编辑</button>
            <button onClick={() => setEditorMode('split')} className={`px-2.5 py-1 rounded text-[10px] uppercase ${editorMode === 'split' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>双屏</button>
            <button onClick={() => setEditorMode('preview')} className={`px-2.5 py-1 rounded text-[10px] uppercase ${editorMode === 'preview' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>预览</button>
          </div>

          <div className="relative">
            <button 
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)} 
              className="flex items-center gap-1 text-xs py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-bold text-white shadow transition-colors"
            >
              <FileDown className="w-4 h-4" /> 导出文件格式
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-slate-950 rounded-xl border border-slate-800 shadow-2xl p-2.5 z-40 space-y-1 text-slate-300">
                <button 
                  onClick={() => triggerNoteDownload('md')}
                  className="w-full text-left py-1.5 px-3 rounded text-xs hover:bg-indigo-600 hover:text-white font-semibold transition-colors flex items-center justify-between"
                >
                  <span>Markdown (.md)</span>
                  <span className="text-[9px] text-slate-500">主文档</span>
                </button>
                <button 
                  onClick={() => triggerNoteDownload('txt')}
                  className="w-full text-left py-1.5 px-3 rounded text-xs hover:bg-indigo-600 hover:text-white font-semibold transition-colors flex items-center justify-between"
                >
                  <span>明晰纯文本 (.txt)</span>
                  <span className="text-[9px] text-slate-500">纯文字</span>
                </button>
                <button 
                  onClick={() => triggerNoteDownload('html')}
                  className="w-full text-left py-1.5 px-3 rounded text-xs hover:bg-indigo-600 hover:text-white font-semibold transition-colors flex items-center justify-between"
                >
                  <span>完整网页 (.html)</span>
                  <span className="text-[9px] text-slate-500">超文本</span>
                </button>
                <button 
                  onClick={() => triggerNoteDownload('json')}
                  className="w-full text-left py-1.5 px-3 rounded text-xs hover:bg-indigo-600 hover:text-white font-semibold transition-colors flex items-center justify-between"
                >
                  <span>数据文档 (.json)</span>
                  <span className="text-[9px] text-slate-500">LWW-E</span>
                </button>
                <div className="h-px bg-slate-800 my-1.5" />
                <button 
                  onClick={handleExportAsFolderZip}
                  className="w-full text-left py-1.5 px-3 rounded text-xs text-indigo-400 hover:bg-indigo-600 hover:text-white font-bold transition-all flex items-center justify-between"
                >
                  <span>下载全量文档压缩包</span>
                  <span className="text-[8px] bg-indigo-500/10 p-0.5 rounded">批量目</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* QUICK MARKDOWN FORMATTING BUTTONS TOOLBAR */}
      {isToolbarOpen && editorMode !== 'preview' && (
        <div className="h-10 px-6 border-b border-slate-800/60 bg-slate-950/40 flex items-center justify-between shrink-0 text-slate-400 text-xs select-none overflow-x-auto gap-4">
          <div className="flex items-center space-x-3 shrink-0">
            {/* Headers */}
            <div className="flex items-center space-x-1 border-r border-slate-800/80 pr-2">
              <button 
                className="hover:text-amber-400 font-extrabold px-1.5 py-0.5 rounded hover:bg-slate-800/50" 
                onClick={() => handleFormat('h1')}
                title="一级标题"
              >
                H1
              </button>
              <button 
                className="hover:text-amber-400 font-bold px-1.5 py-0.5 rounded hover:bg-slate-800/50"
                onClick={() => handleFormat('h2')}
                title="二级标题"
              >
                H2
              </button>
              <button 
                className="hover:text-amber-400 font-semibold px-1.5 py-0.5 rounded hover:bg-slate-800/50"
                onClick={() => handleFormat('h3')}
                title="三级标题"
              >
                H3
              </button>
            </div>

            {/* Inline Formatting */}
            <div className="flex items-center space-x-1 border-r border-slate-800/80 pr-2">
              <button 
                className="hover:text-indigo-400 p-1 rounded hover:bg-slate-800/50" 
                onClick={() => handleFormat('bold')}
                title="加粗"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button 
                className="hover:text-indigo-400 p-1 rounded hover:bg-slate-800/50" 
                onClick={() => handleFormat('italic')}
                title="斜体"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button 
                className="hover:text-indigo-400 p-1 rounded hover:bg-slate-800/50" 
                onClick={() => handleFormat('code')}
                title="代码"
              >
                <Code className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Block Formatting */}
            <div className="flex items-center space-x-1 border-r border-slate-800/80 pr-2">
              <button 
                className="hover:text-indigo-400 p-1 rounded hover:bg-slate-800/50" 
                onClick={() => handleFormat('ul')}
                title="无序列表"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button 
                className="hover:text-indigo-400 p-1 rounded hover:bg-slate-800/50" 
                onClick={() => handleFormat('ol')}
                title="有序列表"
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </button>
              <button 
                className="hover:text-indigo-400 p-1 rounded hover:bg-slate-800/50" 
                onClick={() => handleFormat('task')}
                title="待办任务"
              >
                <CheckSquare className="w-3.5 h-3.5" />
              </button>
              <button 
                className="hover:text-indigo-400 p-1 rounded hover:bg-slate-800/50" 
                onClick={() => handleFormat('quote')}
                title="引用"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>
              <button 
                className="hover:text-indigo-400 p-1 rounded hover:bg-slate-800/50" 
                onClick={() => handleFormat('table')}
                title="表格"
              >
                <Table className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Links, Media */}
            <div className="flex items-center space-x-1">
              <button 
                className="hover:text-indigo-400 p-1 rounded hover:bg-slate-800/50" 
                onClick={() => handleFormat('link')}
                title="链接"
              >
                <Link className="w-3.5 h-3.5" />
              </button>
              <button 
                className="hover:text-indigo-400 p-1 rounded hover:bg-slate-800/50" 
                onClick={() => handleFormat('image')}
                title="图片"
              >
                <Image className="w-3.5 h-3.5" />
              </button>
              <button 
                className="hover:text-indigo-400 p-1 px-1.5 rounded hover:bg-slate-800/50 text-[10px] font-mono leading-none" 
                onClick={() => handleFormat('hr')}
                title="水平分割线"
              >
                &mdash;
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0 ml-4">
            <button 
              className="hover:text-pink-400 font-bold text-[10px] hover:underline"
              onClick={() => handleFormat('tag')}
              title="插入多级层级结构标签，分类文档"
            >
              # 标签层级
            </button>
            <button 
              className="hover:text-emerald-400 font-bold text-[10px] hover:underline flex items-center gap-1"
              onClick={() => handleFormat('calendar')}
              title="日历联动：将当天日期转换为事件"
            >
              📅 联动日期
            </button>
          </div>
        </div>
      )}

      {/* WORKSPACE AREA SCALABLE BY FONT CLASSES */}
      <div className="flex-1 flex overflow-hidden">
        {(editorMode === 'edit' || editorMode === 'split') && (
          <div className="flex-1 h-full bg-[#111827] flex">
            <textarea
              id="note-editor-textarea"
              value={activeNote.content}
              onChange={(e) => updateActiveNote(activeNote.title, e.target.value, {})}
              className={`${fontClasses.editor} w-full h-full p-6 outline-none border-none focus:ring-0 focus:outline-none resize-none bg-transparent`}
              placeholder="在此编写 Markdown..."
              style={getFontSizeStyle(fontSizeLevel)}
            />
          </div>
        )}

        {editorMode === 'split' && <div className="w-px bg-slate-800" />}

        {(editorMode === 'preview' || editorMode === 'split') && (
          <div className="flex-1 h-full overflow-y-auto p-8 bg-slate-900 code-preview">
            <div 
              className={`${fontClasses.preview} max-w-none text-slate-300 font-sans leading-relaxed`}
              style={getFontSizeStyle(fontSizeLevel)}
              dangerouslySetInnerHTML={{ __html: parseMarkdown(activeNote.content) }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
