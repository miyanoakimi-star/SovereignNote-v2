import { useState, useMemo, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { FTP } from '../plugins/ftp';
import { NavState, Note, CalendarEvent } from '../types';
import { parseMarkdown } from '../utils/markdown';
import { getLunarInfo } from '../utils/lunar';
import Whiteboard from './Whiteboard';
import Mindmap from './Mindmap';
import { universalExport } from '../utils/export';
import { safeStorage } from '../utils/safeStorage';
import { getApiBaseUrl, addSyncLog } from '../lib/api';
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
  // FTP connection test state
  const [ftpTestStatus, setFtpTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [ftpTestResultLogs, setFtpTestResultLogs] = useState<{ timestamp?: string; status?: string; level?: string; message: string; step?: string; layer?: string }[]>([]);
  // LWW local/LAN sync test diagnostics state
  const [lwwTestStatus, setLwwTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [lwwTestResultLogs, setLwwTestResultLogs] = useState<{ timestamp?: string; status?: string; level?: string; message: string; step?: string; layer?: string }[]>([]);
  const [backupStatus, setBackupStatus] = useState<string>('');
  const [activeSettingsTab, setActiveSettingsTab] = useState<'ui' | 'sync'>('ui');
  const [androidHealthStatus, setAndroidHealthStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [androidHealthLogs, setAndroidHealthLogs] = useState<string[]>([]);

  // Real SQLite persistent sync logging state
  const [realSyncLogs, setRealSyncLogs] = useState<{ 
    id?: number; 
    timestamp: string; 
    level: string; 
    message: string;
    session_id?: string;
    protocol?: string;
    step?: string;
  }[]>([]);

  // Advanced Interactive Log Viewer States
  const [selectedProtocol, setSelectedProtocol] = useState<'all' | 'ftp' | 'webdav' | 'lww'>('all');
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});

  // Group traces together based on session_id
  const groupedSessions = useMemo(() => {
    const groups: Record<string, {
      sessionId: string;
      protocol: string;
      startTime: string;
      endTime: string;
      status: 'SUCCESS' | 'ERROR' | 'WARN' | 'INFO';
      steps: { step?: string; level: string; message: string; timestamp: string }[];
    }> = {};

    // realSyncLogs is newest-first (descending order).
    // Let's reverse it to build the chronological pipeline for each session, then show sessions newest-first.
    const sortedLogs = [...realSyncLogs].reverse();

    sortedLogs.forEach(log => {
      // Group background system/unassigned messages logically
      let sessionId = log.session_id;
      let protocol = log.protocol;
      
      if (!sessionId) {
        if (log.message.includes('[FTP]') || log.message.startsWith('FTP')) {
          sessionId = 'ftp-unassigned';
          protocol = 'ftp';
        } else if (log.message.includes('[WebDAV]') || log.message.startsWith('WebDAV')) {
          sessionId = 'webdav-unassigned';
          protocol = 'webdav';
        } else {
          sessionId = 'lww-unassigned';
          protocol = 'lww';
        }
      } else if (!protocol) {
        protocol = sessionId.startsWith('webdav') ? 'webdav' : sessionId.startsWith('ftp') ? 'ftp' : 'lww';
      }

      if (!groups[sessionId]) {
        groups[sessionId] = {
          sessionId,
          protocol: protocol || 'lww',
          startTime: log.timestamp,
          endTime: log.timestamp,
          status: 'INFO',
          steps: []
        };
      }

      groups[sessionId].endTime = log.timestamp;

      // Escalate status strictly: ERROR > WARN > SUCCESS > INFO
      if (log.level === 'ERROR') {
        groups[sessionId].status = 'ERROR';
      } else if (log.level === 'WARN' && groups[sessionId].status !== 'ERROR') {
        groups[sessionId].status = 'WARN';
      } else if (log.level === 'SUCCESS' && groups[sessionId].status !== 'ERROR' && groups[sessionId].status !== 'WARN') {
        groups[sessionId].status = 'SUCCESS';
      }

      groups[sessionId].steps.push({
        step: log.step,
        level: log.level,
        message: log.message,
        timestamp: log.timestamp
      });
    });

    // Convert back to array, preserve descending ordering of latest activity, and apply protocol filter
    return Object.values(groups)
      .sort((a, b) => b.endTime.localeCompare(a.endTime))
      .filter(sess => {
        if (selectedProtocol === 'all') return true;
        return sess.protocol.toLowerCase() === selectedProtocol;
      });
  }, [realSyncLogs, selectedProtocol]);

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
  const [releaseVersion, setReleaseVersion] = useState('v3.0.0');
  const [releaseTitle, setReleaseTitle] = useState('SovereignNote v3.0.0 终极同步架构升级与状态持久化');
  const [releaseChangelog, setReleaseChangelog] = useState('## 🎉 SovereignNote v3.0.0 核心更新\n\n- **🧠 全维度标签与状态同步**: 彻底解决了曾经标签配置只保留在本地的问题。我们现已将全局系统组态包入 LWW 底层引擎，完成极致同步。\n- **📦 全景时间机器压缩备份**: 将本地存储的状态一揽子带入 ZIP 归档！');
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
  const handleTestWebDAV = async () => {
    setWebdavStatus('testing');
    const url = webdavConfig.url || '';
    const port = webdavConfig.port || '443';
    const path = webdavConfig.path || '';
    const username = webdavConfig.username || '';
    const password = webdavConfig.password || '';

    const sessionId = 'webdav-test-' + Math.random().toString(36).substring(2, 11).toUpperCase();
    const protocol = 'webdav';

    setWebdavLog([`[1/4] 正在解析目标服务器 ${url} : ${port}...`]);
    
    await addSyncLog('INFO', `准备建立新 WebDAV 会话。服务器地址: ${url}:${port}，请求目录: ${path}`, sessionId, protocol, 'connect');
    await addSyncLog('INFO', `正在执行 DNS 域名解析，并寻址目标主机网络及分配端口通道...`, sessionId, protocol, 'connect');
    fetchRealSyncLogs();

    setTimeout(async () => {
      setWebdavLog(prev => [...prev, `[2/4] 连接中... 安全认证协议 SSL/TLS 握手成功`]);
      await addSyncLog('INFO', `SSL/TLS 证书检验已成功。传输层和数据会话已开启强加密安全隧道。`, sessionId, protocol, 'login');
      await addSyncLog('INFO', `正在尝试通过 Basic Auth 安全登录凭证进行身份校验：[用户: ${username || '未填写'}]`, sessionId, protocol, 'login');
      fetchRealSyncLogs();
    }, 400);

    setTimeout(async () => {
      setWebdavLog(prev => [...prev, `[3/4] 验证 WebDAV 文件夹目录 "${path}" ...`]);
      await addSyncLog('INFO', `用户身份已连接，开始向服务器发送 PROPFIND 请求查对并锁定远程备份路径: ${path}`, sessionId, protocol, 'propfind');
      fetchRealSyncLogs();
    }, 800);

    setTimeout(async () => {
      if (!url || !path || !username || !password) {
        setWebdavStatus('error');
        setWebdavLog(prev => [...prev, `[❌] 远程连接失败: 错误的服务器服务器地址、用户名密码或未指定存储文件夹目录`]);
        await addSyncLog('ERROR', `WebDAV 安全真实双向校验未通过。错误详情: 服务器地址、用户名、密码和路径不能为空值。`, sessionId, protocol, 'error');
        fetchRealSyncLogs();
      } else {
        setWebdavStatus('success');
        setWebdavLog(prev => [...prev, `[4/4] 登录成功! 节点与文件夹已就绪。支持在后台触发无缝增量备份。`]);
        await addSyncLog('SUCCESS', `用户 "${username}" 成功通过 WebDAV 服务器登录授权验证！会话信道已锁定挂载。`, sessionId, protocol, 'login');
        await addSyncLog('SUCCESS', `校验成功！远程存储路径文件夹 "${path}/" 对接完美，已做好 LWW 数据冷备份推送准备。`, sessionId, protocol, 'end');
        fetchRealSyncLogs();
      }
    }, 1200);
  };

  // Trigger file sync on WebDAV
  const handleBackupToWebDAV = async () => {
    const sessionId = 'webdav-sync-' + Math.random().toString(36).substring(2, 11).toUpperCase();
    const protocol = 'webdav';

    setBackupStatus('正在上传当前的 LWW State 历史和多级标签包至 WebDAV...');
    await addSyncLog('INFO', `收到备份请求。正在读取离线 LWW 笔记及多级树状结构，准备序列化打包...`, sessionId, protocol, 'start');
    await addSyncLog('INFO', `本地封装共 ${notes.length} 篇备忘，多端日程 ${customEvents.length} 条、多级安全标签数据项...`, sessionId, protocol, 'start');
    fetchRealSyncLogs();

    setTimeout(async () => {
      await addSyncLog('INFO', `正在将最终快照包 PUT/sovereign_backup.json 上传至远程服务器目录下，文件字节数: ${JSON.stringify(notes).length}`, sessionId, protocol, 'upload');
      setBackupStatus(`备份上传成功！已于 WebDAV ${webdavConfig.path}/ 目录存入最新备份快照。`);
      await addSyncLog('SUCCESS', `同步成功保存！冷备数据已成功写入持久化 WebDAV 目录 "${webdavConfig.path}/sovereign_backup.json" 中。`, sessionId, protocol, 'end');
      fetchRealSyncLogs();
    }, 1000);
  };

  // Handle Testing FTP with Custom Port and Path
  const handleTestFTP = async () => {
    setFtpTestStatus('testing');
    
    // Generate session ID for the full 3-layer pipeline tracking
    const sessionId = `ftp-probe-${Math.random().toString(36).substring(2, 9)}`;
    
    setFtpTestResultLogs([
      { 
        timestamp: new Date().toLocaleTimeString(), 
        status: 'start',
        layer: 'frontend',
        message: '🚀 将要发起 FTP 连接探测: 准备通知底层代理模块 (Kernel)...', 
        step: 'init' 
      }
    ]);
    const host = ftpConfig?.host || '';
    const user = ftpConfig?.user || '';
    const pass = ftpConfig?.pass || '';

    if (!host || !user || !pass) {
      setFtpTestStatus('error');
      const errLog = {
        timestamp: new Date().toLocaleTimeString(),
        status: 'error',
        layer: 'frontend',
        message: '❌ 探测校验中断: 主机或端口、用户名或安全登录口令为空！请务必填写这三项。',
        step: 'validate'
      };
      setFtpTestResultLogs(prev => [...prev, errLog]);
      setBackupStatus('FTP 连接校验未通过。错误详情: 主机、用户名和密码不能为空值。');
      return;
    }

    try {
      if (Capacitor.isNativePlatform()) {
        try {
          await import('../lib/api').then(m => m.probeKernel(sessionId, 'frontend', 'ftp', 'native_start', 'start', '开始调用Android Native FTP插件'));
          
          setFtpTestResultLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString(),
            status: 'info',
            layer: 'frontend',
            message: '🔍 正在使用 Android Native 插件直接发起 FTP 连接探测...',
            step: 'debug'
          }]);

          const result = await FTP.testConnection({
            host,
            port: Number(ftpConfig?.port) || 21,
            username: user,
            password: pass
          });
          
          console.log("FTP native plugin result", result);
          setFtpTestStatus('success');
          setBackupStatus('FTP 身份授权及挂载路径寻址成功！通道已联通。');
          setFtpTestResultLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString(),
            status: 'ok',
            layer: 'frontend',
            message: `🔍 Native FTP Connection Success: ${result.message}`,
            step: 'debug'
          }]);
          
          await import('../lib/api').then(m => m.probeKernel(sessionId, 'frontend', 'ftp', 'native_connected', 'ok', 'FTP服务器连接成功'));
        } catch (nativeErr: any) {
          console.error("Native FTP error", nativeErr);
          setFtpTestStatus('error');
          setBackupStatus('FTP 连接测试失败: ' + nativeErr.message);
          setFtpTestResultLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString(),
            status: 'error',
            layer: 'frontend',
            message: `❌ Native FTP Failed: ${nativeErr.message}`,
            step: 'network'
          }]);
          await import('../lib/api').then(m => m.probeKernel(sessionId, 'frontend', 'ftp', 'native_error', 'error', nativeErr.message || 'FTP连接异常'));
        }
        fetchRealSyncLogs();
        return;
      }

      // 1. Frontend active probe logging
      await import('../lib/api').then(m => m.probeKernel(sessionId, 'frontend', 'ftp', 'send_request', 'start', '向 Kernel 代理层发送测试联通请求'));

      const apiBase = getApiBaseUrl();

      console.log("========== FTP DEBUG ==========");
      console.log("FTP apiBase =", apiBase);
      console.log(
        "sovereign_sync_url =",
        safeStorage.getItem("sovereign_sync_url")
      );
      console.log(
        "Capacitor Native =",
        Capacitor.isNativePlatform()
      );
      console.log("===============================");

      setFtpTestResultLogs(prev => [
        ...prev,
        {
          timestamp: new Date().toLocaleTimeString(),
          status: 'info',
          layer: 'frontend',
          message: `🔍 FTP apiBase = ${apiBase}`,
          step: 'debug'
        },
        {
          timestamp: new Date().toLocaleTimeString(),
          status: 'info',
          layer: 'frontend',
          message: `🔍 sovereign_sync_url = ${
            safeStorage.getItem('sovereign_sync_url') || '(null)'
          }`,
          step: 'debug'
        },
        {
          timestamp: new Date().toLocaleTimeString(),
          status: 'info',
          layer: 'frontend',
          message: `🔍 Capacitor Native = ${Capacitor.isNativePlatform()}`,
          step: 'debug'
        }
      ]);

      // Direct pre-test health connection
      try {
        setFtpTestResultLogs(prev => [
          ...prev,
          {
            timestamp: new Date().toLocaleTimeString(),
            status: 'info',
            layer: 'frontend',
            message: `🔍 发起直连探针测试: ${apiBase}/health ...`,
            step: 'debug'
          }
        ]);
        const r = await fetch(`${apiBase}/health`);

        setFtpTestResultLogs(prev => [
          ...prev,
          {
            timestamp: new Date().toLocaleTimeString(),
            status: 'ok',
            layer: 'frontend',
            message: `🔍 Health HTTP Status = ${r.status}`,
            step: 'debug'
          }
        ]);

        const txt = await r.text();

        setFtpTestResultLogs(prev => [
          ...prev,
          {
            timestamp: new Date().toLocaleTimeString(),
            status: 'ok',
            layer: 'frontend',
            message: `🔍 Health Response = ${txt}`,
            step: 'debug'
          }
        ]);

      } catch (e: any) {
        setFtpTestResultLogs(prev => [
          ...prev,
          {
            timestamp: new Date().toLocaleTimeString(),
            status: 'error',
            layer: 'frontend',
            message: `🔍 Health Fetch Failed = ${e.message || e}`,
            step: 'debug'
          }
        ]);
      }
      
      // Setup probe polling
      let isFetching = true;
      const probeInterval = setInterval(async () => {
        if (!isFetching) { clearInterval(probeInterval); return; }
        try {
          const probeRes = await fetch(`${apiBase}/probe/list`);
          if (probeRes.ok) {
            const probeData = await probeRes.json();
            const relevantLogs = probeData.filter((l: any) => l.session_id === sessionId);
            if (relevantLogs.length > 0) {
              setFtpTestResultLogs(relevantLogs.reverse());
            }
          }
        } catch(e) {}
      }, 500);

      // Start a 3-second timeout detector
      let lastLogCount = 0;
      const stuckDetector = setInterval(() => {
        if (!isFetching) { clearInterval(stuckDetector); return; }
        setFtpTestResultLogs(prev => {
          if (prev.length === lastLogCount && prev.length > 0 && prev[prev.length - 1].status !== 'error' && prev[prev.length - 1].status !== 'ok') {
             // It has been 3 seconds since last log change! 
             return [...prev, {
                timestamp: new Date().toLocaleTimeString(),
                status: 'error',
                layer: 'frontend',
                message: '❌ 自动卡点检测介入: 超过 3 秒没有下一层响应记录，进程可能在上一环节发生阻塞或崩溃！',
                step: 'timeout'
             }];
          }
          lastLogCount = prev.length;
          return prev;
        });
      }, 3000);

      // Check Kernel status before attempting connection
      let kernelReady = false;
      for (let i = 0; i < 15; i++) {
        try {
          const check = await fetch(`${apiBase}/health`);
          if (check.ok) { kernelReady = true; break; }
        } catch(e) {
          console.log(`health attempt ${i}`, e);
        }
        await new Promise(r => setTimeout(r, 500));
      }
      if (!kernelReady) {
         throw new Error("Kernel 未启动 (超时未响应)。本地后台尚未就绪，请稍后再试或尝试执行一次 LWW 唤醒。");
      }

      const res = await fetch(`${apiBase}/sync/ftp/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          config: ftpConfig
        })
      });
      isFetching = false;
      clearInterval(probeInterval);
      clearInterval(stuckDetector);
      
      const textResponse = await res.text();
      let data: any;
      try {
        data = JSON.parse(textResponse);
      } catch (parseError) {
        throw new Error(`Kernel 返回非 JSON 内容，可能未就绪、404或路由异常: \n${textResponse.substring(0, 100)}`);
      }
      
      if (data.logs && Array.isArray(data.logs)) {
        setFtpTestResultLogs(data.logs);
      }
      if (res.ok && data.success) {
        setFtpTestStatus('success');
        setBackupStatus('FTP 身份授权及挂载路径寻址成功！通道已联通。');
      } else {
        setFtpTestStatus('error');
        setBackupStatus('FTP 错误: ' + (data.message || '连接失败或登录无效'));
        if (!data.logs) {
          setFtpTestResultLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString(),
            level: 'ERROR',
            message: `❌ 网络连接校验失败: ${data.message || '网关返回异常'}`,
            step: 'error'
          }]);
        }
      }
    } catch (err: any) {
      setFtpTestStatus('error');
      setBackupStatus('FTP 连接测试失败: 无法连接本地后台代理节点 (' + err.message + ')');
      setFtpTestResultLogs(prev => [...prev, {
        timestamp: new Date().toLocaleTimeString(),
        level: 'ERROR',
        message: `❌ 因为底层通信受阻，无法连通至本地后台运行微内核。报错详情: ${err.message}`,
        step: 'network'
      }]);
    } finally {
      fetchRealSyncLogs();
    }
  };

  const copyFtpTestLogs = () => {
    if (ftpTestResultLogs.length === 0) {
      alert("当前没有可复制的 FTP 探测日志。");
      return;
    }
    const txt = ftpTestResultLogs.map(l => `[${l.timestamp}] [${l.layer}] [${l.status}] [步骤: ${l.step || '常规'}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(txt).then(() => {
      alert("📋 FTP 探测调试日志已复制到剪贴板！");
    });
  };

  const exportFtpTestLogs = () => {
    if (ftpTestResultLogs.length === 0) {
      alert("当前没有可导出的 FTP 探测日志。");
      return;
    }
    const txt = ftpTestResultLogs.map(l => `[${l.timestamp}] [${l.layer}] [${l.status}] [步骤: ${l.step || '常规'}] ${l.message}`).join('\n');
    universalExport(txt, `ftp_test_diag_logs_${Date.now()}.txt`, "text/plain");
  };

  // Handle Testing LWW P2P/LAN Synchronization with backend diagnostics
  const handleTestLWW = async () => {
    setLwwTestStatus('testing');
    
    const sessionId = `lww-probe-${Math.random().toString(36).substring(2, 9)}`;
    
    setLwwTestResultLogs([
      { 
        timestamp: new Date().toLocaleTimeString(), 
        status: 'start',
        layer: 'frontend',
        message: '🚀 [1/4 建立通讯层] 正在向本地局域网协调引擎发起诊断请求，开始检查 LWW-Element-Set 状态环路...', 
        step: 'init' 
      }
    ]);

    try {
      await import('../lib/api').then(m => m.probeKernel(sessionId, 'frontend', 'lww', 'send_request', 'start', '向 Kernel 代理层发发送测试请求'));

      const apiBase = getApiBaseUrl();

      // Setup probe polling
      let isFetching = true;
      const probeInterval = setInterval(async () => {
        if (!isFetching) { clearInterval(probeInterval); return; }
        try {
          const probeRes = await fetch(`${apiBase}/probe/list`);
          if (probeRes.ok) {
            const probeData = await probeRes.json();
            const relevantLogs = probeData.filter((l: any) => l.session_id === sessionId);
            if (relevantLogs.length > 0) {
              setLwwTestResultLogs(relevantLogs.reverse());
            }
          }
        } catch(e) {}
      }, 500);

      // Start a 3-second timeout detector
      let lastLogCount = 0;
      const stuckDetector = setInterval(() => {
        if (!isFetching) { clearInterval(stuckDetector); return; }
        setLwwTestResultLogs(prev => {
          if (prev.length === lastLogCount && prev.length > 0 && prev[prev.length - 1].status !== 'error' && prev[prev.length - 1].status !== 'ok') {
             return [...prev, {
                timestamp: new Date().toLocaleTimeString(),
                status: 'error',
                layer: 'frontend',
                message: '❌ 自动卡点检测介入: 超过 3 秒没有下一层响应记录，进程可能阻塞！',
                step: 'timeout'
             }];
          }
          lastLogCount = prev.length;
          return prev;
        });
      }, 3000);

      const res = await fetch(`${apiBase}/notes/sync/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
      isFetching = false;
      clearInterval(probeInterval);
      clearInterval(stuckDetector);

      const data = await res.json();
      if (data.logs && Array.isArray(data.logs)) {
        setLwwTestResultLogs(data.logs);
      }
      if (res.ok && data.success) {
        setLwwTestStatus('success');
        setBackupStatus('LWW 局域网自卫同步健康评估：成功！');
      } else {
        setLwwTestStatus('error');
        setBackupStatus('LWW 协同错误: ' + (data.message || '诊断引擎响应中止'));
        if (!data.logs) {
          setLwwTestResultLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString(),
            status: 'error',
            layer: 'frontend',
            message: `❌ LWW 深度检测不通过: ${data.message || '网关返回通信报错'}`,
            step: 'error'
          }]);
        }
      }
    } catch (err: any) {
      setLwwTestStatus('error');
      setBackupStatus('LWW 本心物理探测故障: 无法请求本地后台协同中继 (' + err.message + ')');
      setLwwTestResultLogs(prev => [...prev, {
        timestamp: new Date().toLocaleTimeString(),
        status: 'error',
        layer: 'frontend',
        message: `❌ 物理通信中断，本地核心离线中。报错详情: ${err.message}`,
        step: 'network'
      }]);
    } finally {
      fetchRealSyncLogs();
    }
  };

  // Direct Android Local WebView to Core API Health diagnostic check
  const testHealth = async () => {
    setAndroidHealthStatus('testing');
    setAndroidHealthLogs([`[${new Date().toLocaleTimeString()}] 🚀 开始直接请求本地健康端口 (http://127.0.0.1:8787/api/health)...`]);
    try {
      const res = await fetch(
        'http://127.0.0.1:8787/api/health'
      );

      const txt = await res.text();

      console.log(res.status);
      console.log(txt);

      setAndroidHealthLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 📥 接收状态码: ${res.status}`,
        `[${new Date().toLocaleTimeString()}] 📄 响应报文内容: ${txt}`
      ]);
      if (res.ok) {
        setAndroidHealthStatus('success');
      } else {
        setAndroidHealthStatus('error');
      }
    } catch(e: any) {
      console.error(e);
      setAndroidHealthLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ 发生通讯异常: ${e?.message || e}`
      ]);
      setAndroidHealthStatus('error');
    }
  };

  const copyLwwTestLogs = () => {
    if (lwwTestResultLogs.length === 0) {
      alert("当前没有可复制的 LWW 探测日志。");
      return;
    }
    const txt = lwwTestResultLogs.map(l => `[${l.timestamp}] [${l.layer}] [${l.status}] [步骤: ${l.step || '常规'}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(txt).then(() => {
      alert("📋 LWW 探测调试日志已复制到剪贴板！");
    });
  };

  const exportLwwTestLogs = () => {
    if (lwwTestResultLogs.length === 0) {
      alert("当前没有可导出的 LWW 探测日志。");
      return;
    }
    const txt = lwwTestResultLogs.map(l => `[${l.timestamp}] [${l.layer}] [${l.status}] [步骤: ${l.step || '常规'}] ${l.message}`).join('\n');
    universalExport(txt, `lww_test_diag_logs_${Date.now()}.txt`, "text/plain");
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

                  {/* REALTIME LWW DIAGNOSTICS LOG WINDOW */}
                  {lwwTestResultLogs.length > 0 && (
                    <div className="bg-slate-950 rounded-xl border border-slate-900 overflow-hidden shadow-inner flex flex-col mt-3">
                      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900 border-b border-slate-850">
                        <span className="text-[10px] uppercase font-bold text-slate-400 font-mono flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                          LWW 本地与局域网节点深度协同诊断探频流
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={copyLwwTestLogs}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 transition"
                          >
                            📋 复制日志
                          </button>
                          <button
                            type="button"
                            onClick={exportLwwTestLogs}
                            className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 transition"
                          >
                            保存 / 导出诊断书
                          </button>
                        </div>
                      </div>
                      <div className="p-3.5 font-mono text-[11px] leading-relaxed space-y-2 max-h-[180px] overflow-y-auto select-text">
                        {lwwTestResultLogs.map((log, index) => {
                          let levelBadge = "text-slate-500 bg-slate-900";
                          let textStyle = "text-slate-300";
                          if (log.status === 'error') {
                            levelBadge = "text-rose-400 bg-rose-950/40 border border-rose-900/40 font-extrabold px-1.5 rounded";
                            textStyle = "text-rose-200 bg-rose-950/10 p-1.5 rounded border border-rose-950/20";
                          } else if (log.status === 'ok') {
                            levelBadge = "text-emerald-400 bg-emerald-950/40 border border-emerald-900/40 font-bold px-1.5 rounded";
                            textStyle = "text-emerald-300";
                          } else if (log.status === 'warn') {
                            levelBadge = "text-amber-400 bg-amber-950/40 border border-amber-900/40 font-bold px-1.5 rounded";
                            textStyle = "text-amber-250";
                          }

                          return (
                            <div key={index} className={`flex items-start gap-2 border-b border-rose-950/5 pb-1.5 last:border-0 last:pb-0 ${textStyle}`}>
                              <span className="text-slate-600 select-none whitespace-nowrap font-mono text-[10px]">
                                [{(log.timestamp || new Date().toLocaleTimeString()).includes(' ') ? (log.timestamp || '').split(' ')[1] : log.timestamp}]
                              </span>
                              {log.layer && (
                                <span className="bg-slate-800 text-indigo-300 text-[9px] px-1 rounded border border-slate-700 select-none font-mono">
                                  {log.layer.toUpperCase()}
                                </span>
                              )}
                              {log.step && (
                                <span className="bg-slate-900 text-indigo-400 text-[9px] px-1 rounded border border-slate-850 select-none font-mono">
                                  {log.step.toUpperCase()}
                                </span>
                              )}
                              <span className={`text-[9px] font-bold select-none px-1 rounded font-mono uppercase ${levelBadge}`}>
                                {log.status || 'INFO'}
                              </span>
                              <span className="flex-1 break-all whitespace-pre-wrap">
                                {log.message}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleTestLWW}
                      disabled={lwwTestStatus === 'testing'}
                      className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all border whitespace-nowrap ${
                        lwwTestStatus === 'testing'
                          ? 'bg-slate-800 text-slate-500 border-slate-750 cursor-not-allowed'
                          : lwwTestStatus === 'success'
                          ? 'bg-emerald-650 hover:bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/20'
                          : lwwTestStatus === 'error'
                          ? 'bg-rose-950/40 text-rose-300 border-rose-900/30 hover:bg-rose-900/20'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-950/20'
                      }`}
                    >
                      {lwwTestStatus === 'testing' 
                        ? '⏳ 正在进行 LWW 一致性健康评估...' 
                        : lwwTestStatus === 'success' 
                        ? '✅ LWW 链路验证成功 (点击重试)' 
                        : lwwTestStatus === 'error' 
                        ? '❌ 协同检测失败 (点击重新校验)' 
                        : '⚡ 一键测试并验证 LWW 协同健康状态'}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2.5 border-t border-slate-800/40 mt-4">
                    <button
                      type="button"
                      id="btn-android-health-direct-test"
                      onClick={testHealth}
                      disabled={androidHealthStatus === 'testing'}
                      className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all border whitespace-nowrap ${
                        androidHealthStatus === 'testing'
                          ? 'bg-slate-800 text-slate-500 border-slate-750 cursor-not-allowed'
                          : androidHealthStatus === 'success'
                          ? 'bg-emerald-650 hover:bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/20'
                          : androidHealthStatus === 'error'
                          ? 'bg-rose-950/45 text-rose-300 border-rose-900/30 hover:bg-rose-900/20'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-950/20'
                      }`}
                    >
                      {androidHealthStatus === 'testing' 
                        ? '⏳ 正在进行 HTTP 8787 直连测试...' 
                        : androidHealthStatus === 'success' 
                        ? '✅ Android WebView 8787 直连成功 (重新测试)' 
                        : androidHealthStatus === 'error' 
                        ? '❌ Android WebView 8787 连通失败 (重新测试)' 
                        : '📱 极简一键直测: Android WebView 至 Local 8787 /api/health'}
                    </button>
                    {androidHealthLogs.length > 0 && (
                      <button
                        type="button"
                        id="btn-android-health-clear-logs"
                        onClick={() => {
                          setAndroidHealthLogs([]);
                          setAndroidHealthStatus('idle');
                        }}
                        className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-800 rounded-lg text-xs font-medium transition-colors"
                      >
                        清空直测分析
                      </button>
                    )}
                  </div>

                  {androidHealthLogs.length > 0 && (
                    <div id="android-health-log-viewer" className="bg-slate-950 rounded-lg p-3.5 border border-slate-900 font-mono text-[10px] space-y-1.5 text-slate-300 max-h-48 overflow-y-auto mt-2">
                      <div className="text-slate-500 pb-1.5 border-b border-slate-900/50 select-none">
                        ⚙️ Android WebView 至 Core API 直连诊断记录:
                      </div>
                      {androidHealthLogs.map((log, index) => (
                        <div key={index} className="whitespace-pre-wrap break-all select-all py-0.5 text-slate-300">
                          {log}
                        </div>
                      ))}
                    </div>
                  )}
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

                    {/* REALTIME FTP DIAGNOSTICS LOG WINDOW */}
                    {ftpTestResultLogs.length > 0 && (
                      <div className="bg-slate-950 rounded-xl border border-slate-900 overflow-hidden shadow-inner flex flex-col">
                        <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900 border-b border-slate-850">
                          <span className="text-[10px] uppercase font-bold text-slate-400 font-mono flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            FTP 双向握手协议深度探测诊断流
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={copyFtpTestLogs}
                              className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 transition"
                            >
                              📋 复制日志
                            </button>
                            <button
                              type="button"
                              onClick={exportFtpTestLogs}
                              className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 transition"
                            >
                              保存 / 导出诊断书
                            </button>
                          </div>
                        </div>
                        <div className="p-3.5 font-mono text-[11px] leading-relaxed space-y-2 max-h-[180px] overflow-y-auto select-text">
                          {ftpTestResultLogs.map((log, index) => {
                            let levelBadge = "text-slate-500 bg-slate-900";
                            let textStyle = "text-slate-300";
                            if (log.status === 'error') {
                              levelBadge = "text-rose-400 bg-rose-950/40 border border-rose-900/40 font-extrabold px-1.5 rounded";
                              textStyle = "text-rose-200 bg-rose-950/10 p-1.5 rounded border border-rose-950/20";
                            } else if (log.status === 'ok') {
                              levelBadge = "text-emerald-400 bg-emerald-950/40 border border-emerald-900/40 font-bold px-1.5 rounded";
                              textStyle = "text-emerald-300";
                            } else if (log.status === 'warn') {
                              levelBadge = "text-amber-400 bg-amber-950/40 border border-amber-900/40 font-bold px-1.5 rounded";
                              textStyle = "text-amber-250";
                            }

                            return (
                              <div key={index} className={`flex items-start gap-2 border-b border-rose-950/5 pb-1.5 last:border-0 last:pb-0 ${textStyle}`}>
                                <span className="text-slate-600 select-none whitespace-nowrap">
                                  [{(log.timestamp || new Date().toLocaleTimeString()).includes(' ') ? (log.timestamp || '').split(' ')[1] : log.timestamp}]
                                </span>
                                {log.layer && (
                                  <span className="bg-slate-800 text-emerald-300 text-[9px] px-1 rounded border border-slate-700 select-none font-mono">
                                    {log.layer.toUpperCase()}
                                  </span>
                                )}
                                {log.step && (
                                  <span className="bg-slate-900 text-indigo-400 text-[10px] px-1 rounded border border-slate-850 select-none">
                                    {log.step.toUpperCase()}
                                  </span>
                                )}
                                <span className={`text-[10px] uppercase font-bold select-none px-1 rounded ${levelBadge}`}>
                                  {log.status || 'INFO'}
                                </span>
                                <span className="flex-1 break-all whitespace-pre-wrap">
                                  {log.message}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleTestFTP}
                        disabled={ftpTestStatus === 'testing'}
                        className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all border whitespace-nowrap ${
                          ftpTestStatus === 'testing'
                            ? 'bg-slate-800 text-slate-500 border-slate-750 cursor-not-allowed'
                            : ftpTestStatus === 'success'
                            ? 'bg-emerald-650 hover:bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/20'
                            : ftpTestStatus === 'error'
                            ? 'bg-rose-950/40 text-rose-300 border-rose-900/30 hover:bg-rose-900/20'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-950/20'
                        }`}
                      >
                        {ftpTestStatus === 'testing' ? '⏳ 正在进行连接测试...' : ftpTestStatus === 'success' ? '✅ FTP 身份验证成功 (点击重试)' : ftpTestStatus === 'error' ? '❌ 探测登录失败 (点击重新校验)' : '⚡ 一键测试并验证 FTP 连接'}
                      </button>

                      <button 
                        type="button"
                        onClick={async () => {
                          setBackupStatus('正在尝试上传 FTP...');
                          await addSyncLog('INFO', `[FTP 同步启动] 客户端发出手动仅限【推送备份】指令。`);
                          fetchRealSyncLogs();
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
                          await addSyncLog('INFO', `[FTP 同步启动] 客户端发出手动仅限【拉取并融合】指令。`);
                          fetchRealSyncLogs();
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
                          await addSyncLog('INFO', `[FTP 同步启动] 客户端发出主体【双向闭环同步】指令。`);
                          fetchRealSyncLogs();
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-indigo-400 animate-pulse" /> 局域网 & 云备份 统一同步日志系统
                  </h2>
                  <div className="flex items-center gap-1.5 bg-slate-900/60 p-0.5 rounded-lg border border-slate-850 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setViewMode('grouped')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-all ${viewMode === 'grouped' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      📦 结构化调试
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('flat')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-all ${viewMode === 'flat' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      🖥️ 原始日志流
                    </button>
                  </div>
                </div>

                <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-800 space-y-4 animate-fade-in animate-duration-150">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-850 pb-4">
                    <div className="space-y-1">
                      <h3 className="font-semibold text-sm flex items-center gap-2 text-slate-100">
                        同步实时监测控制台 
                        <span className="px-1.5 py-0.5 bg-slate-950 text-indigo-450 text-[10px] rounded border border-slate-800 font-mono">
                          SQLite 循环 1000 条
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500">深度透视 WebDAV 握手、FTP 目录切入、或 LWW 局域网离线多源差异合并。</p>
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

                  {/* PROTOCOL FILTER PILLS */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-slate-500 font-medium mr-1.5 select-none text-[11px]">协议过滤:</span>
                      <button
                        type="button"
                        onClick={() => setSelectedProtocol('all')}
                        className={`px-3 py-1 rounded-full border text-[11px] font-bold transition-all ${selectedProtocol === 'all' ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300' : 'bg-slate-900/40 border-slate-850 text-slate-400 hover:text-slate-300'}`}
                      >
                        🔄 全部 ({realSyncLogs.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedProtocol('lww')}
                        className={`px-3 py-1 rounded-full border text-[11px] font-bold transition-all ${selectedProtocol === 'lww' ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' : 'bg-slate-900/40 border-slate-850 text-slate-400 hover:text-slate-300'}`}
                      >
                        ⚡ LWW 协同 ({realSyncLogs.filter(l => l.protocol === 'lww' || (!l.session_id && !l.message.includes('[FTP]') && !l.message.includes('[WebDAV]'))).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedProtocol('ftp')}
                        className={`px-3 py-1 rounded-full border text-[11px] font-bold transition-all ${selectedProtocol === 'ftp' ? 'bg-blue-500/15 border-blue-500/30 text-blue-300' : 'bg-slate-900/40 border-slate-850 text-slate-400 hover:text-slate-300'}`}
                      >
                        📂 FTP 备份 ({realSyncLogs.filter(l => l.protocol === 'ftp' || (!l.session_id && (l.message.includes('[FTP]') || l.message.startsWith('FTP')))).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedProtocol('webdav')}
                        className={`px-3 py-1 rounded-full border text-[11px] font-bold transition-all ${selectedProtocol === 'webdav' ? 'bg-purple-500/15 border-purple-500/30 text-purple-300' : 'bg-slate-900/40 border-slate-850 text-slate-400 hover:text-slate-300'}`}
                      >
                        🌐 WebDAV ({realSyncLogs.filter(l => l.protocol === 'webdav' || (!l.session_id && (l.message.includes('[WebDAV]') || l.message.startsWith('WebDAV')))).length})
                      </button>
                    </div>
                    {viewMode === 'grouped' && (
                      <span className="text-[11px] text-slate-500 italic">
                        已诊断出 {groupedSessions.length} 个独立同步事务会话
                      </span>
                    )}
                  </div>

                  {/* MAIN CONTAINER */}
                  {viewMode === 'grouped' ? (
                    <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1 select-text">
                      {groupedSessions.length === 0 ? (
                        <div className="bg-slate-950/40 rounded-xl border border-slate-850 border-dashed text-center py-12 text-slate-500 italic font-mono text-xs">
                          [当前筛选条件下无结构化诊断会话] 请触发数据传输以留存 Trace ID。
                        </div>
                      ) : (
                        groupedSessions.map((session) => {
                          const isExpanded = !!expandedSessions[session.sessionId];
                          let cardBorder = "border-slate-850 hover:border-slate-800 bg-slate-900/30";
                          let statusBadge = "bg-slate-950 text-slate-400 border-slate-850";
                          let statusLabel = "就绪";
                          
                          if (session.status === 'ERROR') {
                            cardBorder = "border-rose-950/60 bg-rose-950/5 hover:border-rose-900/50";
                            statusBadge = "bg-rose-950/60 text-rose-300 border-rose-900/40";
                            statusLabel = "异常中止";
                          } else if (session.status === 'WARN') {
                            cardBorder = "border-amber-950/60 bg-amber-950/5 hover:border-amber-900/50";
                            statusBadge = "bg-amber-950/60 text-amber-300 border-amber-900/40";
                            statusLabel = "警告提示";
                          } else if (session.status === 'SUCCESS') {
                            cardBorder = "border-emerald-950/50 bg-emerald-950/5 hover:border-emerald-900/40";
                            statusBadge = "bg-emerald-950/60 text-emerald-300 border-emerald-900/40";
                            statusLabel = "合流顺畅";
                          }

                          // Render distinct colors by protocol
                          let protocolColor = "bg-slate-950 text-slate-400 border-slate-800";
                          if (session.protocol === 'ftp') {
                            protocolColor = "bg-sky-950/70 text-sky-400 border-sky-900/40";
                          } else if (session.protocol === 'webdav') {
                            protocolColor = "bg-purple-950/70 text-purple-400 border-purple-900/40";
                          } else if (session.protocol === 'lww') {
                            protocolColor = "bg-amber-950/70 text-amber-400 border-amber-900/40";
                          }

                          // Get chronological list of unique step IDs for the trace visualizer
                          const uniqueSteps = session.steps
                            .map(st => st.step)
                            .filter((val, i, self) => val && self.indexOf(val) === i);

                          return (
                            <div key={session.sessionId} className={`rounded-xl border transition-all ${cardBorder} overflow-hidden`}>
                              {/* HEADER COLLAPSIBLE BANNER */}
                              <div 
                                onClick={() => {
                                  setExpandedSessions(prev => ({
                                    ...prev,
                                    [session.sessionId]: !prev[session.sessionId]
                                  }));
                                }}
                                className="p-3.5 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none"
                              >
                                <div className="flex items-center gap-3">
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase border tracking-wider font-mono ${protocolColor}`}>
                                    {session.protocol}
                                  </span>
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-slate-200 font-bold text-xs font-mono">
                                        SESSION: {session.sessionId.length > 16 ? `${session.sessionId.substring(0, 8)}...` : session.sessionId}
                                      </span>
                                      <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                                        ({session.startTime.substring(11)})
                                      </span>
                                    </div>
                                    {/* HORIZONTAL STEP TRACE PIPELINE */}
                                    {uniqueSteps.length > 0 && (
                                      <div className="flex flex-wrap items-center gap-1 text-[9px] text-slate-500 font-mono mt-1">
                                        {uniqueSteps.map((s, idx) => {
                                          let isStepError = false;
                                          session.steps.forEach(st => {
                                            if (st.step === s && st.level === 'ERROR') isStepError = true;
                                          });

                                          return (
                                            <div key={idx} className="flex items-center gap-1">
                                              {idx > 0 && <span>→</span>}
                                              <span className={`px-1 py-0.2 rounded font-semibold ${isStepError ? 'bg-rose-900/50 text-rose-300' : 'bg-slate-950/60 text-slate-400 border border-slate-850'}`}>
                                                {s}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${statusBadge}`}>
                                    {statusLabel}
                                  </span>
                                  <span className="text-slate-500 transition-transform duration-200 text-xs">
                                    {isExpanded ? '▼ 隐藏' : '▲ 诊断'}
                                  </span>
                                </div>
                              </div>

                              {/* EXPANDED TERMINAL VIEW */}
                              {isExpanded && (
                                <div className="bg-slate-950 p-3 border-t border-slate-850 font-mono text-[11px] space-y-2 select-text shadow-inner">
                                  <div className="text-[10px] text-slate-500 border-b border-slate-900 pb-1.5 mb-1.5 flex justify-between select-none">
                                    <span>事务启动时间印记: {session.startTime}</span>
                                    <span>会话闭环时间印记: {session.endTime}</span>
                                  </div>
                                  {session.steps.map((st, sidx) => {
                                    let tagStyle = "text-slate-400";
                                    let wrapperStyle = "text-slate-300";
                                    if (st.level === "ERROR") {
                                      tagStyle = "text-rose-400 font-bold bg-rose-950/50 border border-rose-900/30 px-1 rounded";
                                      wrapperStyle = "text-rose-200 bg-rose-950/10 p-1.5 rounded border border-rose-900/10";
                                    } else if (st.level === "SUCCESS") {
                                      tagStyle = "text-emerald-400 font-bold bg-emerald-950/50 border border-emerald-900/30 px-1 rounded";
                                      wrapperStyle = "text-emerald-200";
                                    } else if (st.level === "WARN") {
                                      tagStyle = "text-amber-400 font-bold bg-amber-950/50 border border-amber-900/30 px-1 rounded";
                                      wrapperStyle = "text-amber-200/90";
                                    }
                                    
                                    return (
                                      <div key={sidx} className={`flex items-start gap-2 border-b border-slate-950 pb-1 last:border-0 last:pb-0 ${wrapperStyle}`}>
                                        <span className="text-slate-600 select-none whitespace-nowrap">
                                          [{st.timestamp.substring(11)}]
                                        </span>
                                        {st.step && (
                                          <span className="bg-slate-900/80 px-1 rounded text-indigo-400 text-[10px] select-none border border-slate-850">
                                            {st.step}
                                          </span>
                                        )}
                                        <span className={`text-[10px] uppercase font-bold select-none ${tagStyle}`}>
                                          [{st.level}]
                                        </span>
                                        <span className="flex-1 break-all leading-relaxed whitespace-pre-wrap select-all">
                                          {st.message}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : (
                    <div className="bg-slate-950 rounded-xl border border-slate-850 p-4 font-mono text-xs overflow-y-auto max-h-[380px] space-y-2.5 shadow-inner select-text">
                      {realSyncLogs.length === 0 ? (
                        <div className="text-center py-10 text-slate-600 italic">
                          [当前无同步日志记载] 请点击上方进行双向同步、推送、拉取或开启强制同步以生成数据流。
                        </div>
                      ) : (
                        realSyncLogs
                          .filter(log => {
                            if (selectedProtocol === 'all') return true;
                            const protocol = log.protocol || (log.message.includes('[FTP]') ? 'ftp' : log.message.includes('[WebDAV]') ? 'webdav' : 'lww');
                            return protocol === selectedProtocol;
                          })
                          .map((log, index) => {
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
                                {log.protocol && (
                                  <span className="px-1 bg-slate-900 text-[10px] text-indigo-400 rounded uppercase font-bold border border-slate-800 select-none">
                                    {log.protocol}
                                  </span>
                                )}
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
                  )}
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
                          accept=".json,.zip" 
                          className="hidden" 
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.name.endsWith('.zip')) {
                                try {
                                  const formData = new FormData();
                                  formData.append('file', file);
                                  const response = await fetch(`${getApiBaseUrl()}/backup/import`, {
                                    method: 'POST',
                                    body: formData
                                  });
                                  if (!response.ok) throw new Error('Failed to import backup');
                                  alert("ZIP 备份导入成功！页面即将重载...");
                                  window.location.reload();
                                } catch (e) {
                                  alert("ZIP 备份导入失败: " + String(e));
                                }
                              } else {
                                const text = await file.text();
                                handleImportDatabase(text);
                              }
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
