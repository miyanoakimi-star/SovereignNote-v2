import { useState, useEffect, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { SovereignNative } from './plugins/sovereignNative';
import { NavState, Note, CalendarEvent } from './types';
import Sidebar from './components/Sidebar';
import PartitionBar from './components/PartitionBar';
import MainArea from './components/MainArea';
import { getLocalNotes, saveLocalNotes, syncWithBackend, getApiBaseUrl, addSyncLog } from './lib/api';
import { safeStorage } from './utils/safeStorage';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function App() {
  const [navState, setNavState] = useState<NavState>('notes');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isPartitionOpen, setIsPartitionOpen] = useState<boolean>(true);

  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Custom states matching requested requirements
  const [fontSizeLevel, setFontSizeLevel] = useState<number>(() => {
    const saved = safeStorage.getItem('sovereign_font_size');
    return saved ? parseInt(saved, 10) : 2; // default: 2 (Normal)
  });

  const [themeMode, setThemeMode] = useState<'day' | 'night'>(() => {
    return (safeStorage.getItem('sovereign_theme') as 'day' | 'night') || 'night';
  });

  const [deviceProfile, setDeviceProfile] = useState<string>(() => {
    return safeStorage.getItem('sovereign_device_profile') || 'win-pc';
  });

  const [customEvents, setCustomEvents] = useState<CalendarEvent[]>(() => {
    const saved = safeStorage.getItem('sovereign_events');
    return saved ? JSON.parse(saved) : [
      { id: 'event-1', title: '✈️ 飞往东京', date: '2026-05-16', noteId: null },
      { id: 'event-2', title: '🎉 App 发布会', date: '2026-05-10', noteId: null },
    ];
  });

  const [uiScale, setUiScale] = useState<number>(() => {
    const saved = safeStorage.getItem('sovereign_ui_scale');
    return saved ? parseFloat(saved) : 1.0;
  });

  const [webdavConfig, setWebdavConfig] = useState(() => {
    const saved = safeStorage.getItem('sovereign_webdav');
    return saved ? JSON.parse(saved) : {
      url: 'https://dav.jianguoyun.com/dav',
      port: '443',
      path: '/SovereignNotes',
      username: '',
      password: '',
    };
  });

  const [ftpConfig, setFtpConfig] = useState(() => {
    const saved = safeStorage.getItem('sovereign_ftp');
    return saved ? JSON.parse(saved) : {
      host: '192.168.1.100:21',
      user: 'admin',
      pass: '',
      path: '/Backup',
      secure: false
    };
  });

  const [customFestivals, setCustomFestivals] = useState<Record<string, string>>(() => {
    const saved = safeStorage.getItem('sovereign_custom_festivals');
    return saved ? JSON.parse(saved) : {};
  });

  // Independent storage for tags (not stored inside the notes)
  const [independentTags, setIndependentTags] = useState<string[]>(() => {
    const saved = safeStorage.getItem('sovereign_independent_tags');
    return saved ? JSON.parse(saved) : [
      '生活',
      '工作',
      '工作/代码',
      '工作/代码/React',
      '个人/健康',
      '个人/读书'
    ];
  });

  const [noteTagsMap, setNoteTagsMap] = useState<Record<string, string[]>>(() => {
    const saved = safeStorage.getItem('sovereign_note_tags_map');
    return saved ? JSON.parse(saved) : {};
  });

  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string>('backup');
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'appearance' | 'editor' | 'calendar' | 'sync' | 'about'>('general');

  useEffect(() => {
    const handleTouch = () => {
      document.body.classList.add('profile-tablet');
    };
    window.addEventListener('touchstart', handleTouch, { once: true });
    return () => window.removeEventListener('touchstart', handleTouch);
  }, []);

  // Window maximized detection to auto-hide custom titlebar in desktop/tablet mode
  useEffect(() => {
    const checkMaximized = () => {
      const isMax = window.outerWidth >= window.screen.availWidth - 15 && 
                    window.outerHeight >= window.screen.availHeight - 15;
      if (isMax) {
        document.body.classList.add('window-maximized');
      } else {
        document.body.classList.remove('window-maximized');
      }
    };
    window.addEventListener('resize', checkMaximized);
    checkMaximized();
    return () => window.removeEventListener('resize', checkMaximized);
  }, []);

  // Swipe gesture for sidebar (touch/tablet devices)
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    
    const handleTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    
    const handleTouchEnd = (e: TouchEvent) => {
      const diffX = e.changedTouches[0].clientX - startX;
      const diffY = e.changedTouches[0].clientY - startY;
      
      // Horizontal swipe: trigger if horizontal swipe is substantial & vertical is relatively minor
      if (Math.abs(diffX) > 110 && Math.abs(diffY) < 60) {
        if (diffX > 0) {
          setIsSidebarOpen(true); // Swipe right -> Open Sidebar
        } else {
          setIsSidebarOpen(false); // Swipe left -> Close Sidebar
        }
      }
    };
    
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--global-ui-scale', String(uiScale));
    safeStorage.setItem('sovereign_ui_scale', String(uiScale));
  }, [uiScale]);

  useEffect(() => {
    const handleStateUpdated = () => {
      const savedEvents = safeStorage.getItem('sovereign_events');
      if (savedEvents) setCustomEvents(JSON.parse(savedEvents));

      const savedInd = safeStorage.getItem('sovereign_independent_tags');
      if (savedInd) setIndependentTags(JSON.parse(savedInd));

      const savedMap = safeStorage.getItem('sovereign_note_tags_map');
      if (savedMap) setNoteTagsMap(JSON.parse(savedMap));
    };
    window.addEventListener('sovereign_app_state_updated', handleStateUpdated);
    return () => window.removeEventListener('sovereign_app_state_updated', handleStateUpdated);
  }, []);

  // Check for incoming shared intents from other Android apps
  useEffect(() => {
    let active = true;
    const checkForShareIntent = async () => {
      try {
        if (!Capacitor.isNativePlatform()) return;
        const res = await SovereignNative.getPendingShareIntent();
        if (active && res.hasShare && res.data) {
          const title = res.data.title || '系统分享内容';
          const text = res.data.text || '';
          
          addSyncLog('INFO', `[系统分享] 接收到 Android 系统分享意图: 标题=${title}, 内容长度=${text.length}字`);
          
          // Formulate Markdown content with received title and URL/text
          let formattedContent = `# ${title}\n\n`;
          if (text.startsWith('http://') || text.startsWith('https://')) {
            formattedContent += `🔗 **来源链接**: [${text}](${text})\n\n`;
          } else {
            formattedContent += `${text}\n\n`;
          }
          formattedContent += `*分享自 Android 系统设备 (接收于 ${new Date().toLocaleString()})*\n`;

          handleCreateNote(title, formattedContent, '系统分享');
          alert(`📥 成功通过 Android 分享创建一篇新备忘：\n「${title}」`);
        }
      } catch (err) {
        console.warn('Failed to fetch pending share intent:', err);
      }
    };

    // Run on startup
    checkForShareIntent();

    // Also run when window gets focus (returns from background share)
    window.addEventListener('focus', checkForShareIntent);
    
    // Periodically poll every 3 seconds to be fast
    const interval = setInterval(checkForShareIntent, 3000);

    return () => {
      active = false;
      window.removeEventListener('focus', checkForShareIntent);
      clearInterval(interval);
    };
  }, [notes]);

  useEffect(() => {
    let cached = getLocalNotes();
    cached = cached.filter(n => n.id !== '__SOVEREIGN_APP_STATE__');
    setNotes(cached);
    if (cached.length > 0) {
      const active = cached.find(n => !n.deleted);
      if (active) setActiveNoteId(active.id);
    }

    // Trigger auto backup (at most 1 per day based on backend Rust logic)
    const runAutoBackup = async () => {
      try {
        await fetch(`${getApiBaseUrl()}/backup/auto/run`, { method: 'POST' });
      } catch (e) {
        console.warn('Auto backup trigger failed:', e);
      }
    };
    runAutoBackup();
  }, []);

  // Sync settings when modified
  useEffect(() => {
    safeStorage.setItem('sovereign_font_size', String(fontSizeLevel));
  }, [fontSizeLevel]);

  useEffect(() => {
    if (themeMode === 'day') {
      document.body.classList.add('theme-light');
    } else {
      document.body.classList.remove('theme-light');
    }
    safeStorage.setItem('sovereign_theme', themeMode);
  }, [themeMode]);

  useEffect(() => {
    // Remove all old profile classes first
    document.body.classList.remove('profile-win', 'profile-tablet', 'profile-android13', 'profile-android5');
    
    if (deviceProfile === 'win-pc') {
      document.body.classList.add('profile-win');
    } else if (deviceProfile === 'win-tablet') {
      document.body.classList.add('profile-win', 'profile-tablet');
    } else if (deviceProfile === 'android-13') {
      document.body.classList.add('profile-tablet', 'profile-android13');
    } else if (deviceProfile === 'sharp-r2') {
      document.body.classList.add('profile-tablet', 'profile-android5');
    } else if (deviceProfile === 'nokia-n1') {
      document.body.classList.add('profile-tablet', 'profile-android5');
    }
    safeStorage.setItem('sovereign_device_profile', deviceProfile);
  }, [deviceProfile]);

  const applyDevicePreset = (profile: string) => {
    setDeviceProfile(profile);
    if (profile === 'win-pc') {
      setUiScale(1.0);
      setFontSizeLevel(2);
    } else if (profile === 'win-tablet') {
      setUiScale(1.2);
      setFontSizeLevel(3);
    } else if (profile === 'android-13') {
      setUiScale(1.0);
      setFontSizeLevel(2);
    } else if (profile === 'sharp-r2') {
      setUiScale(0.9);
      setFontSizeLevel(1);
    } else if (profile === 'nokia-n1') {
      setUiScale(1.3);
      setFontSizeLevel(4);
    }
  };

  useEffect(() => {
    safeStorage.setItem('sovereign_independent_tags', JSON.stringify(independentTags));
    safeStorage.setItem('sovereign_app_state_updated_at', Date.now().toString());
  }, [independentTags]);

  useEffect(() => {
    safeStorage.setItem('sovereign_note_tags_map', JSON.stringify(noteTagsMap));
    safeStorage.setItem('sovereign_app_state_updated_at', Date.now().toString());
  }, [noteTagsMap]);

  useEffect(() => {
    safeStorage.setItem('sovereign_events', JSON.stringify(customEvents));
    safeStorage.setItem('sovereign_app_state_updated_at', Date.now().toString());
  }, [customEvents]);

  useEffect(() => {
    safeStorage.setItem('sovereign_webdav', JSON.stringify(webdavConfig));
  }, [webdavConfig]);

  useEffect(() => {
    safeStorage.setItem('sovereign_ftp', JSON.stringify(ftpConfig));
  }, [ftpConfig]);

  useEffect(() => {
    safeStorage.setItem('sovereign_custom_festivals', JSON.stringify(customFestivals));
  }, [customFestivals]);

  // 自动且具有防抖功能地将前台笔记同步至 Rust 本地 SQLite 数据库 (实现 LWW 融合)
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await syncWithBackend();
        if (res.success) {
          const purelyNotes = res.notes.filter(n => n.id !== '__SOVEREIGN_APP_STATE__');
          const currentStr = JSON.stringify(notes);
          const syncedStr = JSON.stringify(purelyNotes);
          if (currentStr !== syncedStr) {
            addSyncLog('INFO', `[局域网 LWW 自动同步] 侦测到本地缓存与 SQLite 存在版本差，完成对等差异数据融合 (LWW 策略，合并至 ${purelyNotes.length} 篇)。`);
            setNotes(purelyNotes);
          }
        } else {
          addSyncLog('ERROR', `[局域网 LWW 自动同步] 自动同步最终一致性融合网络异常: ${res.error || '连接服务器失败'}`);
        }
      } catch (e: any) {
        console.warn('Silent local sync to Rust backend failed:', e);
        addSyncLog('ERROR', `[局域网 LWW 自动同步] 自动同步异常报错: ${e?.message || e}`);
      }
    }, 1500); // 防抖 1.5 秒，在用户停止输入后触发
    return () => clearTimeout(timer);
  }, [notes, independentTags, noteTagsMap, customEvents]);

  // 高兼容、低功耗、跨局域网多设备 SSE 实时数据共识监听订阅
  useEffect(() => {
    let sse: EventSource | null = null;
    let reconnectTimeout: any = null;

    function connect() {
      const baseUrl = getApiBaseUrl();
      // sse url: swap /api suffix to /api/events
      const eventsUrl = `${baseUrl.replace(/\/api$/, '')}/api/events`;
      
      console.log('Connecting to real-time sync SSE event stream at:', eventsUrl);
      addSyncLog('INFO', `[局域网 LWW SSE 通讯] 正在初始化建立跨平台局域网广播监听流 (通道地址: ${eventsUrl})...`);
      
      sse = new EventSource(eventsUrl);

      sse.onopen = () => {
        addSyncLog('SUCCESS', `[局域网 LWW SSE 通讯] 成功建立与本地/局域网代理的实时对等网络广播监听服务，状态为【活跃接入】。`);
      };

      sse.onmessage = async (event) => {
        try {
          console.log('SSE Real-time update signal detected:', event.data);
          addSyncLog('INFO', `[局域网 LWW SSE 通讯] 捕获局域网差分消息: ${event.data}。客户端发起 LWW 冲突重组机制。`);
          
          const res = await syncWithBackend();
          if (res.success) {
            const purelyNotes = res.notes.filter(n => n.id !== '__SOVEREIGN_APP_STATE__');
            addSyncLog('SUCCESS', `[局域网 LWW SSE 通讯] 差异重构完毕。前台已合流至全局最新版本记录。`);
            setNotes(purelyNotes);
          } else {
            addSyncLog('ERROR', `[局域网 LWW SSE 通讯] 同步异常断链：${res.error || '未知网络问题'}`);
          }
        } catch (err: any) {
          console.warn('Error reading incoming SSE payload or merging notes:', err);
          addSyncLog('ERROR', `[局域网 LWW SSE 通讯] 广播解析失败: ${err?.message || err}`);
        }
      };

      sse.onerror = () => {
        console.warn('SSE stream disconnected. Attempting auto-reconnection in 5 seconds...', eventsUrl);
        addSyncLog('WARN', `[局域网 LWW SSE 通讯] 侦听流断开或掉路。正在计划于 5 秒后执行微秒级重试（支持局域网断网自我修复）。`);
        if (sse) {
          sse.close();
        }
        reconnectTimeout = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      if (sse) sse.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  const activeNote = useMemo(() => {
    return notes.find(n => n.id === activeNoteId) || null;
  }, [notes, activeNoteId]);

  function updateNote(id: string, title: string, content: string, extraFields?: Partial<Note>) {
    const now = Date.now();
    const updated = notes.map(n => {
      if (n.id === id) {
        return { ...n, title, content, ...extraFields, updated_at: now };
      }
      return n;
    });
    setNotes(updated);
    saveLocalNotes(updated);
  }

  function updateActiveNote(title: string, content: string, extraFields?: Partial<Note>) {
    if (!activeNoteId) return;
    updateNote(activeNoteId, title, content, extraFields);
  }

  function handleCreateNote(initialTitle?: string, initialContent?: string, folder?: string, extraFields?: Partial<Note>) {
    const now = Date.now();
    const newNote: Note = {
      id: generateUUID(),
      title: initialTitle || '无标题笔记',
      content: initialContent || '# 无标题笔记\n\n开始写作...',
      type: 'markdown',
      created_at: now,
      updated_at: now,
      deleted: false,
      folder: folder,
      ...extraFields
    };
    const updated = [newNote, ...notes];
    setNotes(updated);
    saveLocalNotes(updated);
    setActiveNoteId(newNote.id);
    if (!isPartitionOpen) setIsPartitionOpen(true);
  }

  function handleDeleteNote(id: string) {
    if (!window.confirm('确定要删除此笔记吗？')) return;
    const now = Date.now();
    const updated = notes.map(n => {
      if (n.id === id) return { ...n, deleted: true, updated_at: now };
      return n;
    });
    setNotes(updated);
    saveLocalNotes(updated);
    if (activeNoteId === id) {
      const nextActive = updated.find(n => !n.deleted);
      setActiveNoteId(nextActive ? nextActive.id : null);
    }
  }

  // Export full backup using Rust Time Machine Backend
  async function handleExportDatabase() {
    try {
      const response = await fetch(`${getApiBaseUrl()}/backup/manual`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Failed to create manual backup');
      }
      const data = await response.json();
      if (data.file) {
        window.location.href = `${getApiBaseUrl()}/backup/download/${data.file}`;
      }
    } catch (e) {
      alert("备份导出失败: " + String(e));
    }
  }

  // Import full database from JSON content
  function handleImportDatabase(jsonData: string) {
    try {
      const parsed = JSON.parse(jsonData);
      let notesToImport: Note[] | null = null;
      let parsedObj: any = parsed;

      if (parsedObj.notes && Array.isArray(parsedObj.notes)) {
        notesToImport = parsedObj.notes;
      } else if (Array.isArray(parsedObj)) {
        // Fallback for raw note array exports
        notesToImport = parsedObj;
        parsedObj = {}; // No other config metadata available
      } else if (parsedObj.id && parsedObj.created_at) {
         // Fallback for single note export
         notesToImport = [parsedObj];
         parsedObj = {};
      }

      if (notesToImport) {
        // Merge notes using LWW algorithm
        const merged = [...notesToImport, ...notes];
        // Ensure no duplicate IDs by using newest updated_at
        const uniqueMap: Record<string, Note> = {};
        for (const n of merged) {
          if (!uniqueMap[n.id] || n.updated_at > uniqueMap[n.id].updated_at) {
            uniqueMap[n.id] = n;
          }
        }
        const finalNotes = Object.values(uniqueMap);
        setNotes(finalNotes);
        saveLocalNotes(finalNotes);

        if (parsedObj.customEvents && Array.isArray(parsedObj.customEvents)) {
          setCustomEvents(parsedObj.customEvents);
        }
        if (parsedObj.webdavConfig) {
          setWebdavConfig(parsedObj.webdavConfig);
        }
        if (parsedObj.fontSizeLevel) {
          setFontSizeLevel(parsedObj.fontSizeLevel);
        }
        if (parsedObj.customFestivals) {
          setCustomFestivals(parsedObj.customFestivals);
        }
        if (parsedObj.independentTags && Array.isArray(parsedObj.independentTags)) {
          setIndependentTags(parsedObj.independentTags);
        }
        if (parsedObj.noteTagsMap && typeof parsedObj.noteTagsMap === 'object') {
          setNoteTagsMap(parsedObj.noteTagsMap);
        }
        alert("数据库同步备份导入成功！");
      } else {
        alert("导入失败：JSON 格式不兼容，缺少核心 notes 数据库。");
      }
    } catch (e: any) {
      alert("导入解析错误: " + e.message);
    }
  }

  // Batch import notes from diverse formats
  const handleImportNotesFromFiles = async (files: FileList | File[]) => {
    const now = Date.now();
    const newNotes: Note[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const text = await file.text();
      let title = file.name.replace(/\.[^/.]+$/, ""); // strip extension
      let content = text;

      if (file.name.endsWith('.json')) {
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            // Merge batch
            const merged = [...parsed, ...notes];
            setNotes(merged);
            saveLocalNotes(merged);
            alert(`成功导入 ${parsed.length} 条笔记！`);
            continue;
          } else if (parsed.title && parsed.content) {
            title = parsed.title;
            content = parsed.content;
          }
        } catch (e) {
          console.error("JSON parse error:", e);
        }
      } else if (file.name.endsWith('.html')) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        content = doc.body.innerText || doc.body.textContent || text;
      } else if (file.name.endsWith('.md')) {
        const match = text.match(/^#\s+(.+)$/m);
        if (match) {
          title = match[1].trim();
        }
      }

      newNotes.push({
        id: generateUUID(),
        title,
        content,
        created_at: now,
        updated_at: now,
        deleted: false,
      });
    }

    if (newNotes.length > 0) {
      const updated = [...newNotes, ...notes];
      setNotes(updated);
      saveLocalNotes(updated);
      setActiveNoteId(newNotes[0].id);
      alert(`已成功批量导入 ${newNotes.length} 条笔记！`);
    }
  };

  return (
    <div className="h-screen flex bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white overflow-hidden">
      <Sidebar 
        navState={navState}
        setNavState={(state) => {
          setNavState(state);
          setIsPartitionOpen(true);
        }}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        deviceProfile={deviceProfile}
        applyDevicePreset={applyDevicePreset}
        uiScale={uiScale}
        setUiScale={setUiScale}
        fontSizeLevel={fontSizeLevel}
        setFontSizeLevel={setFontSizeLevel}
      />
      
      <PartitionBar 
        navState={navState}
        isOpen={isPartitionOpen}
        setIsOpen={setIsPartitionOpen}
        notes={notes}
        activeNoteId={activeNoteId}
        setActiveNoteId={setActiveNoteId}
        searchQuery={searchQuery}
        handleCreateNote={handleCreateNote}
        handleDeleteNote={handleDeleteNote}
        updateNote={updateNote}
        selectedTag={selectedTag}
        setSelectedTag={(tag) => {
          setSelectedTag(tag);
          setNavState('notes'); // switch to notes to show results
        }}
        selectedFolder={selectedFolder}
        setSelectedFolder={setSelectedFolder}
        fontSizeLevel={fontSizeLevel}
        setFontSizeLevel={setFontSizeLevel}
        customEvents={customEvents}
        handleExportDatabase={handleExportDatabase}
        handleImportDatabase={handleImportDatabase}
        handleImportNotesFromFiles={handleImportNotesFromFiles}
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        independentTags={independentTags}
        setIndependentTags={setIndependentTags}
        noteTagsMap={noteTagsMap}
        setNoteTagsMap={setNoteTagsMap}
        activeSettingsTab={activeSettingsTab}
        setActiveSettingsTab={setActiveSettingsTab}
      />

      <MainArea 
        navState={navState}
        activeNote={activeNote}
        updateActiveNote={updateActiveNote}
        fontSizeLevel={fontSizeLevel}
        setFontSizeLevel={setFontSizeLevel}
        customEvents={customEvents}
        setCustomEvents={setCustomEvents}
        webdavConfig={webdavConfig}
        setWebdavConfig={setWebdavConfig}
        ftpConfig={ftpConfig}
        setFtpConfig={setFtpConfig}
        uiScale={uiScale}
        setUiScale={setUiScale}
        customFestivals={customFestivals}
        setCustomFestivals={setCustomFestivals}
        notes={notes}
        setNotes={setNotes}
        handleCreateNote={handleCreateNote}
        setActiveNoteId={setActiveNoteId}
        setNavState={setNavState}
        handleExportDatabase={handleExportDatabase}
        handleImportDatabase={handleImportDatabase}
        isPartitionOpen={isPartitionOpen}
        setIsPartitionOpen={setIsPartitionOpen}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        deviceProfile={deviceProfile}
        applyDevicePreset={applyDevicePreset}
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        independentTags={independentTags}
        setIndependentTags={setIndependentTags}
        noteTagsMap={noteTagsMap}
        setNoteTagsMap={setNoteTagsMap}
        activeSettingsTab={activeSettingsTab}
        setActiveSettingsTab={setActiveSettingsTab}
      />
    </div>
  );
}

