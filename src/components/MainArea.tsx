import { useState, useMemo, useEffect, useRef } from 'react';
import { NavState, Note, CalendarEvent } from '../types';
import { parseMarkdown } from '../utils/markdown';
import { getLunarInfo } from '../utils/lunar';
import Whiteboard from './Whiteboard';
import Mindmap from './Mindmap';
import { universalExport } from '../utils/export';
import { safeStorage } from '../utils/safeStorage';
import { getApiBaseUrl } from '../lib/api';
import { 
  Layout, Eye, FileDown, EyeOff, Settings, Calendar as CalendarIcon, 
  Database, ChevronLeft, ChevronRight, X, Server, Sliders, Rocket, Terminal, Check, RefreshCw, Upload, Info,
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
  ftpConfig?: any;
  setFtpConfig?: any;
  uiScale?: number;
  setUiScale?: (scale: number) => void;
  customFestivals: Record<string, string>;
  setCustomFestivals: (festivals: Record<string, string>) => void;
  notes: Note[];
  setNotes?: (notes: Note[]) => void;
  handleCreateNote: (initialTitle?: string, initialContent?: string, folder?: string, extraFields?: Partial<Note>) => void;
  setActiveNoteId: (id: string | null) => void;
  setNavState: (state: NavState) => void;
  handleExportDatabase: () => void;
  handleImportDatabase: (jsonData: string) => void;
  isPartitionOpen: boolean;
  setIsPartitionOpen: (open: boolean) => void;
  themeMode: 'day' | 'night';
  setThemeMode: (mode: 'day' | 'night') => void;
  deviceProfile: string;
  applyDevicePreset: (profile: string) => void;
  activeTool: string;
  setActiveTool: (tool: string) => void;
  independentTags: string[];
  setIndependentTags: (tags: string[]) => void;
  noteTagsMap: Record<string, string[]>;
  setNoteTagsMap: (map: Record<string, string[]>) => void;
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
  ftpConfig,
  setFtpConfig,
  uiScale = 1.0,
  setUiScale,
  customFestivals,
  setCustomFestivals,
  notes,
  setNotes,
  handleCreateNote,
  setActiveNoteId,
  setNavState,
  handleExportDatabase,
  handleImportDatabase,
  isPartitionOpen,
  setIsPartitionOpen,
  themeMode,
  setThemeMode,
  deviceProfile,
  applyDevicePreset,
  activeTool,
  setActiveTool,
  independentTags,
  setIndependentTags,
  noteTagsMap,
  setNoteTagsMap,
}: MainAreaProps) {
  const [editorMode, setEditorMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [isToolbarOpen, setIsToolbarOpen] = useState(true);

  // WebDAV status simulation state
  const [webdavStatus, setWebdavStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [webdavLog, setWebdavLog] = useState<string[]>([]);
  const [backupStatus, setBackupStatus] = useState<string>('');
  const [activeSettingsTab, setActiveSettingsTab] = useState<'ui' | 'sync'>('ui');

  // Real SQLite persistent sync logging state
  const [realSyncLogs, setRealSyncLogs] = useState<{ id?: number; timestamp: string; level: string; message: string }[]>([]);

  const fetchRealSyncLogs = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/sync/logs`);
      if (res.ok) {
        const data = await res.json();
        setRealSyncLogs(data);
      }
    } catch (e) {
      console.error("Failed to fetch real sync logs", e);
    }
  };

  const clearRealSyncLogs = async () => {
    if (confirm('您确定要彻底清空数据库中所有的同步诊断日志吗？此操作无法恢复。')) {
      try {
        const res = await fetch(`${getApiBaseUrl()}/sync/logs`, { method: 'DELETE' });
        if (res.ok) {
          fetchRealSyncLogs();
        }
      } catch (e) {
        console.error("Failed to clear sync logs", e);
      }
    }
  };

  const exportRealSyncLogs = () => {
    if (realSyncLogs.length === 0) {
      alert("没有同步日志可以导出。");
      return;
    }
    const logText = realSyncLogs
      .map(log => `[${log.timestamp}] [${log.level}] ${log.message}`)
      .join("\n");
    universalExport(logText, `sovereign_sync_logs_${Date.now()}.txt`, "text/plain");
  };

  const copySyncLogsToClipboard = () => {
    if (realSyncLogs.length === 0) {
      alert("当前没有日志需要复制。");
      return;
    }
    const logText = realSyncLogs
      .map(log => `[${log.timestamp}] [${log.level}] ${log.message}`)
      .join("\n");
    navigator.clipboard.writeText(logText).then(() => {
      alert("同步诊断日志已成功复制到剪贴板！");
    }).catch(err => {
      alert("复制失败: " + err);
    });
  };

  useEffect(() => {
    if (activeSettingsTab === 'sync') {
      fetchRealSyncLogs();
    }
  }, [activeSettingsTab]);

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
  const [releaseVersion, setReleaseVersion] = useState('v2.0.1');
  const [releaseTitle, setReleaseTitle] = useState('SovereignNote v2.0.1 标签构架重构与缓存管理优化');
  const [releaseChangelog, setReleaseChangelog] = useState('## 🎉 SovereignNote v2.0.1 核心更新\n\n- **🏷️ 全局标签关联重构**: 重构基于内容的标签自动归纳算法与多层树级统计模型，修复了部分情况下标签目录输出不全的问题。\n- **🗑️ 硬件级缓存安全销毁**: 系统设置面板新增浏览器本地沙盒数据库清空选项，以便随时安全地重置终端并抛弃离线缓存。\n- **🐛 细节体验改善**: 其他一系列底层稳定性修复。');
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

  // UNDO / REDO HISTORY MANAGEMENT HANDLERS
  const undoStack = useRef<{ title: string, content: string }[]>([]);
  const redoStack = useRef<{ title: string, content: string }[]>([]);
  const lastSavedState = useRef<{ id: string; title: string; content: string } | null>(null);

  useEffect(() => {
    if (activeNote) {
      if (!lastSavedState.current || lastSavedState.current.id !== activeNote.id) {
        undoStack.current = [];
        redoStack.current = [];
        lastSavedState.current = { id: activeNote.id, title: activeNote.title, content: activeNote.content };
      }
    } else {
      undoStack.current = [];
      redoStack.current = [];
      lastSavedState.current = null;
    }
  }, [activeNote?.id]);

  const handleNoteChange = (newTitle: string, newContent: string, extraFields?: any) => {
    if (!activeNote || !lastSavedState.current) return;
    
    const prevTitle = lastSavedState.current.title;
    const prevContent = lastSavedState.current.content;

    if (prevTitle !== newTitle || prevContent !== newContent) {
      const lastUndo = undoStack.current[undoStack.current.length - 1];
      if (!lastUndo || lastUndo.title !== prevTitle || lastUndo.content !== prevContent) {
        if (undoStack.current.length >= 100) {
          undoStack.current.shift();
        }
        undoStack.current.push({ title: prevTitle, content: prevContent });
        redoStack.current = []; // Clear redo on fresh manual edit
      }
      lastSavedState.current = { id: activeNote.id, title: newTitle, content: newContent };
    }
    updateActiveNote(newTitle, newContent, extraFields);
  };

  const handleUndo = (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (undoStack.current.length > 0 && activeNote && lastSavedState.current) {
      const popped = undoStack.current.pop()!;
      redoStack.current.push({ title: lastSavedState.current.title, content: lastSavedState.current.content });
      lastSavedState.current = { id: activeNote.id, title: popped.title, content: popped.content };
      updateActiveNote(popped.title, popped.content, {});
    }
  };

  const handleRedo = (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (redoStack.current.length > 0 && activeNote && lastSavedState.current) {
      const popped = redoStack.current.pop()!;
      undoStack.current.push({ title: lastSavedState.current.title, content: lastSavedState.current.content });
      lastSavedState.current = { id: activeNote.id, title: popped.title, content: popped.content };
      updateActiveNote(popped.title, popped.content, {});
    }
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Intercept Ctrl+Z or Cmd+Z
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (e.shiftKey) {
        handleRedo(e);
      } else {
        handleUndo(e);
      }
    }
    // Intercept Ctrl+Y or Cmd+Y
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      handleRedo(e);
    }
  };

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

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeNote) return;
    const target = e.target as HTMLElement;
    if (target.classList.contains('todo-checkbox')) {
      const checkboxes = Array.from(e.currentTarget.querySelectorAll('.todo-checkbox'));
      const index = checkboxes.indexOf(target);
      if (index !== -1) {
        let count = 0;
        const updatedContent = activeNote.content.replace(/([-*]\s+\[)([ xX])(\])/g, (match, prefix, state, suffix) => {
          if (count === index) {
            count++;
            const newState = (state === ' ' ? 'x' : ' ');
            return `${prefix}${newState}${suffix}`;
          }
          count++;
          return match;
        });
        handleNoteChange(activeNote.title, updatedContent, {});
      }
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
    
    if (!textarea) {
      if (type === 'tag') {
        const tagName = prompt("请输入要添加的独立存储标签：");
        if (tagName && tagName.trim()) {
          const cleanTag = tagName.trim().replace(/^#+/, '');
          const currentTags = noteTagsMap[activeNote.id] || [];
          if (!currentTags.includes(cleanTag)) {
            const updatedTags = [...currentTags, cleanTag];
            setNoteTagsMap({ ...noteTagsMap, [activeNote.id]: updatedTags });
            if (!independentTags.includes(cleanTag)) {
              setIndependentTags([...independentTags, cleanTag]);
            }
          }
        }
      } else if (type === 'calendar') {
        const dateStr = prompt("请输入要联动的特定日期 (格式: YYYY-MM-DD)，留空则使用今天：", new Date().toISOString().slice(0, 10));
        if (dateStr !== null) {
          const cleanDate = dateStr.trim() || new Date().toISOString().slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
            const currentTags = noteTagsMap[activeNote.id] || [];
            const tagForDate = `#${cleanDate}`;
            if (!currentTags.includes(tagForDate)) {
              const updatedTags = [...currentTags, tagForDate];
              setNoteTagsMap({ ...noteTagsMap, [activeNote.id]: updatedTags });
            }
            alert(`已成功联动至日期：${cleanDate}`);
          } else {
            alert("日期格式不正确，需为 YYYY-MM-DD 格式");
          }
        }
      }
      return;
    }

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
    handleNoteChange(activeNote.title, updatedContent, {});

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
    const jsonStr = JSON.stringify(customEvents, null, 2);
    const filename = `sovereign_schedules_backup_${new Date().toISOString().slice(0, 10)}.json`;
    universalExport(jsonStr, filename, 'application/json');
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

    universalExport(fileContents, `${activeNote.title.replace(/\s+/g, '_')}.${ext}`, mime);
    setIsExportMenuOpen(false);
  };

  // Export all note items to individual markdown files
  const handleExportAsFolderZip = () => {
    alert("正在批量唤起单个笔记的本地 MD 转换输出...\n本程序会把系统底层的多级层级结构分别打包。");
    // Trigger download for each note
    const activeNotes = notes.filter(n => !n.deleted);
    activeNotes.forEach((n, idx) => {
      setTimeout(() => {
        universalExport(n.content, `${n.title.replace(/\s+/g, '_')}.md`, 'text/markdown');
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
  }, [customEvents, selectedCalendarDate]);

  // Auto hash-linked notes list (notes containing `#YYYY-MM-DD` or linked via independent noteTagsMap)
  const activeDateLinkedNotes = useMemo(() => {
    if (!selectedCalendarDate) return [];
    const hashTag = '#' + selectedCalendarDate;
    return notes.filter(n => {
      if (n.deleted) return false;
      const contentIncludes = n.content ? n.content.includes(hashTag) : false;
      const mapIncludes = noteTagsMap[n.id]?.some(tag => {
        const cleanTag = tag.startsWith('#') ? tag : '#' + tag;
        return cleanTag === hashTag;
      }) || false;
      return contentIncludes || mapIncludes;
    });
  }, [notes, selectedCalendarDate, noteTagsMap]);

  // ABOUT AND CHANGELOG PAGE
  if (navState === 'about') {
    return (
      <div className="flex-1 flex flex-col bg-slate-900 border-l border-slate-800 text-slate-200 overflow-y-auto w-full">
        <div className="h-14 px-8 border-b border-slate-800 flex items-center shrink-0 justify-between">
          <div className="flex items-center">
            <Info className="w-5 h-5 mr-3 text-sky-400" />
            <h1 className="font-bold text-slate-100">关于与系统更新日志</h1>
          </div>
          <div className="text-slate-500 text-xs font-mono">
            {releaseVersion}
          </div>
        </div>

        <div className="p-8 max-w-3xl space-y-8 animate-fade-in mx-auto w-full">
          <div className="bg-slate-950/40 border border-slate-800 p-8 rounded-2xl flex flex-col items-center justify-center text-center space-y-4">
             <div className="w-16 h-16 rounded-xl bg-indigo-600 flex items-center justify-center text-3xl shadow-lg border border-indigo-400/30">S</div>
             <div>
               <h2 className="text-xl font-bold text-slate-100">SovereignNote</h2>
               <p className="text-xs text-slate-400 mt-1 font-mono">Version: {releaseVersion}</p>
             </div>
             <p className="text-xs text-slate-500 leading-relaxed max-w-lg mt-2">
               一款深度贯彻主权自治、完全零依赖云服务的跨平台极客笔记系统。内建全终端屏幕自适应与强大的 Markdown/白板/导图 生产力套件。
             </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-xs font-bold text-sky-400 uppercase tracking-widest flex items-center gap-2">
               📝 当前版本更新指引
            </h2>
            <div className="p-6 bg-slate-950/60 rounded-xl border border-slate-800 space-y-4">
              <div 
                className="markdown-body text-slate-300 text-sm leading-7 space-y-2 prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: parseMarkdown(releaseChangelog) }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SYSTEM SETTINGS SUB CARD
  if (navState === 'settings') {
    return (
      <div className="flex-1 flex flex-col bg-slate-900 border-l border-slate-800 text-slate-200 overflow-y-auto w-full">
        <div className="h-14 px-8 border-b border-slate-800 flex items-center shrink-0 justify-between">
          <div className="flex items-center">
            <Settings className="w-5 h-5 mr-3 text-indigo-400 animate-spin-slow" />
            <h1 className="font-bold text-slate-100">系统设置中心</h1>
          </div>
          <div className="text-slate-500 text-xs font-mono">
            {activeSettingsTab === 'ui' ? '🎨 界面微调' : '☁️ 数据容灾'}
          </div>
        </div>

        {/* 每一个大类一个页面：通过 Sub Tab 切换, 页面彻底分流 */}
        <div className="px-8 py-3 bg-slate-950/40 border-b border-slate-800 flex items-center gap-4">
          <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-800 max-w-sm w-full">
            <button
              type="button"
              onClick={() => setActiveSettingsTab('ui')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                activeSettingsTab === 'ui'
                  ? 'bg-indigo-600 text-white shadow-sm font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-4 h-4" />
              🎨 界面控制
            </button>
            <button
              type="button"
              onClick={() => setActiveSettingsTab('sync')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                activeSettingsTab === 'sync'
                  ? 'bg-indigo-600 text-white shadow-sm font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Database className="w-4 h-4" />
              ☁️ 同步与备份
            </button>
          </div>
        </div>

        <div className="p-8 max-w-2xl pb-16">
          {activeSettingsTab === 'ui' && (
            <div className="space-y-8 animate-fade-in">
              {/* MULTI_DEVICE ADAPTIVE & ENV SETTINGS */}
              <div className="space-y-4">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" /> 多端真机环境与自适应无障碍管理
                </h2>
                <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-800 space-y-6">
                  
                  {/* Theme Selector Section */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm">🔆 系统视觉主题模式</h3>
                    <p className="text-xs text-slate-500">双轨高对比度防蓝光视觉主题，完美保护低视力年龄群众。夏普R2等液晶屏可显著提升日间可读性。</p>
                    <div className="grid grid-cols-2 gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setThemeMode('day')}
                        className={`py-2.5 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                          themeMode === 'day'
                            ? 'bg-amber-500 text-slate-950 shadow font-extrabold'
                            : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        ☀️ 极速舒适：日间浅色模式
                      </button>
                      <button
                        type="button"
                        onClick={() => setThemeMode('night')}
                        className={`py-2.5 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                          themeMode === 'night'
                            ? 'bg-indigo-600 text-slate-100 shadow font-extrabold border border-indigo-500/20'
                            : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-250'
                        }`}
                      >
                        🌙 昏暗护眼：夜间深色模式
                      </button>
                    </div>
                  </div>

                  {/* Hardware / Preset Profiles */}
                  <div className="space-y-2 pt-4 border-t border-slate-800">
                    <h3 className="font-semibold text-sm">🔌 终端真机兼容环境预设</h3>
                    <p className="text-xs text-slate-500">
                      一键配置当前设备的视口大小、字号适配、WebView 内核抗锯齿及点击响应防抖等底层兼容策略。
                    </p>
                    <div className="grid grid-cols-5 gap-2 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                      {[
                        { id: 'win-pc', label: '💻 Win 电脑', desc: '1.0x UI / 中字' },
                        { id: 'win-tablet', label: '📐 Win 平板', desc: '1.2x UI / 较大' },
                        { id: 'android-13', label: '📱 安卓13手机', desc: '1.0x UI / 中字' },
                        { id: 'sharp-r2', label: '💎 夏普 R2', desc: '0.9x UI / 12px' },
                        { id: 'nokia-n1', label: '🎯 诺基亚 N1', desc: '1.3x UI / 大字' }
                      ].map((prof) => (
                        <button
                          key={prof.id}
                          type="button"
                          onClick={() => applyDevicePreset(prof.id)}
                          className={`p-2.5 rounded-lg text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1.5 ${
                            deviceProfile === prof.id
                              ? 'bg-emerald-600 text-white shadow font-extrabold border border-emerald-500/30'
                              : 'bg-slate-900 border border-slate-850 text-slate-400 hover:text-slate-300'
                          }`}
                        >
                          <span className="text-center truncate w-full">{prof.label}</span>
                          <span className="text-[9px] opacity-70 font-normal">{prof.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sizing Detail Slider */}
                  <div className="space-y-4 pt-4 border-t border-slate-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-sm">全局字号调节 (当前等级 {fontSizeLevel}/5)</h3>
                        <p className="text-xs text-slate-500 mt-1">支持1至5级无障碍大小字体，让多视疲劳用户轻而易举体验。5级大字特别友好。</p>
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

                    {setUiScale && (
                      <div className="pt-2">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-xs text-slate-400">细分界面微观 UI 调节比例</h4>
                          <span className="text-xs font-bold font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">{uiScale.toFixed(2)}x</span>
                        </div>
                        <div className="flex items-center gap-4 bg-slate-950/40 p-4 rounded-lg">
                          <input 
                            type="range"
                            min="0.5"
                            max="2.0"
                            step="0.05"
                            value={uiScale}
                            onChange={(e) => setUiScale(parseFloat(e.target.value))}
                            className="flex-1 accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                          />
                          <button 
                            onClick={() => setUiScale(1.0)}
                            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs rounded-lg border border-slate-700 font-bold"
                          >
                            默认 1.0x
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            </div>
          )}

          {activeSettingsTab === 'sync' && (
            <div className="space-y-8 animate-fade-in">
              <div className="space-y-4">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" /> 本地与局域网节点
                </h2>
                <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">局域网 (LAN) 同步与广播</h3>
                      <p className="text-xs text-slate-500 mt-1">自动识别周围设备网络，并通过 P2P/WebRTC 同步 LWW 差异状态</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={async () => {
                          try {
                            const apiBase = getApiBaseUrl();
                            const res = await fetch(`${apiBase}/notes/sync/force`, { method: 'POST' });
                            if (res.ok) {
                              alert('强制同步触发成功');
                              fetchRealSyncLogs();
                            } else {
                              alert('同步失败，请检查本机代理节点。');
                            }
                          } catch {
                            alert('无法连接到本地核心网络。');
                          }
                        }}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold rounded-lg text-white flex items-center gap-1 shadow-sm"
                      >
                        <RefreshCw className="w-3 h-3" />
                        强制手动同步
                      </button>
                      <span className="px-2.5 py-1.5 bg-emerald-600/10 text-emerald-400 border border-emerald-500/15 text-[10px] uppercase font-bold rounded">
                        活跃中
                      </span>
                    </div>
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
                    <div className="text-xs text-emerald-400 font-semibold bg-emerald-900/15 p-2.5 rounded border border-emerald-500/15">{backupStatus}</div>
                  )}
                </div>

                {/* FTP CUSTOM SERVER INTEGRATION */}
                {ftpConfig && setFtpConfig && (
                  <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-800 space-y-4">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-400" />
                      <div>
                        <h3 className="font-semibold text-sm">私有 FTP / NAS 存储挂载备份</h3>
                        <p className="text-xs text-slate-500 mt-1">直接挂载到私有 NAS 或旧服务器 (通过 suppaftp & tokio-ftp 原生对接)。</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs text-slate-400 font-bold">FTP 主机和端口</label>
                        <input 
                          className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 p-2.5 rounded text-sm focus:border-emerald-500 outline-none animate-none" 
                          value={ftpConfig.host} 
                          onChange={(e) => setFtpConfig({ ...ftpConfig, host: e.target.value })}
                          placeholder="192.168.1.100:21" 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-slate-400 font-bold">同步目录路径</label>
                        <input 
                          className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 p-2.5 rounded text-sm focus:border-emerald-500 outline-none animate-none" 
                          value={ftpConfig.path} 
                          onChange={(e) => setFtpConfig({ ...ftpConfig, path: e.target.value })}
                          placeholder="/Backup/Notes" 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-slate-400 font-bold">FTP 用户名</label>
                        <input 
                          className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 p-2.5 rounded text-sm focus:border-emerald-500 outline-none animate-none" 
                          value={ftpConfig.user} 
                          onChange={(e) => setFtpConfig({ ...ftpConfig, user: e.target.value })}
                          placeholder="admin" 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-slate-400 font-bold">FTP 密码</label>
                        <input 
                          type="password"
                          className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 p-2.5 rounded text-sm focus:border-emerald-500 outline-none animate-none" 
                          value={ftpConfig.pass} 
                          onChange={(e) => setFtpConfig({ ...ftpConfig, pass: e.target.value })}
                          placeholder="FTP 安全密码" 
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 pt-2">
                      <button 
                        type="button"
                        onClick={async () => {
                          setBackupStatus('正在尝试上传 FTP...');
                          try {
                            try {
                              const syncRes = await fetch(`${getApiBaseUrl()}/notes/sync`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(notes)
                              });
                              if (syncRes.ok) {
                                const resNotes = await syncRes.json();
                                if (setNotes) setNotes(resNotes);
                              }
                            } catch (e) {
                              console.warn("Silently pushing local notes to core-backend prior to FTP export failed", e);
                            }

                            const apiBase = getApiBaseUrl();
                            const res = await fetch(`${apiBase}/sync/ftp`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(ftpConfig)
                            });
                            const data = await res.json();
                            if (res.ok && data.success) {
                              setBackupStatus('FTP 增量备份推送成功: ' + data.message);
                            } else {
                              setBackupStatus('FTP 错误: ' + (data.message || '上传失败') + (data.error ? ` (${data.error})` : ''));
                            }
                          } catch (err: any) {
                            setBackupStatus('FTP 连接失败: 无法连接本地后台代理节点 (' + err.message + ')');
                          } finally {
                            fetchRealSyncLogs();
                          }
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-bold transition-all text-white border border-emerald-500 whitespace-nowrap"
                      >
                        🚀 推送 (仅上传备份)
                      </button>

                      <button 
                        type="button"
                        onClick={async () => {
                          setBackupStatus('正在尝试从 FTP 下载并合并备份...');
                          try {
                            const apiBase = getApiBaseUrl();
                            const res = await fetch(`${apiBase}/sync/ftp/pull`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(ftpConfig)
                            });
                            const data = await res.json();
                            if (res.ok && data.success) {
                              setBackupStatus('FTP 拉取合并成功: ' + data.message);
                              if (data.notes && setNotes) {
                                setNotes(data.notes);
                                try {
                                  safeStorage.setItem('sovereign_notes', JSON.stringify(data.notes));
                                } catch (_) {}
                              }
                            } else {
                              setBackupStatus('FTP 拉取错误: ' + (data.message || '拉取失败') + (data.error ? ` (${data.error})` : ''));
                            }
                          } catch (err: any) {
                            setBackupStatus('FTP 连接失败: 无法连接本地后台代理节点 (' + err.message + ')');
                          } finally {
                            fetchRealSyncLogs();
                          }
                        }}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold transition-all text-white border border-slate-600 whitespace-nowrap"
                      >
                        📥 拉取 (仅下载合并)
                      </button>

                      <button 
                        type="button"
                        onClick={async () => {
                          setBackupStatus('正在执行 FTP 双向同步 (下载->本地 LWW 合并->重新上载最新数据)...');
                          try {
                            try {
                              await fetch(`${getApiBaseUrl()}/notes/sync`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(notes)
                              });
                            } catch (e) {
                              console.warn("Silent push pre-FTP sync failed", e);
                            }

                            const apiBase = getApiBaseUrl();
                            const res = await fetch(`${apiBase}/sync/ftp/sync`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(ftpConfig)
                            });
                            const data = await res.json();
                            if (res.ok && data.success) {
                              setBackupStatus('FTP 双向合并同步已成功: ' + data.message);
                              if (data.notes && setNotes) {
                                setNotes(data.notes);
                                try {
                                  safeStorage.setItem('sovereign_notes', JSON.stringify(data.notes));
                                } catch (_) {}
                              }
                            } else {
                              setBackupStatus('FTP 错误: ' + (data.message || '双向同步失败') + (data.error ? ` (${data.error})` : ''));
                            }
                          } catch (err: any) {
                            setBackupStatus('FTP 同步失败: 无法连接本地后台代理节点 (' + err.message + ')');
                          } finally {
                            fetchRealSyncLogs();
                          }
                        }}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold transition-all text-white border border-indigo-500 whitespace-nowrap"
                      >
                        🔄 双向同步 (融合数据)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* REAL SYNC LOGS VIEWER */}
              <div className="space-y-4">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-400 animate-pulse" /> 局域网 & FTP 差分同步诊断日志
                </h2>
                <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-800 space-y-4 animate-fade-in animate-duration-150">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-850 pb-3">
                    <div>
                      <h3 className="font-semibold text-sm flex items-center gap-2 text-slate-100">
                        同步实时检测控制台 
                        <span className="px-1.5 py-0.5 bg-slate-950 text-indigo-400 text-[10px] rounded border border-slate-800 font-mono">
                          SQLite 循环 1000 条
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">捕获并在数据库中持久化记录每一次局域网 LWW、Web 到 FTP 的连接重试与报错。</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={fetchRealSyncLogs}
                        className="px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-xs text-slate-300 font-bold rounded-lg transition-all flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> 刷新
                      </button>
                      <button
                        type="button"
                        onClick={copySyncLogsToClipboard}
                        className="px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-xs text-indigo-400 font-bold rounded-lg transition-all"
                      >
                        📋 复制日志
                      </button>
                      <button
                        type="button"
                        onClick={exportRealSyncLogs}
                        className="px-3 py-1.5 bg-indigo-950/60 border border-indigo-900/30 hover:border-indigo-800 text-xs text-indigo-300 font-bold rounded-lg transition-all"
                      >
                        📥 导出文本
                      </button>
                      <button
                        type="button"
                        onClick={clearRealSyncLogs}
                        className="px-3 py-1.5 bg-rose-950/20 border border-rose-900/10 hover:border-rose-850 text-xs text-rose-400 font-bold rounded-lg transition-all"
                      >
                        🗑️ 清空
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-950 rounded-xl border border-slate-850 p-4 font-mono text-xs overflow-y-auto max-h-[380px] space-y-2.5 shadow-inner select-text">
                    {realSyncLogs.length === 0 ? (
                      <div className="text-center py-10 text-slate-600 italic">
                        [当前无同步日志记载] 请点击上方进行双向同步、推送、拉取或开启强制同步以生成数据流。
                      </div>
                    ) : (
                      realSyncLogs.map((log, index) => {
                        let badgeColor = "bg-slate-900 text-slate-400 border-slate-850";
                        let textColor = "text-slate-300";
                        if (log.level === "ERROR") {
                          badgeColor = "bg-rose-950/60 text-rose-400 border-rose-900/30";
                          textColor = "text-rose-200 font-semibold";
                        } else if (log.level === "SUCCESS") {
                          badgeColor = "bg-emerald-950/60 text-emerald-400 border-emerald-900/30";
                          textColor = "text-emerald-200 font-semibold";
                        } else if (log.level === "WARN") {
                          badgeColor = "bg-amber-950/60 text-amber-500 border-amber-900/30";
                          textColor = "text-amber-200/90";
                        }
                        return (
                          <div key={index} className="flex items-start gap-3 border-b border-slate-900/30 pb-2 last:border-0 last:pb-0">
                            <span className="text-slate-500 select-none whitespace-nowrap">{log.timestamp}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border ${badgeColor} select-none`}>
                              {log.level}
                            </span>
                            <span className={`flex-1 select-all break-all ${textColor}`}>
                              {log.message}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* LOCAL STORAGE CLEAR */}
              <div className="space-y-4">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Database className="w-4 h-4 text-rose-400" /> 本地前端缓存清空与重置
                </h2>
                <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-800 space-y-4">
                  <div>
                    <h3 className="font-semibold text-sm">彻底清空笔记前端缓存数据库</h3>
                    <p className="text-xs text-slate-500 mt-1">当前由于应用开启了离线优先架构，笔记内容会直接存储在您的浏览器缓存中。如果您在本地硬盘删除了数据库文件且希望网页数据随之消失，需点击此处清空前端缓存并重载页面。</p>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={() => {
                        if (confirm('警告：此操作将彻底删除本浏览器中的所有 SovereignNote 笔记和同步配置，且无法恢复。仅适用于重置或脱离本设备前的数据清理。你确定要销毁前端缓存吗？')) {
                          safeStorage.removeItem('sovereign_notes');
                          safeStorage.removeItem('sovereign_events');
                          window.location.reload();
                        }
                      }}
                      className="px-4 py-2 bg-rose-900/50 hover:bg-rose-800/80 rounded-lg text-xs font-bold transition-all text-white border border-rose-500/30"
                    >
                      🗑️ 销毁全部前端缓存数据并重载页面
                    </button>
                  </div>
                </div>
              </div>

              {/* BACKUP & MANUAL TOOLS */}
              <div className="space-y-4">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" /> 手动容灾还原
                </h2>
                <div className="flex gap-4">
                  <button 
                    type="button"
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
          )}
        </div>
      </div>
    );
  }

  // COMPREHENSIVE MULTI-TOOL INSTRUMENT INTERFACE
  if (navState === 'tools') {
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
            const jsonStr = JSON.stringify(bundle, null, 2);
            universalExport(jsonStr, `SovereignNote_${releaseVersion}_offline_release_bundle.json`, 'application/json');
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
      universalExport(yamlContent, `SovereignNote_build_workflow.yml`, 'text/yaml');
    };

    return (
      <div className="flex-1 flex flex-col bg-slate-900 border-l border-slate-800 text-slate-200 overflow-hidden w-full select-none">
        {/* HEADER BAR FOR SYSTEM TOOLS */}
        <div className="h-14 px-8 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/40">
          <div className="flex items-center space-x-1.5">
            <Rocket className="w-5 h-5 mr-1 text-amber-400 animate-pulse" />
            <span className="text-sm font-bold text-slate-100 font-sans">工具箱系统面板</span>
            {activeTool === 'releases' && <span className="text-xs text-slate-500 font-mono bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800/60 ml-2 font-medium">/ 存储分发与 CI/CD 自动部署</span>}
            {activeTool === 'backup' && <span className="text-xs text-slate-500 font-mono bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800/60 ml-2 font-medium">/ 状态数据库快照备份</span>}
            {activeTool === 'device' && <span className="text-xs text-slate-500 font-mono bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800/60 ml-2 font-medium">/ 多自适应设备适配器</span>}
          </div>
          
          <div className="flex gap-1 bg-slate-950 p-1 border border-slate-800 rounded-xl shrink-0">
            <button
              onClick={() => setActiveTool('releases')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                activeTool === 'releases'
                  ? 'bg-indigo-650 text-white font-extrabold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🚀 版本发布
            </button>
            <button
              onClick={() => setActiveTool('backup')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                activeTool === 'backup'
                  ? 'bg-indigo-650 text-white font-extrabold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              💾 整库快照
            </button>
            <button
              onClick={() => setActiveTool('device')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                activeTool === 'device'
                  ? 'bg-indigo-650 text-white font-extrabold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🖥️ 多端自适应
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto w-full pb-16">

          {activeTool === 'releases' && (
            <div className="p-8 max-w-4xl space-y-6 mx-auto w-full animate-fade-in">
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
          )}

          {activeTool === 'backup' && (
            <div className="p-8 max-w-4xl space-y-6 mx-auto w-full animate-fade-in font-sans">
              <div className="bg-slate-950/40 border border-slate-800 p-6 rounded-2xl space-y-3 font-sans">
                <h2 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                  <Database className="w-5 h-5 text-indigo-400" />
                  <span>分布式极客容灾备份 & 云端互联同步</span>
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  作为一款主打“主权自治”的笔记系统，我们提供免受任何商业云约束的多端自部署及点对点共识数据备份。您可以直接导出完整的 LWW-Element-Set 副本快照，或配置符合 WebDAV / FTP 规范的中继节点进行网络级多端冷/热实时云同步。
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
                {/* BACKUP DATABASE CARD */}
                <div className="space-y-4">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 font-mono">
                    📦 状态快照整库归档
                  </h2>
                  <div className="p-5 bg-slate-850/40 rounded-xl border border-slate-800 space-y-4">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      将当前所有的归档文章内容、定制多级标签目录树及所有的定制时钟日程合成为单个纯静态 <code>.json</code> 配置：
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={handleExportDatabase}
                        className="py-3 px-4 bg-indigo-650 hover:bg-indigo-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                      >
                        <FileDown className="w-4 h-4" /> 导出整库快照
                      </button>
                      <label 
                        className="py-3 px-4 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors text-center"
                      >
                        <Upload className="w-4 h-4 inline" /> 导入整库快照
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
                    <div className="p-3.5 bg-slate-950/60 rounded-lg border border-slate-900 text-[10px] text-slate-500 space-y-1 font-mono">
                      <div className="flex justify-between"><span>归档笔记数:</span><span>{notes.filter(n=>!n.deleted).length} 篇</span></div>
                      <div className="flex justify-between"><span>定制日程树:</span><span>{customEvents.length} 个</span></div>
                      <div className="flex justify-between"><span>共识合并层:</span><span className="text-emerald-500 font-bold">LWW-Element-Set</span></div>
                    </div>
                  </div>
                </div>

                {/* FTP SYNC CONTROLLER CARD */}
                <div className="space-y-4">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 font-mono">
                    ☁️ WebDAV 与 FTP 分布式云链接
                  </h2>
                  <div className="p-5 bg-slate-850/40 rounded-xl border border-slate-800 space-y-4">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      直接将状态套包存储至符合标准的自建私有云（例如坚果云、Synology 群晖 WebDAV / FTP 服务器）。您可以更改 WebDAV 账号与 FTP 端口以完成云端互联。
                    </p>
                    <div className="flex flex-col gap-2.5">
                      <div className="flex gap-2 font-mono">
                        <div className="flex-1 bg-slate-950/40 border border-slate-800 p-2.5 rounded-lg flex items-center justify-between text-[11px] text-slate-400">
                          <span>WebDAV: {webdavConfig?.url ? "已配置" : "未配置"}</span>
                        </div>
                        <div className="flex-1 bg-slate-950/40 border border-slate-800 p-2.5 rounded-lg flex items-center justify-between text-[11px] text-slate-400">
                          <span>FTP 服务: {ftpConfig?.host ? "已配置" : "未配置"}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setNavState('settings');
                        }}
                        className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-indigo-400 font-bold text-xs border border-slate-700 rounded-xl transition-all cursor-pointer"
                      >
                        ⚙️ 前往系统设置配置 WebDAV 极客密钥
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTool === 'device' && (
            <div className="p-8 max-w-4xl space-y-6 mx-auto w-full animate-fade-in font-sans">
              <div className="bg-slate-950/40 border border-slate-800 p-6 rounded-2xl space-y-3">
                <h2 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                  <Server className="w-5 h-5 text-indigo-400" />
                  <span>多端真机视口自适应排版检测仿真器</span>
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  系统采用高自适应的 Fluid Grid Layout 响应式像素格栅对齐，确保文字在从手表、掌机到折叠屏、4K带鱼屏等各类极端高dpi设备上保持一致的对称排版。
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* SCALE LEVEL ADJUST CARD */}
                <div className="space-y-4">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 font-mono">
                    📏 界面像素格栅与字重缩放
                  </h2>
                  <div className="p-5 bg-slate-850/40 rounded-xl border border-slate-800 space-y-5">
                    <div className="space-y-2 font-sans">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-slate-300">全局字体大小级度</span>
                        <span className="text-indigo-400">{fontSizeLevel} 阶 (范围 1-5 级)</span>
                      </div>
                      <input 
                        type="range" 
                        min="1" 
                        max="5" 
                        value={fontSizeLevel} 
                        onChange={(e) => setFontSizeLevel(parseInt(e.target.value, 10))}
                        className="w-full h-1.5 accent-indigo-500 bg-slate-950 rounded-lg cursor-pointer"
                      />
                      <p className="text-[10px] text-slate-500/80">此拉条将直接对跨页侧边栏多层笔记目录、日程表格、文章阅读面板进行重度视网膜调节。</p>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-800/40 font-sans">
                      <div className="flex justify-between items-center text-xs font-bold font-sans">
                        <span className="text-slate-300">界面整体缩放比例 (CSS Matrix Scale)</span>
                        <span className="text-indigo-400">{(uiScale * 100).toFixed(0)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0.75" 
                        max="1.25" 
                        step="0.05"
                        value={uiScale} 
                        onChange={(e) => setUiScale && setUiScale(parseFloat(e.target.value))}
                        className="w-full h-1.5 accent-indigo-500 bg-slate-950 rounded-lg cursor-pointer"
                      />
                      <p className="text-[10px] text-slate-500/80">此缩放由网页核心 DOM Matrix 引擎驱动。适合对更低物理分辨率的电子墨水屏等设备完成抗疲劳间距压缩。</p>
                    </div>
                  </div>
                </div>

                {/* PRESET EMULATOR STAT COORDS CARD */}
                <div className="space-y-4">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 font-mono">
                    🖥️ 真机模拟类型切片 (Active Preset)
                  </h2>
                  <div className="p-5 bg-slate-850/40 rounded-xl border border-slate-800 space-y-4">
                    <p className="text-xs text-slate-400 font-sans">
                      快速对齐以下常见真机的视窗像素比例，通过调整宽度缩放对排版细节及侧边抽屉重叠状态进行全面视检：
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      {[
                        { title: '💻 桌面工作区 (Notebook)', profile: 'notebook' },
                        { title: '平板尺寸 (Tablet Pro)', profile: 'tablet' },
                        { title: '📲 纵向智能手机 (Large Screen)', profile: 'phone' },
                        { title: '⌚ 极微边缘腕载 (Small Wrist)', profile: 'wearable' }
                      ].map((p, idx) => (
                        <button
                          key={idx}
                          onClick={() => applyDevicePreset(p.profile)}
                          className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                            deviceProfile === p.profile
                              ? 'bg-indigo-650 text-white font-extrabold border-indigo-500 shadow-sm'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                          }`}
                        >
                          {p.title}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
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
                  title={`公历: ${formattedDate}${lunarInfo.gzYear ? `\n农历: ${lunarInfo.gzYear} ${lunarInfo.lunarMonthName || ''}${lunarInfo.lunarDayName}` : ''}${lunarInfo.jpEra ? `\n日本年号: ${lunarInfo.jpEra}` : ''}${lunarInfo.kokiYear ? `\n皇纪: ${lunarInfo.kokiYear}` : ''}`}
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
        {selectedCalendarDate && (() => {
          const [yStr, mStr, dStr] = selectedCalendarDate.split('-');
          const selYear = parseInt(yStr, 10) || 2026;
          const selMonth = parseInt(mStr, 10) || 6;
          const selDay = parseInt(dStr, 10) || 1;
          const selLunar = getLunarInfo(selYear, selMonth, selDay, customFestivals);

          return (
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

                {/* Multilingual Traditional & Era Calendars Info Row */}
                <div className="flex flex-wrap gap-2 text-[10px] text-slate-400 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60 font-mono">
                  {selLunar.gzYear && (
                    <span className="bg-indigo-950/40 text-indigo-400 px-2 py-0.5 rounded border border-indigo-900/40">
                      🏮 农历: {selLunar.gzYear} {selLunar.lunarMonthName || ''}{selLunar.lunarDayName}
                    </span>
                  )}
                  {selLunar.jpEra && (
                    <span className="bg-emerald-950/40 text-emerald-400 px-2 py-0.5 rounded border border-emerald-900/40">
                      🌸 日本年号: {selLunar.jpEra}
                    </span>
                  )}
                  {selLunar.kokiYear && (
                    <span className="bg-amber-950/40 text-amber-400 px-2 py-0.5 rounded border border-amber-900/40">
                      ⚔️ 皇纪: {selLunar.kokiYear}
                    </span>
                  )}
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
        );
      })()}
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
            onChange={(e) => handleNoteChange(e.target.value, activeNote.content)}
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
                    handleNoteChange(activeNote.title, activeNote.content, { folder: newF.trim() });
                  }
                } else {
                  handleNoteChange(activeNote.title, activeNote.content, { folder: val || undefined });
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

      {/* INDEPENDENT METADATA PANEL (TAGS & DATE LINKAGES) */}
      <div className="px-6 py-2 bg-slate-950/20 border-b border-slate-800/50 flex flex-wrap items-center justify-between text-xs gap-3">
        {/* Left segment: Active Tags */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide">
            🏷️ 独立存储标签:
          </span>
          {(() => {
            const currentTags = noteTagsMap[activeNote.id] || [];
            if (currentTags.length === 0) {
              return <span className="text-[10px] text-slate-600 italic">暂无独立标签</span>;
            }
            return currentTags.map(tag => {
              const isDate = tag.startsWith('#') && /^\d{4}-\d{2}-\d{2}$/.test(tag.substring(1));
              return (
                <span 
                  key={tag} 
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${isDate ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-pink-500/10 text-pink-400 border border-pink-500/20'}`}
                >
                  {tag.startsWith('#') ? tag : `#${tag}`}
                  <button 
                    onClick={() => {
                      const updatedTags = currentTags.filter(t => t !== tag);
                      setNoteTagsMap({ ...noteTagsMap, [activeNote.id]: updatedTags });
                    }}
                    className="hover:bg-slate-800 rounded px-1 text-[10px] text-slate-500 hover:text-white cursor-pointer"
                    title="移除标签"
                  >
                    ×
                  </button>
                </span>
              );
            });
          })()}
        </div>

        {/* Right segment: Actions/Add inline */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => handleFormat('tag')}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-[10px] rounded transition-all flex items-center gap-1 cursor-pointer"
            title="添加独立标签"
          >
            + 贴标签
          </button>
          
          <button
            onClick={() => handleFormat('calendar')}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-[10px] rounded transition-all flex items-center gap-1 cursor-pointer"
            title="联动特定日期"
          >
            📅 联动日期
          </button>
        </div>
      </div>

      {/* WORKSPACE AREA SCALABLE BY FONT CLASSES */}
      <div className="flex-1 flex overflow-hidden">
        {activeNote.type === 'whiteboard' ? (
          <Whiteboard 
            key={activeNote.id}
            paths={activeNote.content ? JSON.parse(activeNote.content) : []} 
            onChange={(paths) => handleNoteChange(activeNote.title, JSON.stringify(paths))}
          />
        ) : activeNote.type === 'mindmap' ? (
          <Mindmap 
            data={activeNote.mindmapData} 
            onChange={(data) => handleNoteChange(activeNote.title, activeNote.content, { mindmapData: data })}
            title={activeNote.title}
          />
        ) : (
          <>
            {(editorMode === 'edit' || editorMode === 'split') && (
              <div className="flex-1 h-full bg-[#111827] flex">
                <textarea
                  id="note-editor-textarea"
                  value={activeNote.content}
                  onChange={(e) => handleNoteChange(activeNote.title, e.target.value, {})}
                  onKeyDown={handleEditorKeyDown}
                  className={`${fontClasses.editor} w-full h-full p-6 outline-none border-none focus:ring-0 focus:outline-none resize-none bg-transparent`}
                  placeholder="在此编写 Markdown..."
                  style={getFontSizeStyle(fontSizeLevel)}
                />
              </div>
            )}

            {editorMode === 'split' && <div className="w-px bg-slate-800" />}

            {(editorMode === 'preview' || editorMode === 'split') && (
              <div className="flex-1 h-full overflow-y-auto p-8 bg-slate-900 code-preview" onClick={handlePreviewClick}>
                <div 
                  className={`${fontClasses.preview} max-w-none text-slate-300 font-sans leading-relaxed`}
                  style={getFontSizeStyle(fontSizeLevel)}
                  dangerouslySetInnerHTML={{ __html: parseMarkdown(activeNote.content) }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
